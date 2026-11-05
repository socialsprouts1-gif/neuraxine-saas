// Drip campaigns — a sequence of follow-ups that each contact walks
// through on their own clock.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// The difference from a campaign, which is the whole reason this is a
// separate thing rather than a checkbox on that one: a campaign picks an
// audience now and sends to all of them together. A drip has no audience.
// People join it one at a time — by messaging a keyword, by an agent
// adding them, by an API call from a website form — and each one is at a
// different point in the sequence at any moment. Somebody who joins on
// Thursday gets step one on Thursday and step two on Friday, while
// somebody who joined on Monday is already at step four.
//
// So the unit of state is the enrolment, not the campaign: one row per
// person per sequence, carrying which step they are on and when the next
// one is due. Everything here is about moving that row forward.
//
// The wait belongs to the step it is written on, and means "after this
// one, before the next". Step one therefore sends the moment somebody
// joins — there is nothing to wait for yet — and the last step's wait is
// never read, because nothing follows it.

/** How people get into a sequence. */
export const TRIGGERS = [
  {
    key: "manual",
    label: "Manual",
    hint: "You add people yourself, from Contacts or from this screen.",
  },
  {
    key: "keyword",
    label: "Keyword",
    hint: "Anybody who messages one of your words joins automatically.",
  },
  {
    key: "api",
    label: "API",
    hint: "Your website or CRM enrols people by calling the endpoint.",
  },
] as const;

export type TriggerType = (typeof TRIGGERS)[number]["key"];

export function isTrigger(value: unknown): value is TriggerType {
  return TRIGGERS.some((trigger) => trigger.key === value);
}

/** How the gap before the next step is expressed. */
export type WaitKind = "duration" | "time_of_day";

export const MAX_STEPS = 10;

/** A day in minutes, named because it is used as a unit rather than a count. */
const DAY = 24 * 60;

export interface DripStep {
  stepIndex: number;
  templateId: string | null;
  variables: string[];
  /** The gap *after* this step. Ignored on the last one. */
  waitKind: WaitKind;
  /** For "duration": how long to wait. */
  waitMinutes: number;
  /** For "time_of_day": minutes past midnight, 0–1439. */
  sendAtMinutes: number;
  /** For "time_of_day": how many days later, 0 meaning the same day. */
  sendAtDays: number;
}

export interface DripSettings {
  trigger: TriggerType;
  /** Lower-cased, for the keyword trigger. */
  triggerKeywords: string[];
  exitOnKeyword: boolean;
  exitKeywords: string[];
  /**
   * Whether any reply at all takes somebody out.
   *
   * Separate from the keyword list because they answer different
   * questions: a nurture sequence wants to stop the moment a human is
   * talking, and a reminder sequence wants to keep going until the thing
   * is actually done.
   */
  exitOnReply: boolean;
  /**
   * What to do when somebody joins after a timed step's hour has passed.
   *
   * On: that step is skipped. Off: it goes at the next occurrence, which
   * is tomorrow. Neither is right for everybody — "your table is ready at
   * 7pm" should be skipped, "day two of the course" should not.
   */
  skipMissedSteps: boolean;
  /** IANA zone the timed steps are read in. */
  timeZone: string;
}

export const DEFAULT_SETTINGS: DripSettings = {
  trigger: "manual",
  triggerKeywords: [],
  exitOnKeyword: false,
  exitKeywords: [],
  exitOnReply: false,
  skipMissedSteps: false,
  timeZone: "Asia/Kolkata",
};

// --- keywords --------------------------------------------------------------

/**
 * The keyword list, cleaned up.
 *
 * Lower-cased and de-duplicated, because they are matched against
 * lower-cased incoming text and a list holding both "Hi" and "hi" would
 * read as two chances to join.
 */
export function normaliseKeywords(values: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const word = String(value ?? "")
      .trim()
      .toLowerCase();
    if (word) seen.add(word);
  }
  return [...seen];
}

/**
 * Whether an incoming message carries one of these keywords.
 *
 * Exact by default — the whole message has to be the word. "Stop" ending a
 * sequence is right; the word "stop" inside "don't stop sending me these"
 * ending it is not, and that sentence is one somebody actually sends.
 */
export function matchesKeyword(
  text: string | null | undefined,
  keywords: readonly string[],
  exact = true
): boolean {
  const body = String(text ?? "")
    .trim()
    .toLowerCase();
  if (!body || keywords.length === 0) return false;

  if (exact) return keywords.includes(body);
  return keywords.some((word) => body.includes(word));
}

// --- when the next step is due --------------------------------------------

