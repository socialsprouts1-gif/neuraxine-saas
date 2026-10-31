// Why a campaign's recipients failed, said out loud.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Every send already records its reason on the recipient row — a full
// sentence built from Meta's own words by describeMetaError. None of it
// was ever shown. A campaign read "0 / 5 · 5 failed" and stopped there,
// which is the worst possible amount of information: enough to know
// something is wrong, not enough to do anything about it, and easy to
// read as "this product does not work" rather than "the account needs a
// payment method".
//
// Five recipients rarely fail for five reasons. They fail for one reason,
// five times. So the useful shape is the distinct reasons with a count
// each, not a list of five identical sentences.

export interface FailedRecipient {
  error: string | null;
}

export interface FailureReason {
  reason: string;
  count: number;
}

const UNKNOWN = "No reason was recorded. Re-running the campaign will capture one.";

/**
 * Distinct reasons, commonest first.
 *
 * Ties keep the order they were first seen, so a re-render does not
 * shuffle two equally common reasons past each other.
 */
export function summariseFailures(rows: readonly FailedRecipient[]): FailureReason[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const reason = row.error?.trim() || UNKNOWN;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

/**
 * The one line to store on the campaign itself.
 *
 * A campaign row has room for a sentence, not a table. When everything
 * failed the same way that sentence is the whole story; when it did not,
 * saying so is better than picking one and implying it was the only one.
 */
export function rollUpFailure(rows: readonly FailedRecipient[]): string | null {
  const reasons = summariseFailures(rows);
  if (reasons.length === 0) return null;

  const [first] = reasons;
  if (reasons.length === 1) return first.reason;

  const others = reasons.length - 1;
  return `${first.reason} (${first.count} of ${rows.length}; ${others} other reason${others === 1 ? "" : "s"} on the rest)`;
}

/**
 * Whether every failure here is something the account owner fixes once,
 * rather than something about a particular recipient.
 *
 * Worth telling apart. "This number is not on WhatsApp" is one bad row in
 * a list; "the business has no payment method" is the whole campaign, and
 * every future one, and it wants a different sentence above it.
 */
const ACCOUNT_WIDE = [
  /payment method/i,
  /billing problem/i,
  /not been verified/i,
  /business verification/i,
  /integrity/i,
  /account.{0,20}restrict/i,
  /not registered for the Cloud API/i,
  /access token/i,
];

export function isAccountWide(reason: string): boolean {
  return ACCOUNT_WIDE.some((pattern) => pattern.test(reason));
}

/**
 * One sentence above the list of reasons.
 *
 * Nothing sent and one account-wide cause means the campaign never had a
 * chance, and no amount of re-running changes that — which is the thing
 * somebody staring at two completed-but-empty campaigns needs told.
 */
export function describeOutcome(sent: number, reasons: readonly FailureReason[]): string | null {
  if (reasons.length === 0) return null;

  const accountWide = reasons.filter((entry) => isAccountWide(entry.reason));

  if (sent === 0 && accountWide.length > 0) {
    return "Nothing went out, and the reason is the WhatsApp account rather than the list. Re-running will fail the same way until it is fixed in Meta.";
  }

  if (sent === 0) {
    return "Nothing went out. The reasons below came back from WhatsApp for each recipient.";
  }

  return "Some went out. These are the ones that did not, and why.";
}
