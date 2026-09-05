import "server-only";
import { callProvider, resolveApiKey } from "@/lib/ai-call";
import { isWithinWorkingHours } from "@/lib/working-hours";
import type { AiAssistant, AssistantKnowledge } from "@/types/portal";

// The AI Assistant reply path. Everything else in the runner answers from
// rules the customer wrote; this is the fallback that answers anything
// else, in the assistant's configured voice, through whichever provider
// the tenant chose and paid for.

// WhatsApp rejects a text body over 4096 characters. Cap generation well
// under it rather than truncating mid-sentence at send time.
export const WHATSAPP_TEXT_LIMIT = 4096;

// How much reference material may ride along with a reply. Beyond this the
// prompt costs more than the answer is worth, and the model starts skimming.
const KNOWLEDGE_BUDGET_CHARS = 12_000;

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantContext {
  assistant: AiAssistant;
  orgName: string;
  contactName?: string | null;
  /** Oldest first. The incoming message must be the last entry. */
  history: AssistantTurn[];
  /** Active entries only. Ignored when use_knowledge_base is off. */
  knowledge?: AssistantKnowledge[];
  /** Injectable for tests; defaults to now. */
  now?: Date;
}

export type AssistantReply =
  /** Send this. */
  | { status: "replied"; text: string }
  /** Deliberately silent — off duty, nothing to reply to. Not an error. */
  | { status: "skipped"; reason: string }
  /** Something broke. The reason names the fix. */
  | { status: "failed"; error: string };

/** Whether this assistant has a key to call its provider with. */
export function isAssistantConfigured(assistant?: AiAssistant): boolean {
  if (!assistant) return Boolean(process.env.ANTHROPIC_API_KEY);
  return resolveApiKey(assistant) !== null;
}

function buildSystemPrompt({
  assistant,
  orgName,
  contactName,
  knowledge,
}: AssistantContext): string {
  const parts = [
    `You are ${assistant.name}, the ${assistant.role} for ${orgName}.`,
    "You are replying inside a WhatsApp conversation with a real customer.",
  ];

  if (assistant.system_prompt.trim()) {
    parts.push("", "Instructions from the business:", assistant.system_prompt.trim());
  }

  if (contactName) {
    parts.push("", `The customer's name is ${contactName}.`);
  }

  const reference = assistant.use_knowledge_base ? formatKnowledge(knowledge ?? []) : "";
  if (reference) {
    parts.push(
      "",
      "Reference information you may use. Treat it as the only source of fact about this business:",
      reference
    );
  }

  parts.push(
    "",
    "How to write:",
    "- Keep replies short — two or three sentences is usually right. This is a chat, not an email.",
    "- Plain text only. WhatsApp does not render markdown, so no headings, bullets, tables or code fences.",
    "- Answer in the language the customer wrote in.",
    "- Never invent prices, stock, order status, delivery dates or policies. If you were not told it, say you will check with the team.",
    "- Do not claim to have performed an action you cannot perform, such as placing an order or issuing a refund.",
    "- If the customer needs a human, say a team member will follow up rather than guessing."
  );

  return parts.join("\n");
}

/**
 * Knowledge entries as one block, newest-first until the budget runs out.
 * Truncation is per-entry so a single long document can't crowd out every
 * other entry entirely.
 */
function formatKnowledge(entries: AssistantKnowledge[]): string {
  const usable = entries.filter((entry) => entry.is_active && entry.content.trim());
  if (usable.length === 0) return "";

  const perEntry = Math.max(400, Math.floor(KNOWLEDGE_BUDGET_CHARS / usable.length));
  const blocks: string[] = [];
  let used = 0;

  for (const entry of usable) {
    if (used >= KNOWLEDGE_BUDGET_CHARS) break;
    const content = entry.content.trim().slice(0, perEntry);
    const block = `### ${entry.title}\n${content}`;
    blocks.push(block);
    used += block.length;
  }

  return blocks.join("\n\n");
}

/**
 * Generates one reply for an inbound message.
 *
 * Never throws: a failed generation should log a bot_run and leave the
 * message for a human, not break webhook processing.
 */
export async function generateAssistantReply(
  context: AssistantContext
): Promise<AssistantReply> {
  const { assistant } = context;

  if (!isWithinWorkingHours(assistant, context.now ?? new Date())) {
    const message = assistant.off_hours_message.trim();
    return message
      ? { status: "replied", text: message.slice(0, WHATSAPP_TEXT_LIMIT) }
      : { status: "skipped", reason: "Outside the assistant's working hours." };
  }

  // memory_turns 0 means "answer this message with no history at all".
  const depth = Math.max(1, assistant.memory_turns || 1);
  const turns = context.history.slice(-depth).filter((turn) => turn.text.trim());
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return { status: "skipped", reason: "No inbound message to reply to." };
  }

  const generated = await callProvider(assistant, buildSystemPrompt(context), turns);
  if (!generated.ok) return { status: "failed", error: generated.error };

  const trimmed = generated.text.trim();
  if (!trimmed) return { status: "failed", error: "The assistant returned an empty reply." };
  return { status: "replied", text: trimmed.slice(0, WHATSAPP_TEXT_LIMIT) };
}