export interface NextStep {
  /** When to send it, or null when this step is skipped outright. */
  at: Date | null;
  /** True when a timed step's hour had already passed and skipping is on. */
  skipped: boolean;
}

/**
 * When the step after this one should go out.
 *
 * `from` is when the step that carries this wait was delivered — the clock
 * starts at delivery rather than at enrolment, so a sequence does not
 * bunch up behind a step that was queued for an hour.
 */
export function nextSendAt(
  step: Pick<DripStep, "waitKind" | "waitMinutes" | "sendAtMinutes" | "sendAtDays">,
  from: Date,
  settings: Pick<DripSettings, "skipMissedSteps" | "timeZone">
): NextStep {
  if (step.waitKind === "duration") {
    const minutes = Math.max(0, Math.floor(step.waitMinutes || 0));
    return { at: new Date(from.getTime() + minutes * 60_000), skipped: false };
  }

  const minutes = clampMinutes(step.sendAtMinutes);
  const days = Math.max(0, Math.floor(step.sendAtDays || 0));

  const at = atLocalTime(from, settings.timeZone, minutes, days);

  // The hour has already gone today. Either drop the step or let it come
  // round tomorrow — both are a real answer to a real sequence, which is
  // why it is a setting rather than a decision taken here.
  if (at.getTime() <= from.getTime()) {
    if (settings.skipMissedSteps) return { at: null, skipped: true };
    return { at: atLocalTime(from, settings.timeZone, minutes, days + 1), skipped: false };
  }

  return { at, skipped: false };
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.floor(value), 0), DAY - 1);
}

/**
 * The instant at which the wall clock in `timeZone` reads `minutes`,
 * `days` after the local date of `from`.
 *
 * Done by hand rather than with a date library because the app carries
 * none, and the two-pass offset trick is exact: guess the offset at the
 * naive instant, apply it, then re-read the offset at the result. The
 * second read only differs across a DST boundary, which is precisely the
 * case the second pass exists for.
 */
function atLocalTime(from: Date, timeZone: string, minutes: number, days: number): Date {
  const parts = localDate(timeZone, from);
  if (!parts) {
    // An unrecognised zone must not stop a sequence. UTC is wrong by hours
    // for somebody, and silence is wrong for everybody.
    return new Date(
      Date.UTC(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate() + days,
        Math.floor(minutes / 60),
        minutes % 60
      )
    );
  }

  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day + days,
    Math.floor(minutes / 60),
    minutes % 60
  );

  const guess = offsetMinutes(timeZone, new Date(naive));
  let stamp = naive - guess * 60_000;

  const actual = offsetMinutes(timeZone, new Date(stamp));
  if (actual !== guess) stamp = naive - actual * 60_000;

  return new Date(stamp);
}

function localDate(
  timeZone: string,
  at: Date
): { year: number; month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const year = get("year");
    const month = get("month");
    const day = get("day");
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return { year, month, day };
  } catch {
    return null;
  }
}

/** The zone's offset from UTC at this instant, in minutes. */
function offsetMinutes(timeZone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second")
    );
    return (asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000;
  } catch {
    return 0;
  }
}

// --- saying it in words ----------------------------------------------------

