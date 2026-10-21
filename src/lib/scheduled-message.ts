// Writing a message now for delivery later.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// The case this exists for: a follow-up that should land tomorrow morning,
// written today because tomorrow morning is not a time anybody is
// reliably at a keyboard.

export type ScheduledStatus = "pending" | "sent" | "failed" | "cancelled";

export interface ScheduledRow {
  id: string;
  wa_id: string;
  body: string;
  send_at: string;
  status: string;
}

/** WhatsApp's own limit on a text message. */
export const MAX_BODY = 4096;

/** No point scheduling something for ten seconds' time. */
export const MIN_LEAD_MS = 60_000;

/** A year out. Past this it is a note to self, not a message. */
export const MAX_LEAD_MS = 365 * 24 * 60 * 60_000;

export type CheckResult =
  | { ok: true; waId: string; body: string; sendAt: Date }
  | { ok: false; error: string };

/**
 * Whether this is something that can actually be sent.
 *
 * Checked before the row is written rather than at send time, because a
 * message that fails at 9am tomorrow fails when nobody is watching — and
 * the whole reason it was scheduled is that nobody would be.
 */
export function checkScheduled(input: {
  waId: string;
  body: string;
  sendAt: string;
  now?: Date;
}): CheckResult {
  const now = input.now ?? new Date();
  const waId = input.waId.replace(/\D/g, "");
  const body = input.body.trim();

  if (waId.length < 10) {
    return {
      ok: false,
      error:
        "That does not look like a WhatsApp number. Include the country code and no symbols — an Indian number is 91 then the ten digits.",
    };
  }

  if (!body) return { ok: false, error: "Write the message first." };
  if (body.length > MAX_BODY) {
    return { ok: false, error: `WhatsApp will not take more than ${MAX_BODY} characters.` };
  }

  const sendAt = new Date(input.sendAt);
  if (!Number.isFinite(sendAt.getTime())) {
    return { ok: false, error: "That date and time is not valid." };
  }

  const lead = sendAt.getTime() - now.getTime();
  if (lead < MIN_LEAD_MS) {
    return {
      ok: false,
      error: "Pick a time at least a minute from now. To send it straight away, use the inbox.",
    };
  }
  if (lead > MAX_LEAD_MS) {
    return { ok: false, error: "That is more than a year away." };
  }

  return { ok: true, waId, body, sendAt };
}

/**
 * The ones a sweep should pick up.
 *
 * Only pending, and only past due. A cancelled message must never go, and
 * one already sent going twice is worse than one not going at all.
 */
export function dueForSend<T extends ScheduledRow>(rows: readonly T[], now: Date): T[] {
  const at = now.getTime();

  return rows
    .filter((row) => row.status === "pending")
    .filter((row) => {
      const when = new Date(row.send_at).getTime();
      return Number.isFinite(when) && when <= at;
    })
    .sort((left, right) => new Date(left.send_at).getTime() - new Date(right.send_at).getTime());
}

/**
 * Whether a scheduled message is so late it should not go at all.
 *
 * A follow-up that was meant for Tuesday morning arriving on Friday night
 * because a scheduler was down is worse than silence — it reads as a
 * business that has lost track of the conversation. Past this it is failed
 * rather than sent, so somebody can see it and decide.
 */
export const STALE_AFTER_MS = 24 * 60 * 60_000;

export function isStale(sendAt: string, now: Date): boolean {
  const when = new Date(sendAt).getTime();
  if (!Number.isFinite(when)) return false;
  return now.getTime() - when > STALE_AFTER_MS;
}

/** "in 3 hours" / "tomorrow at …" — for the list, in plain words. */
export function describeWhen(sendAt: string, now: Date): string {
  const when = new Date(sendAt).getTime();
  if (!Number.isFinite(when)) return "";

  const minutes = Math.round((when - now.getTime()) / 60_000);
  if (minutes < 0) return "overdue";
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
