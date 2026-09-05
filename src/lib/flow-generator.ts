import "server-only";
import { callProvider, type AiCallConfig } from "@/lib/ai-call";
import { MAX_NODES, parseJsonObject, validateGraph, type RepairResult } from "@/lib/flow-graph-repair";
import { NODE_DEFS } from "@/types/flow";

// "Describe the bot and it builds it." The model returns a graph in the same
// vocabulary the canvas and the runtime already share, so what comes back is
// a real flow you can open, edit and ship — not a sketch to retype.

export type GeneratedFlow = RepairResult;

// Enough for a twenty-node flow with full message copy.
const MAX_TOKENS = 8000;

/** The default rig when the org has no assistant of its own configured. */
export const PLATFORM_FLOW_MODEL: AiCallConfig = {
  provider: "anthropic",
  model: "claude-sonnet-5",
  api_key_encrypted: null,
  api_base_url: null,
  // Structure, not prose. A high temperature here invents node kinds.
  temperature: 0.2,
  max_tokens: MAX_TOKENS,
};

function buildSystemPrompt(): string {
  // Generated from NODE_DEFS rather than written out, so a node added to the
  // builder is one the generator can immediately use, and one removed can
  // never be produced.
  const vocabulary = NODE_DEFS.map((def) => {
    const keys = Object.entries(def.defaults)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(", ");
    const status =
      def.runtime === "ready" ? "" : `  [AVOID — ${def.runtime.replace(/_/g, " ")}]`;
    return `- ${def.kind} — ${def.description}\n  data: { ${keys} }${status}`;
  }).join("\n");

  return `You design WhatsApp chatbot flows. You return one JSON object and nothing else — no prose, no markdown fence.

Shape:
{
  "name": "short bot name",
  "nodes": [{ "id": "n1", "kind": "on_message", "data": { ... } }],
  "edges": [{ "source": "n1", "target": "n2", "sourceHandle": null }]
}

Node types and the exact data keys each one takes:
${vocabulary}

Rules that make the difference between a flow that runs and one that doesn't:
- Exactly one on_message node, and it is the first node. Put the trigger words in its data.keywords array, lowercase.
- Give every node a short id like n1, n2. Never reuse one. Do not include "position" — it is laid out for you.
- send_buttons takes at most 3 buttons, each { "id": "b1", "title": "≤20 chars" }. Its edges must set sourceHandle to a button id, or that button leads nowhere.
- send_list takes sections: [{ "title": "...", "rows": [{ "id": "r1", "title": "≤24 chars", "description": "..." }] }]. Edges from it set sourceHandle to a row id.
- condition has exactly two outlets: sourceHandle "true" and sourceHandle "false". Wire both.
- Every other node has one outlet — sourceHandle null.
- ask_question stores the reply in data.variable. Use it later as {{variable}} in any body text.
- Wire every outlet you create. An unwired button is a dead end that silently ends the conversation, which is the single most common way these flows fail.
- End paths that need a person on a handoff node. End paths that are simply finished on stop_bot.
- Prefer node types marked ready. Only use an AVOID one if the request cannot be served without it.
- At most ${MAX_NODES} nodes.

Writing the messages:
- Plain text. WhatsApp renders no markdown — no headings, bullets, tables or code fences.
- Short. Two or three sentences per message is right for chat.
- Write in the language the request is written in.
- Never invent prices, delivery times, stock or policies. Where a real detail belongs, write a clear placeholder in square brackets, e.g. [your opening hours].`;
}

/**
 * Generates a flow from a plain-language description.
 *
 * Never throws — a bad generation returns a sentence, because this runs
 * behind a button someone is watching.
 */
export async function generateFlow(
  description: string,
  config: AiCallConfig
): Promise<GeneratedFlow> {
  const brief = description.trim();
  if (brief.length < 10) {
    return { ok: false, error: "Describe the bot in a sentence or two so there is something to build from." };
  }

  const result = await callProvider(config, buildSystemPrompt(), [
    { role: "user", text: brief },
  ]);
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = parseJsonObject(result.text);
  if (!parsed) {
    return {
      ok: false,
      error: "The model did not return a usable flow. Try describing the bot again, a little more concretely.",
    };
  }

  return validateGraph(parsed, brief);
}

