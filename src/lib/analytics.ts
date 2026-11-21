// Turning a pile of events into the four numbers that matter.
//
// Pure: no database, no clock of its own beyond what is handed in. The
// aggregation is here rather than in SQL for one reason that is worth
// stating, because it is a trade and not an oversight — PostgREST cannot
// group, so grouping in the database would mean a view or an RPC per
// question, and the questions on this screen change far more often than
// the data does. At the volume a young product produces, a few thousand
// rows in and a reduce over them is nothing. If this ever stops being
// true the answer is a nightly rollup table, not a cleverer query.

// Relative and with the extension: the test runner strips types but
// does not resolve the "@/" alias, and this is a value import.
import { isCredit, type LedgerKind } from "./wallet.ts";

/**
 * What a wallet ledger means in money terms.
 *
 * Separate and pure so it can be tested, because the shape of this data
 * invites exactly one mistake: amount_micros is always positive and the
 * direction lives in `kind`. Reading the sign gives three numbers that
 * are all wrong and all look plausible — nothing ever spent, every
 * workspace at zero, and top-ups quietly including every debit.
 */
export function foldLedger(
  rows: readonly { org_id: string; kind: LedgerKind; amount_micros: number | null }[]
): { spentBy: Map<string, number>; spent: number; toppedUp: number; debits: number } {
  const spentBy = new Map<string, number>();
  let spent = 0;
  let toppedUp = 0;
  let debits = 0;

  for (const row of rows) {
    const amount = Math.abs(Number(row.amount_micros ?? 0));
    if (isCredit(row.kind)) {
      toppedUp += amount;
      continue;
    }
    debits += 1;
    spentBy.set(row.org_id, (spentBy.get(row.org_id) ?? 0) + amount);
    spent += amount;
  }

  return { spentBy, spent, toppedUp, debits };
}

export interface SiteEvent {
  visitor_id: string;
  session_id: string;
  event: string;
  path: string | null;
  label: string | null;
  referrer_host: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  device: string | null;
  created_at: string;
}

/** The events the product emits, and what each one means on the screen. */
export const EVENTS = {
  view: "Page opened",
  click: "Something clicked",
  signup_open: "Sign-up opened",
  signup_submit: "Sign-up submitted",
  signup_done: "Account created",
} as const;

export function isKnownEvent(event: string): boolean {
  return event in EVENTS;
}

export interface Totals {
  visitors: number;
  sessions: number;
  views: number;
  /** Sessions with exactly one page view — they arrived and left. */
  bounced: number;
}

export function totals(events: readonly SiteEvent[]): Totals {
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  const viewsPerSession = new Map<string, number>();
  let views = 0;

  for (const row of events) {
    visitors.add(row.visitor_id);
    sessions.add(row.session_id);
    if (row.event === "view") {
      views += 1;
      viewsPerSession.set(row.session_id, (viewsPerSession.get(row.session_id) ?? 0) + 1);
    }
  }

  let bounced = 0;
  for (const count of viewsPerSession.values()) if (count === 1) bounced += 1;

  return { visitors: visitors.size, sessions: sessions.size, views, bounced };
}

export interface Step {
  label: string;
  /** People, not events: somebody who opened sign-up twice is one person. */
  count: number;
  /** Share of the step above, or null for the first. */
  ofPrevious: number | null;
  /** Share of the very first step. */
  ofStart: number | null;
}

/**
 * The funnel, counted in people rather than in events.
 *
 * Counting events is the mistake that makes a funnel useless: one person
 * reloading the sign-up page four times becomes four, the step appears
 * wider than the one above it, and the conversion rate goes over a
 * hundred per cent. Every step here is a set of visitor ids.
 *
 * It is also monotonic by construction — each step counts only visitors
 * who reached the step before it. Without that, somebody who lands
 * directly on /auth/register from an email appears at step two and never
 * at step one, and the chart shows a funnel that widens.
 */
