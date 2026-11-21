// Events from somebody else's system.
//
// Pure: no fetch, no env, no server-only, so the matching and the
// variable filling can be tested rather than discovered on a live
// restaurant's Saturday night.
//
// The shape is deliberately small. An event is a name, a person, and a
// bag of whatever the sender thought was relevant:
//
//   { "event": "order.placed",
//     "contact": { "phone": "+919000000000", "name": "Priya" },
//     "data": { "order_id": "T6-1840", "total": 1840, "table": "T6" } }
//
// Everything else — delays, sequences, letting somebody out — belongs to
// the sequence engine, which already does all of it. A rule that needs
// "and then tomorrow" starts a sequence rather than growing a scheduler
// of its own.

export interface IncomingEvent {
  name: string;
  data: Record<string, unknown>;
}

export type MatchOperator = "equals" | "not_equals" | "contains" | "gt" | "lt" | "exists";

export interface EventRule {
  eventName: string;
  matchField?: string | null;
  matchOperator?: MatchOperator | null;
  matchValue?: string | null;
}

/** The operators a condition can use, as the builder offers them. */
export const MATCH_OPERATORS: Array<{ key: MatchOperator; label: string }> = [
  { key: "equals", label: "is" },
  { key: "not_equals", label: "is not" },
  { key: "contains", label: "contains" },
  { key: "gt", label: "is more than" },
  { key: "lt", label: "is less than" },
  { key: "exists", label: "has any value" },
];

/**
 * An event name, cleaned up.
 *
 * Lower-cased and trimmed, because "Order.Placed" and "order.placed" are
 * the same event to everybody except a string comparison — and the two
 * systems either side of this are written by different people.
 */
export function normaliseEventName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

/** Why this event cannot be accepted, or null when it can. */
export function eventProblem(body: unknown): string | null {
  if (!body || typeof body !== "object") return "The request body has to be a JSON object.";

  const input = body as Record<string, unknown>;
  const name = normaliseEventName(input.event ?? input.name);
  if (!name) return "Give the event a name, such as \"order.placed\".";
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    return "An event name can use lowercase letters, numbers, dots, dashes and underscores.";
  }

  if (input.data !== undefined && (typeof input.data !== "object" || Array.isArray(input.data))) {
    return "\"data\" has to be an object, if it is there at all.";
  }

  return null;
}

/**
 * One value out of the event, by a dotted path.
 *
 * `data.total` and `total` both reach the same place, because half the
 * people writing the sending end will leave the prefix off and being
 * strict about it buys nothing.
 */
export function valueAt(event: IncomingEvent, path: string): string | undefined {
  const clean = String(path ?? "").trim();
  if (!clean) return undefined;

  if (clean === "event" || clean === "event.name") return event.name;

  const parts = (clean.startsWith("data.") ? clean.slice(5) : clean).split(".");

  let current: unknown = event.data;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  if (current === null || current === undefined) return undefined;
  if (typeof current === "object") return JSON.stringify(current);
  return String(current);
}

/** Whether this rule's condition is satisfied by this event. */
export function ruleMatches(rule: EventRule, event: IncomingEvent): boolean {
  if (normaliseEventName(rule.eventName) !== normaliseEventName(event.name)) return false;

  const field = (rule.matchField ?? "").trim();
  const operator = rule.matchOperator ?? null;

  // No condition means the name alone is the condition, which is what
  // most rules want.
  if (!field || !operator) return true;

  const actual = valueAt(event, field);
  const expected = (rule.matchValue ?? "").trim();

  switch (operator) {
    case "exists":
      return actual !== undefined && actual.trim() !== "";
    case "equals":
      return (actual ?? "").trim().toLowerCase() === expected.toLowerCase();
    case "not_equals":
      return (actual ?? "").trim().toLowerCase() !== expected.toLowerCase();
    case "contains":
      return (actual ?? "").toLowerCase().includes(expected.toLowerCase());
    case "gt":
      return numeric(actual) > numeric(expected);
    case "lt":
      return numeric(actual) < numeric(expected);
    default:
      return false;
  }
}

/**
 * A number out of a value people wrote by hand.
 *
 * "₹1,840" and "1840.00" are both one thousand eight hundred and forty,
 * and a rule that fires on orders over a thousand has to agree.
 */
function numeric(value: string | undefined): number {
  const stripped = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number.parseFloat(stripped);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * A template's blanks, filled from the event.
 *
 * This is the thing a campaign cannot do. A campaign's variables are one
 * set of values shared by everybody in it, so it can never say a
 * customer's own name. An event is about one person, so "{{data.name}}"
 * here is that person's name and nobody else's.
 *
 * A token that resolves to nothing becomes an empty string, and the
 * caller refuses the send rather than delivering a sentence with a hole
 * in it — Meta rejects a blank parameter anyway, and a refusal that
 * names the missing field is worth more than its error.
 */
export function fillFromEvent(values: readonly string[], event: IncomingEvent): string[] {
  return values.map((value) =>
    String(value ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, path: string) => {
      const found = valueAt(event, path);
      return found === undefined ? "" : found;
    })
  );
}

/** Which filled values came out empty, so a refusal can name them. */
export function missingValues(filled: readonly string[], source: readonly string[]): string[] {
  const missing: string[] = [];
  filled.forEach((value, index) => {
    if (value.trim()) return;
    const token = String(source[index] ?? "").trim();
    missing.push(token || `value ${index + 1}`);
  });
  return missing;
}

/**
 * A phone number out of whatever the sender called it.
 *
 * Every till in the country calls this something different, and an
 * integration that fails because the field was "mobile" rather than
 * "phone" is one that gets abandoned at the first try.
 */
export function phoneIn(body: Record<string, unknown>): string {
  const contact = (body.contact ?? {}) as Record<string, unknown>;
  const candidates = [
    contact.phone, contact.wa_id, contact.waId, contact.mobile, contact.number, contact.whatsapp,
    body.phone, body.wa_id, body.waId, body.mobile, body.number, body.whatsapp,
  ];
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

/** The person's name, under any of the usual spellings. */
export function nameIn(body: Record<string, unknown>): string {
  const contact = (body.contact ?? {}) as Record<string, unknown>;
  for (const candidate of [contact.name, contact.full_name, contact.fullName, body.name]) {
    const value = String(candidate ?? "").trim();
    if (value) return value;
  }
  return "";
}

/** How an event reads in the log. */
export function describeOutcome(outcome: string, matched: number): string {
  if (outcome === "matched") {
    return matched === 1 ? "1 automation ran" : `${matched} automations ran`;
  }
  if (outcome === "no_match") return "No automation is listening for this";
  if (outcome === "failed") return "Something went wrong";
  if (outcome === "ignored") return "Skipped";
  return "Received";
}