/** "4 hours", "2 days", "30 minutes" — a gap, in the unit somebody meant. */
export function describeDuration(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes || 0));
  if (total === 0) return "immediately";
  if (total % DAY === 0) {
    const days = total / DAY;
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (total % 60 === 0) {
    const hours = total / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return total === 1 ? "1 minute" : `${total} minutes`;
}

/** "09:30" from minutes past midnight. */
export function clockLabel(minutes: number): string {
  const safe = clampMinutes(minutes);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** How the gap after a step reads on screen. */
export function describeWait(step: Pick<DripStep, "waitKind" | "waitMinutes" | "sendAtMinutes" | "sendAtDays">): string {
  if (step.waitKind === "duration") {
    const gap = describeDuration(step.waitMinutes);
    return gap === "immediately" ? "then straight on to the next step" : `then wait ${gap}`;
  }

  const time = clockLabel(step.sendAtMinutes);
  const days = Math.max(0, Math.floor(step.sendAtDays || 0));
  if (days === 0) return `then at ${time} the same day`;
  if (days === 1) return `then at ${time} the next day`;
  return `then at ${time}, ${days} days later`;
}

/** The ready-made gaps the builder offers, in the order people reach for them. */
export const WAIT_PRESETS = [
  { minutes: 60, label: "1 hour" },
  { minutes: 4 * 60, label: "4 hours" },
  { minutes: DAY, label: "1 day" },
  { minutes: 2 * DAY, label: "2 days" },
  { minutes: 3 * DAY, label: "3 days" },
  { minutes: 7 * DAY, label: "1 week" },
] as const;

/** Minutes from a number and a unit, for the two-box duration control. */
export function minutesFrom(value: number, unit: "minutes" | "hours" | "days"): number {
  const count = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  if (unit === "days") return count * DAY;
  if (unit === "hours") return count * 60;
  return count;
}

/** The same gap split back into the largest whole unit that fits. */
export function splitMinutes(minutes: number): { value: number; unit: "minutes" | "hours" | "days" } {
  const total = Math.max(0, Math.floor(minutes || 0));
  if (total > 0 && total % DAY === 0) return { value: total / DAY, unit: "days" };
  if (total > 0 && total % 60 === 0) return { value: total / 60, unit: "hours" };
  return { value: total, unit: "minutes" };
}

// --- is it usable ----------------------------------------------------------

/**
 * Why one step cannot run, or null when it can.
 *
 * The reason rather than a boolean: this is shown to whoever is building
 * it, and "invalid" tells them nothing about which box they left empty.
 */
export function stepProblem(step: DripStep, isLast: boolean): string | null {
  if (!step.templateId) return "Choose the template this step sends.";

  if (!isLast && step.waitKind === "duration" && step.waitMinutes <= 0) {
    return "Give the gap before the next step — two messages in the same second is not a drip.";
  }

  if (!isLast && step.waitKind === "time_of_day") {
    if (!Number.isFinite(step.sendAtMinutes) || step.sendAtMinutes < 0 || step.sendAtMinutes >= DAY) {
      return "Give the time of day the next step goes out, as HH:MM.";
    }
  }

  return null;
}

/** The first problem anywhere in the sequence, for a save to refuse on. */
export function sequenceProblem(steps: DripStep[]): string | null {
  if (steps.length === 0) return "Add at least one message to the sequence.";
  if (steps.length > MAX_STEPS) return `A sequence can have at most ${MAX_STEPS} steps.`;

  for (const [index, step] of steps.entries()) {
    const problem = stepProblem(step, index === steps.length - 1);
    if (problem) return `Step ${index + 1}: ${problem}`;
  }
  return null;
}

/** Why the sequence cannot be switched on, or null when it can. */
export function settingsProblem(settings: DripSettings): string | null {
  if (settings.trigger === "keyword" && normaliseKeywords(settings.triggerKeywords).length === 0) {
    return "A keyword trigger needs at least one word for people to send.";
  }
  if (settings.exitOnKeyword && normaliseKeywords(settings.exitKeywords).length === 0) {
    return "Exit on keyword is on but no exit words are listed, so nobody could ever leave.";
  }
  return null;
}

// --- where somebody is in it ----------------------------------------------

export type EnrolmentStatus = "active" | "completed" | "exited" | "failed";

export interface Enrolment {
  status: EnrolmentStatus;
  nextStepIndex: number;
  nextSendAt: string | null;
}

/** How an enrolment reads in a list. */
export function describeEnrolment(enrolment: Enrolment, total: number): string {
  if (enrolment.status === "completed") return "Finished the sequence";
  if (enrolment.status === "exited") return "Left the sequence";
  if (enrolment.status === "failed") return "Stopped — a message could not be sent";
  return `On step ${Math.min(enrolment.nextStepIndex, total)} of ${total}`;
}

/**
 * What happens to an enrolment once a step has gone out.
 *
 * Returned rather than written here so the dispatcher stays a loop over
 * rows and the rule lives somewhere it can be tested. A step whose wait
 * says "skip" moves straight on to the one after it, which is why this
 * walks forward rather than adding one.
 */
export function advance(
  steps: DripStep[],
  justSent: number,
  sentAt: Date,
  settings: Pick<DripSettings, "skipMissedSteps" | "timeZone">
): { status: EnrolmentStatus; nextStepIndex: number; nextSendAt: Date | null } {
  let index = justSent;

  while (index < steps.length) {
    const step = steps[index - 1];
    if (!step) break;

    // This step's wait says when the one after it goes.
    const next = nextSendAt(step, sentAt, settings);
    if (!next.skipped && next.at) {
      return { status: "active", nextStepIndex: index + 1, nextSendAt: next.at };
    }

    // Step index + 1 is dropped, so read the wait on that one instead —
    // still measured from the same delivery, so a run of skipped timed
    // steps does not silently add a day each.
    index += 1;
  }

  return { status: "completed", nextStepIndex: steps.length + 1, nextSendAt: null };
}
