import "server-only";
import { callProvider, type AiCallConfig } from "@/lib/ai-call";

// The instruction builder behind the Prompt Configuration card. Describe what
// the assistant should do and it writes the system prompt — the part people
// stare at an empty box over, and the part that decides every reply.

const MAX_TOKENS = 1500;

/** Structure over flourish: a prompt is a spec, not a piece of writing. */
export const PROMPT_BUILDER_MODEL: AiCallConfig = {
  provider: "anthropic",
  model: "claude-sonnet-5",
  api_key_encrypted: null,
  api_base_url: null,
  temperature: 0.4,
  max_tokens: MAX_TOKENS,
};

const SYSTEM = `You write system prompts for WhatsApp customer-service assistants. You return the prompt text itself and nothing else — no preamble, no explanation, no markdown fence, no quotes around it.

The prompt you write is read by an AI that replies to real customers on WhatsApp on behalf of a business.

Write it as:
- One opening line naming who the assistant is and what it handles.
- Then a short list of what it does, one line each, starting with "- ".
- Then a short list of what it must never do, one line each.

Hold to these:
- Address the assistant as "You".
- Be concrete about this business, using only what the description actually says.
- Never invent a business name, prices, delivery times, opening hours, policies or stock. Where the description implies a fact the assistant will need but does not give, write a bracketed placeholder like [your return window] so the owner can see what to fill in.
- Always include a line telling it to hand off to a human rather than guess when it does not know.
- Keep the whole prompt under 250 words. A long prompt is not a better one.
- Plain text only. No headings, no bold, no code fences.
- Write in the language the description is written in.`;

export type BuiltPrompt = { ok: true; prompt: string } | { ok: false; error: string };

/**
 * Never throws — this runs behind a button someone is watching, so every
 * failure comes back as a sentence.
 */
export async function buildInstructions(
  description: string,
  role: string,
  config: AiCallConfig
): Promise<BuiltPrompt> {
  const brief = description.trim();
  if (brief.length < 10) {
    return {
      ok: false,
      error: "Describe what this assistant should do in a sentence or two.",
    };
  }

  const result = await callProvider(config, SYSTEM, [
    {
      role: "user",
      text: role.trim()
        ? `The assistant's role is: ${role.trim()}\n\nWhat it should do:\n${brief}`
        : brief,
    },
  ]);
  if (!result.ok) return { ok: false, error: result.error };

  // Models still wrap the answer in a fence or open with "Here's the prompt:"
  // however firmly you ask them not to.
  const cleaned = result.text
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```\s*$/, "")
    .replace(/^\s*(here(?:'s| is) [^\n:]*:)\s*/i, "")
    .trim();

  if (!cleaned) {
    return { ok: false, error: "The model returned an empty prompt. Try describing it again." };
  }

  return { ok: true, prompt: cleaned };
}
