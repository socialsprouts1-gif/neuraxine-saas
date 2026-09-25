// Reading the answers a customer submitted through a WhatsApp Flow.
//
// The payload arrives on the ordinary messages webhook as an interactive
// message, and the answers are nested two levels down as a JSON *string*.
// Treating that string as an already-parsed object is the easy mistake: it
// stringifies to "[object Object]" and the submission is lost with no error
// anywhere.

export interface FlowReply {
  /** The token we generated when sending, identifying who this is from. */
  token: string | null;
  answers: Record<string, unknown>;
}

export function readFlowReply(content: unknown): FlowReply | null {
  const reply = (content as { nfm_reply?: { response_json?: unknown } } | null)?.nfm_reply;
  if (!reply || typeof reply.response_json !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.response_json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const answers = { ...(parsed as Record<string, unknown>) };
  const token = typeof answers.flow_token === "string" ? answers.flow_token : null;
  // The token is routing, not an answer — keeping it would show up as a
  // field in the response summary.
  delete answers.flow_token;

  return { token, answers };
}

/**
 * A flow answer as a line of text.
 *
 * Checkbox groups arrive as arrays and opt-ins as booleans, so a plain
 * String() would render "true" and "a,b" — neither of which reads as an
 * answer to a person looking at the inbox.
 */
export function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((entry) => String(entry)).join(", ") : "—";
  }
  const text = String(value).trim();
  return text || "—";
}
