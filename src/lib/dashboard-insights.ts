// The two questions a dashboard should answer and this one did not:
// what is about to happen, and is the automation actually working.
//
// Pure by design: no fetch, no env, no server-only, so the arithmetic
// behind a headline number can be checked rather than trusted. A stat
// that is quietly wrong is worse than no stat — somebody makes a
// decision on it.

export type UpcomingKind = "reminder" | "scheduled" | "appointment";

export interface UpcomingItem {
  id: string;
  kind: UpcomingKind;
  title: string;
  /** ISO timestamp it is due at. */
  at: string;
  /** Who it concerns, where there is somebody. */
  who?: string | null;
}

/**
 * The next few things due, across reminders, scheduled messages and
 * appointments, oldest first.
 *
 * One list rather than three panels: what matters to somebody opening
 * this screen is "what is coming", not which feature happens to own it.
 * Anything already past is dropped — a dashboard that still shows
 * yesterday's reminder as upcoming teaches you to stop reading it.
 */
export function upcoming(
  items: readonly UpcomingItem[],
  now: number = Date.now(),
  limit = 6
): UpcomingItem[] {
  return items
    .filter((item) => {
      const at = new Date(item.at).getTime();
      return Number.isFinite(at) && at >= now;
    })
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(0, limit);
}

/** How far away something is, in the words a person would use. */
export function whenDue(at: string, now: number = Date.now()): string {
  const due = new Date(at).getTime();
  if (!Number.isFinite(due)) return "";

  const minutes = Math.round((due - now) / 60_000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours}h`;

  const days = Math.round(hours / 24);
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;

  const weeks = Math.round(days / 7);
  return weeks === 1 ? "in a week" : `in ${weeks} weeks`;
}

export interface BotRunLike {
  outcome: string;
  matched_kind?: string | null;
  matched_label?: string | null;
}

export interface AnswerRate {
  /** Inbound messages the automation replied to. */
  answered: number;
  /** Ones it looked at and had nothing for. */
  unanswered: number;
  /** Ones that failed outright. Counted apart: a failure is not a miss. */
  failed: number;
  total: number;
  /** 0–1. Null when there is nothing to divide by. */
  rate: number | null;
}

/**
 * What share of messages the automation handled on its own.
 *
 * Failures are counted separately rather than folded into "unanswered".
 * They are a different problem with a different fix: a miss means write
 * another answer, a failure means something is broken.
 */
export function answerRate(runs: readonly BotRunLike[]): AnswerRate {
  let answered = 0;
  let unanswered = 0;
  let failed = 0;

  for (const run of runs) {
    if (run.outcome === "replied" || run.outcome === "handoff") answered += 1;
    else if (run.outcome === "failed") failed += 1;
    else unanswered += 1;
  }

  const total = answered + unanswered + failed;
  return { answered, unanswered, failed, total, rate: total === 0 ? null : answered / total };
}

export interface TopAnswer {
  label: string;
  kind: string;
  count: number;
}

/**
 * Which answers are doing the work.
 *
 * Worth a panel because it is the one number that tells you what to
 * write next: the question being answered most is the one worth making
 * better, and a long tail of "nothing matched" is the list of answers
 * that do not exist yet.
 */
export function topAnswers(runs: readonly BotRunLike[], limit = 5): TopAnswer[] {
  const tally = new Map<string, TopAnswer>();

  for (const run of runs) {
    if (run.outcome !== "replied") continue;
    const label = run.matched_label?.trim();
    if (!label) continue;

    const key = `${run.matched_kind ?? ""}:${label}`;
    const entry = tally.get(key);
    if (entry) entry.count += 1;
    else tally.set(key, { label, kind: run.matched_kind ?? "bot", count: 1 });
  }

  return [...tally.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}
