// Which messages send themselves, and what they are called.
//
// Pure: no database, no env, no server-only. The list below is the whole
// vocabulary of automatic mail in this product, and keeping it here means
// a screen can render it, a sweep can check it and a test can assert on it
// without any of them agreeing on a string literal.
//
// The switches exist because wording is not the only marketing decision an
// operator needs to make. "Stop chasing people whose trial ended" is a
// perfectly reasonable thing to want, and before this the only way to do
// it was to edit the source and deploy.

export interface AutomaticKind {
  kind: string;
  label: string;
  /** What triggers it, in a sentence somebody can act on. */
  when: string;
  /**
   * Whether it may be switched off.
   *
   * A receipt may not. Somebody who paid is owed a record of it, and a
   * product that can be configured to take money silently is one nobody
   * should run. The sign-up code is not even on this list: a code that
   * can be switched off is an account that cannot be created.
   */
  canSwitchOff: boolean;
  /** The placeholders this message can fill in, beyond the shared ones. */
  variables: string[];
}

export const AUTOMATIC_KINDS: AutomaticKind[] = [
  {
    kind: "welcome",
    label: "Welcome",
    when: "Once, when a workspace is created.",
    canSwitchOff: true,
    variables: ["trial_days"],
  },
  {
    kind: "trial_ending",
    label: "Trial countdown",
    when: "Every day from six days left down to one.",
    canSwitchOff: true,
    variables: ["days_left"],
  },
  {
    kind: "trial_expired",
    label: "Trial ended",
    when: "On the day the trial runs out.",
    canSwitchOff: true,
    variables: ["price"],
  },
  {
    kind: "trial_followup",
    label: "Trial follow-up",
    when: "Every three days for a month after the trial ends, then weekly.",
    canSwitchOff: true,
    variables: ["days_since", "price"],
  },
  {
    kind: "renewal_reminder",
    label: "Renewal reminder",
    when: "Three days before a paid plan renews.",
    canSwitchOff: true,
    variables: ["plan", "days_left", "renews_on"],
  },
  {
    kind: "subscription_expired",
    label: "Subscription ended",
    when: "When a paid plan lapses without renewing.",
    canSwitchOff: true,
    variables: ["plan"],
  },
  {
    kind: "first_chatbot",
    label: "First chatbot built",
    when: "Once, the first time a workspace saves a bot.",
    canSwitchOff: true,
    variables: ["bot_name"],
  },
  {
    kind: "payment_received",
    label: "Payment receipt",
    when: "Every time a payment succeeds.",
    canSwitchOff: false,
    variables: ["plan", "amount"],
  },
];

export const AUTOMATIC_BY_KIND = new Map(AUTOMATIC_KINDS.map((row) => [row.kind, row]));

export type Switches = Record<string, boolean>;

/**
 * What is switched on, read from a stored settings value.
 *
 * Missing means on. A deployment that has never opened the screen sends
 * everything, which is what it did before the screen existed — a new
 * setting must never silently stop mail that was already going out.
 *
 * Anything that cannot be switched off is forced on here rather than
 * trusted to be absent: a hand-edited settings row saying
 * payment_received is false should not be able to swallow a receipt.
 */
export function readSwitches(value: unknown): Switches {
  const stored =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const out: Switches = {};
  for (const row of AUTOMATIC_KINDS) {
    out[row.kind] = row.canSwitchOff ? stored[row.kind] !== false : true;
  }
  return out;
}

/** Whether this kind may go out. Anything not on the list is unaffected. */
export function isOn(switches: Switches, kind: string): boolean {
  if (!AUTOMATIC_BY_KIND.has(kind)) return true;
  return switches[kind] !== false;
}

/** What a form of checkboxes means. Unticked boxes are simply absent. */
export function switchesFromTicked(ticked: readonly string[]): Switches {
  const on = new Set(ticked);
  const out: Switches = {};
  for (const row of AUTOMATIC_KINDS) {
    out[row.kind] = row.canSwitchOff ? on.has(row.kind) : true;
  }
  return out;
}

/** "3 off" for the screen, or null when everything is sending. */
export function offSummary(switches: Switches): string | null {
  const off = AUTOMATIC_KINDS.filter((row) => switches[row.kind] === false);
  if (off.length === 0) return null;
  return off.map((row) => row.label).join(", ");
}
