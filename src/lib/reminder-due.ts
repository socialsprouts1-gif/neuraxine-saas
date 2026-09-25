// Which reminders have come due, and when to look again.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// A reminder is the one thing in this product whose whole value is being
// interrupted by it. Showing it late is a missed follow-up; showing it
// twice trains somebody to close it without reading.

export interface DueCandidate {
  id: string;
  title: string;
  body: string | null;
  remind_at: string;
  status: string;
  contactName?: string | null;
}

/** How often to ask the server, when nothing is close to due. */
export const IDLE_POLL_MS = 60_000;

/** And when something is due within the next few minutes. */
export const NEAR_POLL_MS = 15_000;

/** Anything closer than this counts as "soon" for the poll interval. */
export const NEAR_WINDOW_MS = 5 * 60_000;

/**
 * Reminders that should be on screen right now.
 *
 * Only pending ones. A cancelled reminder must never surface, and one
 * already marked sent has been shown — re-raising it on the next poll is
 * how a notification becomes noise.
 */
export function dueNow<T extends DueCandidate>(
  reminders: readonly T[],
  now: Date,
  acknowledged: ReadonlySet<string> = new Set()
): T[] {
  const at = now.getTime();

  return reminders
    .filter((reminder) => reminder.status === "pending")
    .filter((reminder) => !acknowledged.has(reminder.id))
    .filter((reminder) => {
      const due = new Date(reminder.remind_at).getTime();
      return Number.isFinite(due) && due <= at;
    })
    // Oldest first: something three days overdue matters more than one that
    // came due while the page was open.
    .sort(
      (left, right) =>
        new Date(left.remind_at).getTime() - new Date(right.remind_at).getTime()
    );
}

/**
 * How long to wait before asking again.
 *
 * Polling every fifteen seconds all day to catch a reminder set for next
 * week is a waste of somebody's battery. This tightens only when something
 * is actually close.
 */
export function pollDelay(reminders: readonly DueCandidate[], now: Date): number {
  const at = now.getTime();

  const soonest = reminders
    .filter((reminder) => reminder.status === "pending")
    .map((reminder) => new Date(reminder.remind_at).getTime())
    .filter((due) => Number.isFinite(due) && due > at)
    .sort((left, right) => left - right)[0];

  if (soonest === undefined) return IDLE_POLL_MS;
  return soonest - at <= NEAR_WINDOW_MS ? NEAR_POLL_MS : IDLE_POLL_MS;
}

/** "3 days overdue" / "just now", for the line under the title. */
export function describeLateness(remindAt: string, now: Date): string {
  const due = new Date(remindAt).getTime();
  if (!Number.isFinite(due)) return "";

  const minutes = Math.floor((now.getTime() - due) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
