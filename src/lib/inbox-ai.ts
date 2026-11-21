import "server-only";
import { callProvider, type AiCallConfig, type AiTurn } from "@/lib/ai-call";
import {
  INTENTS,
  normalise,
  parseObject,
  type ConversationAnalysis,
} from "@/lib/conversation-analysis";

// The copilot behind the inbox: it drafts, rewrites, translates and reads a
// conversation. It never sends — every path here returns text for a human to
// look at, and the only thing that puts a message on WhatsApp is the send
// endpoint, called by a person pressing Send.

const REPLY_TOKENS = 700;
const ANALYSIS_TOKENS = 1200;

/** The rig the copilot runs on when the org has no assistant of its own. */
export const COPILOT_MODEL: AiCallConfig = {
  provider: "anthropic",
  model: "claude-sonnet-5",
  api_key_encrypted: null,
  api_base_url: null,
  temperature: 0.5,
  max_tokens: REPLY_TOKENS,
};

export interface CopilotContext {
  orgName: string;
  contactName: string | null;
  /** Oldest first. */
  history: AiTurn[];
  /** What the business told its assistant to be, if it has one. */
  instructions?: string;
  /** Active knowledge-base entries, already trimmed by the caller. */
  knowledge?: string;
}

export type CopilotResult = { ok: true; text: string } | { ok: false; error: string };

// The floor under everything the copilot writes. These are not style notes —
// each one is a way a support bot can cost a business real money or trust.
const GROUND_RULES = [
  "Never invent a price, a discount, a delivery time, stock, a policy, a feature or an integration. If you were not told it, say you will check.",
  "Never say something has been done — an order placed, a refund issued, an appointment booked, a message sent — unless the conversation shows it happened.",
  "Never promise guaranteed sales, guaranteed leads or a guaranteed return.",
  "Never ask for a password, an OTP, an API key or card details. There is no reason a support chat needs any of them.",
  'If you do not know, say exactly: "I don\'t have that information available right now. Let me connect you with our team." Do not pad it out.',
].map((rule) => `- ${rule}`).join("\n");

function businessContext(context: CopilotContext): string {
  const parts = [`You are helping a support agent at ${context.orgName} reply on WhatsApp.`];
  if (context.contactName) parts.push(`The customer's name is ${context.contactName}.`);
  if (context.instructions?.trim()) {
    parts.push("", "How this business wants its assistant to behave:", context.instructions.trim());
  }
  if (context.knowledge?.trim()) {
    parts.push(
      "",
      "Reference information. Treat this as the only source of fact about the business:",
      context.knowledge.trim()
    );
  }
  return parts.join("\n");
}

function config(base: AiCallConfig, maxTokens: number, temperature: number): AiCallConfig {
  return { ...base, max_tokens: maxTokens, temperature };
}

/** Drafts the next reply. Returned to the composer, never sent. */
export async function suggestReply(
  context: CopilotContext,
  base: AiCallConfig
): Promise<CopilotResult> {
  const system = [
    businessContext(context),
    "",
    "Write the single next message the agent should send. Output only that message — no preamble, no quotes around it, no explanation.",
    "",
    "How to write it:",
    "- Two or three sentences. This is a chat, not an email.",
    "- Plain text. WhatsApp renders no markdown.",
    "- Reply in the language the customer wrote in, including Hinglish if that is what they used.",
    "- Where a fact belongs that you were not given, write it as a bracketed placeholder like [our current price] so the agent can see what to fill in before sending.",
    "",
    "Rules you must not break:",
    GROUND_RULES,
  ].join("\n");

  return run(config(base, REPLY_TOKENS, 0.6), system, context.history);
}

export type RewriteStyle = "shorter" | "professional" | "friendly" | "sales";

const REWRITE_BRIEF: Record<RewriteStyle, string> = {
  shorter: "Cut it to the shortest version that still says everything it said. Remove filler, not facts.",
  professional: "Make it professional and precise. Keep it warm — professional is not cold.",
  friendly: "Make it warmer and more conversational. One emoji at most, and only if it fits.",
  sales:
    "Make it a sales reply: acknowledge what they want, connect it to what is on offer, and end with one clear next step. Do not pressure anyone.",
};

