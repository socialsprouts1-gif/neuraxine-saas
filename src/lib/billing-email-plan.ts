// Which billing email a workspace is owed, and when.
//
// Two things make this worth being pure and tested. The first is that a
// duplicate is not a cosmetic bug: the same "your trial ends tomorrow"
// arriving twice is the fastest way to teach somebody to filter everything
// this product sends. The second is that these fire on a schedule nobody
// watches, so a wrong boundary is discovered by a customer being nagged
// after they paid, not by anyone here.
//
// Every decision produces a dedupe key that names exactly what the message
// is about — the period, the day, the step. A unique index on that key is
// what makes "once" true without anything having to remember what it sent.

import { billingState, type SubscriptionRow } from "./billing-state.ts";

export type BillingEmailKind =
  /** The trial is nearly over. Sent once a day through the last stretch. */
  | "trial_ending"
  /** It is over and nothing was bought. */
  | "trial_expired"
  /** Still not bought, some days later. */
  | "trial_followup"
  /** A paid plan renews in a few days. */
  | "renewal_reminder"
  /** A paid plan's period ended without a renewal landing. */
  | "subscription_expired";

export interface DueEmail {
  kind: BillingEmailKind;
  /** Unique per workspace per thing-being-said, so a resend is refused. */
  dedupeKey: string;
  /** Whole days until the period ends. Negative once it has passed. */
  daysLeft: number;
  planName: string | null;
  /** Which follow-up this is, for the ones that repeat. */
  step?: number;
}

/**
 * How early the daily countdown starts.
 *
 * Six, so a seven-day trial is counted down from the day after signup:
 * six days left, five, four, three, two, one, then the day it ends. Seven
 * would put a reminder in the same hour as the welcome, which reads as a
 * demand rather than a reminder.
 */
export const COUNTDOWN_DAYS = 6;

/** How early a paid plan is told it is about to renew. */
export const NOTICE_DAYS = 3;

/** Days between follow-ups in the first month after a trial ends. */
export const FOLLOW_UP_EVERY = 3;

/** And after it, when someone plainly is not coming back this week. */
export const FOLLOW_UP_EVERY_LATE = 7;

/** When the first month ends and the slower cadence begins. */
export const FOLLOW_UP_SWITCH_DAY = 30;

/**
 * Stop after this long.
 *
 * Not asked for, and deliberate. Somebody who has ignored twenty emails
 * over six months has answered; carrying on past that earns spam reports,
 * and a sending domain's reputation is shared by every message this
 * product sends — including the receipts people actually want.
 */
export const FOLLOW_UP_LAST_DAY = 180;

/**
 * How many follow-ups should have been sent by now.
 *
 * Counted from the day rather than from what was sent last, so a sweep
 * that misses a day catches up on the next run instead of skipping a step
 * for ever. Returns null when none is due, or when the sequence has run
 * its course.
 */
export function followUpStep(daysSince: number): number | null {
  if (!Number.isFinite(daysSince)) return null;
  if (daysSince < FOLLOW_UP_EVERY) return null;
  if (daysSince > FOLLOW_UP_LAST_DAY) return null;

  if (daysSince <= FOLLOW_UP_SWITCH_DAY) {
    return Math.floor(daysSince / FOLLOW_UP_EVERY);
  }

  const firstMonth = Math.floor(FOLLOW_UP_SWITCH_DAY / FOLLOW_UP_EVERY);
  return firstMonth + Math.floor((daysSince - FOLLOW_UP_SWITCH_DAY) / FOLLOW_UP_EVERY_LATE);
}

export function dueBillingEmail(
  orgId: string,
  subscription: SubscriptionRow | null | undefined,
  now: Date = new Date()
): DueEmail | null {
  const state = billingState(subscription, now);
  const periodEnd = subscription?.current_period_end;

  // Without a period end there is no date to write and no key to dedupe
  // on, so any send would repeat on every sweep for ever.
  if (!periodEnd || state.daysLeft === null) return null;

  const daysLeft = state.daysLeft;
  const base = { daysLeft, planName: state.planName };

  switch (state.stage) {
    case "trialing":
      // One a day through the last stretch, and the day is in the key so
      // each is its own message rather than a repeat of yesterday's.
      return daysLeft <= COUNTDOWN_DAYS
        ? {
            ...base,
            kind: "trial_ending",
            dedupeKey: `${orgId}:trial_ending:${periodEnd}:${daysLeft}`,
          }
        : null;

    case "trial_expired": {
      const daysSince = -daysLeft;

      // The day it ends, once.
      if (daysSince < FOLLOW_UP_EVERY) {
        return {
          ...base,
          kind: "trial_expired",
          dedupeKey: `${orgId}:trial_expired:${periodEnd}`,
        };
      }

      const step = followUpStep(daysSince);
      if (step === null) return null;

      return {
        ...base,
        kind: "trial_followup",
        step,
        dedupeKey: `${orgId}:trial_followup:${periodEnd}:${step}`,
      };
    }

    case "active":
      return daysLeft <= NOTICE_DAYS && daysLeft >= 0
        ? {
            ...base,
            kind: "renewal_reminder",
            dedupeKey: `${orgId}:renewal_reminder:${periodEnd}`,
          }
        : null;

    case "past_due":
      return {
        ...base,
        kind: "subscription_expired",
        dedupeKey: `${orgId}:subscription_expired:${periodEnd}`,
      };

    // A workspace with no billing row at all is owed nothing; saying
    // "your plan has lapsed" to somebody who never had one is worse than
    // silence.
    case "none":
    default:
      return null;
  }
}

/**
 * One message per person per kind, however many workspaces they own.
 *
 * Somebody who created four workspaces is still one person, and four
 * identical "your trial ends tomorrow" arriving together is the fastest
 * way to be marked as spam. The dedupe key cannot catch this: it is keyed
 * to the workspace, and these are four different workspaces each correctly
 * owed a message.
 *
 * Different kinds still both go. "Your trial ends tomorrow" for one
 * workspace and "payment received" for another are not duplicates, and
 * suppressing the second would hide money moving.
 */
export function collapseByRecipient<T extends { email: string | null; kind: string }>(
  due: readonly T[]
): { send: T[]; collapsed: T[] } {
  const seen = new Set<string>();
  const send: T[] = [];
  const collapsed: T[] = [];

  for (const row of due) {
    const email = row.email?.trim().toLowerCase();
    if (!email) {
      send.push(row);
      continue;
    }

    const key = `${email}|${row.kind}`;
    if (seen.has(key)) collapsed.push(row);
    else {
      seen.add(key);
      send.push(row);
    }
  }

  return { send, collapsed };
}