export function funnel(
  events: readonly SiteEvent[],
  /** Workspaces created in the window, which the events cannot know. */
  accountsCreated?: number
): Step[] {
  const reached = (event: string) =>
    new Set(events.filter((row) => row.event === event).map((row) => row.visitor_id));

  const visited = new Set(events.map((row) => row.visitor_id));
  const opened = intersect(reached("signup_open"), visited);
  const submitted = intersect(reached("signup_submit"), opened);
  const done = intersect(reached("signup_done"), submitted);

  const raw: { label: string; count: number }[] = [
    { label: "Visited the site", count: visited.size },
    { label: "Opened sign-up", count: opened.size },
    { label: "Filled it in", count: submitted.size },
    {
      label: "Created an account",
      // The database is the authority on accounts. An event can be lost to
      // a closed tab or a blocked request, and a funnel whose last step is
      // lower than the number of customers you actually have is one
      // nobody will trust again.
      count: Math.max(done.size, accountsCreated ?? 0),
    },
  ];

  // Raise earlier steps to at least the later ones, back to front.
  //
  // Needed because the last step is ground truth from the database while
  // the ones above it are tracking, and tracking under-counts: a blocker,
  // a closed tab, a browser that never ran the script. Without this, nine
  // real accounts sitting above seven recorded submissions renders as
  // "129% of the step above", which is the funnel visibly contradicting
  // itself on the one screen that is supposed to settle arguments.
  //
  // Raising is the sound direction, not a fudge. Everybody who created an
  // account did fill the form in and did visit the site, whether or not
  // the event survived; the reverse is not true, so a later step is
  // always a subset of an earlier one and the earlier one can never
  // honestly be smaller.
  for (let i = raw.length - 2; i >= 0; i -= 1) {
    raw[i].count = Math.max(raw[i].count, raw[i + 1].count);
  }

  const start = raw[0].count;
  return raw.map((step, index) => ({
    ...step,
    ofPrevious:
      index === 0 || raw[index - 1].count === 0 ? null : step.count / raw[index - 1].count,
    ofStart: start === 0 ? null : step.count / start,
  }));
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const value of a) if (b.has(value)) out.add(value);
  return out;
}

export interface Ranked {
  label: string;
  count: number;
  /** Share of the biggest, for the bar width. */
  share: number;
}

/**
 * The top N of something, counted by people rather than by hits.
 *
 * Same reason as the funnel: one person refreshing a page twenty times is
 * not twenty people interested in it, and a "top pages" list topped by
 * whatever page happens to poll is worse than no list.
 */
export function rank(
  events: readonly SiteEvent[],
  pick: (row: SiteEvent) => string | null | undefined,
  options: { only?: string; limit?: number; unique?: boolean } = {}
): Ranked[] {
  const { only, limit = 8, unique = true } = options;
  const seen = new Map<string, Set<string>>();
  const hits = new Map<string, number>();

  for (const row of events) {
    if (only && row.event !== only) continue;
    const key = pick(row)?.trim();
    if (!key) continue;

    hits.set(key, (hits.get(key) ?? 0) + 1);
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(row.visitor_id);
  }

  const counted = [...hits.keys()].map((key) => ({
    label: key,
    count: unique ? seen.get(key)!.size : hits.get(key)!,
  }));

  counted.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const top = counted.slice(0, limit);
  const biggest = top[0]?.count ?? 0;

  return top.map((row) => ({ ...row, share: biggest === 0 ? 0 : row.count / biggest }));
}

export interface Day {
  day: Date;
  visitors: number;
  views: number;
}

/**
 * One bucket a day, including the quiet ones.
 *
 * Built from a range rather than from the data: a day with no traffic has
 * no rows, and a chart that simply leaves those days out draws a straight
 * line between the two either side — which reads as steady traffic over a
 * week nobody visited.
 */
export function daily(events: readonly SiteEvent[], days: number, now: Date = new Date()): Day[] {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const buckets: Day[] = [];
  const index = new Map<string, number>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(midnight);
    day.setDate(day.getDate() - i);
    index.set(key(day), buckets.length);
    buckets.push({ day, visitors: 0, views: 0 });
  }

  const perDay = new Map<number, Set<string>>();

  for (const row of events) {
    const at = new Date(row.created_at);
    if (Number.isNaN(at.getTime())) continue;
    at.setHours(0, 0, 0, 0);

    const slot = index.get(key(at));
    if (slot === undefined) continue;

    if (row.event === "view") buckets[slot].views += 1;
    if (!perDay.has(slot)) perDay.set(slot, new Set());
    perDay.get(slot)!.add(row.visitor_id);
  }

  for (const [slot, people] of perDay) buckets[slot].visitors = people.size;
  return buckets;
}

/** Local date, not ISO: an ISO key buckets by UTC and shifts every day. */
function key(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "42%" or "—" when there is nothing to divide by. */
export function percent(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)}%`;
}

/** The host of a referrer, or null for a direct visit or our own pages. */
export function referrerHost(referrer: string, self: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host && host !== self.replace(/^www\./, "") ? host : null;
  } catch {
    return null;
  }
}

/** Where a visit came from: the campaign if tagged, else the referrer. */
export function sourceOf(row: Pick<SiteEvent, "source" | "referrer_host">): string {
  return row.source?.trim() || row.referrer_host?.trim() || "Direct";
}