/** Rewrites the agent's own draft. Facts in, same facts out. */
export async function rewriteDraft(
  draft: string,
  style: RewriteStyle,
  context: CopilotContext,
  base: AiCallConfig
): Promise<CopilotResult> {
  if (!draft.trim()) return { ok: false, error: "Write something first, then ask AI to rework it." };

  const system = [
    businessContext(context),
    "",
    `Rewrite the agent's draft. ${REWRITE_BRIEF[style]}`,
    "Output only the rewritten message — no preamble, no quotes, no explanation.",
    "",
    "Keep every fact the draft contains and add none. If the draft names a price or a date, keep it exactly; if it does not, do not introduce one.",
    "Stay in the language the draft is written in.",
    "",
    "Rules you must not break:",
    GROUND_RULES,
  ].join("\n");

  return run(config(base, REPLY_TOKENS, 0.4), system, [{ role: "user", text: draft }]);
}

/** Translates in either direction — the customer's message or the agent's. */
export async function translate(
  text: string,
  target: string,
  base: AiCallConfig
): Promise<CopilotResult> {
  if (!text.trim()) return { ok: false, error: "There is nothing to translate." };

  const system = [
    `Translate the text into ${target}.`,
    "Output only the translation — no preamble, no notes, no transliteration unless the target is a script the text is already in.",
    "Keep the tone and the register. Keep names, numbers, prices and product names exactly as they are.",
    "Translate nothing that is already in the target language — return it unchanged.",
  ].join("\n");

  return run(config(base, REPLY_TOKENS, 0.2), system, [{ role: "user", text }]);
}

// --- conversation analysis -------------------------------------------------

export type { ConversationAnalysis } from "@/lib/conversation-analysis";

const ANALYSIS_SYSTEM = `You read a WhatsApp conversation between a business and a customer and return one JSON object. No prose, no markdown fence.

{
  "score": 0-100,
  "reasons": ["short phrase", "…"],
  "intent": "one of: ${INTENTS.join(", ")}",
  "sentiment": "positive" | "neutral" | "negative",
  "summary": "2-4 short sentences",
  "nextAction": "one short imperative, e.g. Book a demo",
  "needsHuman": true | false,
  "needsHumanReason": "one short phrase, or null"
}

Scoring — how likely this person is to buy, judged only on what they actually said:
- 80-100: named a real need, gave scale or budget, asked for pricing or a demo.
- 50-79: engaged and asking real questions, but no commitment signal yet.
- 20-49: browsing, vague, or only one message in.
- 0-19: not interested, wrong number, or spam.
Each reason is a short phrase naming something they did — "asked pricing", "requested demo", "shared team size". Three to five of them. Never invent one.

needsHuman is true when the conversation is past what a bot should handle:
- they asked for a person or a manager
- they are angry or complaining
- a refund, a cancellation or a billing dispute
- negotiating price
- a technical problem the conversation shows nobody has answered
- anything legal, medical, financial or otherwise sensitive
Otherwise false, with a null reason.

The summary is for a salesperson opening this thread cold. What the customer does, what they want, what they asked for. No filler, no restating the greeting.

nextAction is the single most useful thing to do next. One action, not a list.

Base everything only on what is in the conversation. Never infer a budget, a company size, a location or an intent that was not stated.`;

/**
 * Reads a thread and returns the score, intent, sentiment, summary and next
 * action in one call — one round trip rather than five, and the parts stay
 * consistent with each other.
 *
 * Never throws; a bad model reply comes back as an error sentence.
 */
export async function analyzeConversation(
  context: CopilotContext,
  base: AiCallConfig
): Promise<{ ok: true; analysis: ConversationAnalysis } | { ok: false; error: string }> {
  if (context.history.length === 0) {
    return { ok: false, error: "There is nothing to analyse in this conversation yet." };
  }

  const transcript = context.history
    .map((turn) => `${turn.role === "user" ? "Customer" : "Business"}: ${turn.text}`)
    .join("\n");

  const result = await run(config(base, ANALYSIS_TOKENS, 0.2), ANALYSIS_SYSTEM, [
    { role: "user", text: transcript },
  ]);
  if (!result.ok) return result;

  const parsed = parseObject(result.text);
  if (!parsed) {
    return { ok: false, error: "The model did not return a readable analysis. Try again." };
  }

  return { ok: true, analysis: normalise(parsed) };
}

async function run(
  cfg: AiCallConfig,
  system: string,
  turns: AiTurn[]
): Promise<CopilotResult> {
  const result = await callProvider(cfg, system, turns);
  if (!result.ok) return result;

  const cleaned = result.text
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```\s*$/, "")
    .trim();

  if (!cleaned) return { ok: false, error: "The model returned nothing. Try again." };
  return { ok: true, text: cleaned };
}
