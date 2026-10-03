// Turning a model's answer about a conversation into something safe to store
// and render. Pure, so the clamping can be tested without a provider call —
// this is the layer between an untrusted reply and the database.

export interface ConversationAnalysis {
  score: number;
  reasons: string[];
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
  summary: string;
  nextAction: string;
  needsHuman: boolean;
  needsHumanReason: string | null;
}

export const INTENTS = [
  "Pricing",
  "Product Enquiry",
  "Support",
  "Complaint",
  "Demo Request",
  "Appointment",
  "Order",
  "Refund",
  "Interested",
  "Not Interested",
  "Spam",
  "Other",
] as const;

/** Clamps and defaults everything, so a partial answer still renders. */
export function normalise(raw: Record<string, unknown>): ConversationAnalysis {
  const score = Number(raw.score);
  const sentiment = String(raw.sentiment ?? "neutral").toLowerCase();
  const intent = String(raw.intent ?? "Other").trim();

  return {
    score: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0,
    reasons: Array.isArray(raw.reasons)
      ? raw.reasons.map((reason) => String(reason).trim()).filter(Boolean).slice(0, 6)
      : [],
    // An intent outside the list would render as a label nothing filters on.
    intent: (INTENTS as readonly string[]).includes(intent) ? intent : "Other",
    sentiment:
      sentiment === "positive" || sentiment === "negative"
        ? (sentiment as "positive" | "negative")
        : "neutral",
    summary: String(raw.summary ?? "").trim(),
    nextAction: String(raw.nextAction ?? "").trim(),
    needsHuman: raw.needsHuman === true,
    needsHumanReason:
      raw.needsHumanReason && String(raw.needsHumanReason).trim()
        ? String(raw.needsHumanReason).trim()
        : null,
  };
}

/** Models fence their JSON or open with a sentence however firmly you ask. */
export function parseObject(text: string): Record<string, unknown> | null {
  const candidates: string[] = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(text);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate.trim());
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

