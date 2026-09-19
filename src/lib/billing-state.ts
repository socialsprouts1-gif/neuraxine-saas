// What billing state a workspace is in, and what to say about it.
//
// Four situations that look alike from a status column alone and need
// completely different words: still on trial, trial run out, paying, and
// payment lapsed. Getting this wrong means either nagging someone who has
// paid, or letting an expired workspace carry on silently.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.

export type BillingStage = "trialing" | "trial_expired" | "active" | "past_due" | "none";

export interface SubscriptionRow {
  status: string | null;
  current_period_end: string | null;
  plans?: { name: string } | null;
}

export interface BillingState {
  stage: BillingStage;
  /** Whole days left, floored. Negative once the date has passed. */
  daysLeft: number | null;
  planName: string | null;
  /** True when the workspace should be prompted to pay. */
  needsAttention: boolean;
  title: string;
  detail: string;
}

/** Whole days between now and then, rounding towards zero. */
function daysBetween(now: Date, then: Date): number {
  return Math.floor((then.getTime() - now.getTime()) / 86_400_000);
}

export function billingState(
  subscription: SubscriptionRow | null | undefined,
  now: Date = new Date()
): BillingState {
  const planName = subscription?.plans?.name ?? null;

  // No row at all. Older workspaces created before trials existed; the
  // migration backfills them, so this is the state of a database that has
  // not run it yet. Say nothing rather than accuse someone of not paying.
  if (!subscription || !subscription.status) {
    return {
      stage: "none",
      daysLeft: null,
      planName: null,
      needsAttention: false,
      title: "",
      detail: "",
    };
  }

  const ends = subscription.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const daysLeft = ends ? daysBetween(now, ends) : null;
  const expired = ends !== null && ends.getTime() <= now.getTime();

  if (subscription.status === "trialing") {
    if (expired) {
      return {
        stage: "trial_expired",
        daysLeft,
        planName,
        needsAttention: true,
        title: "Your free trial has ended",
        detail: "Choose a plan to keep sending, receiving and automating on WhatsApp.",
      };
    }

    return {
      stage: "trialing",
      daysLeft,
      planName,
      // A trial is not a problem until it is nearly over. Nagging from day
      // one is how a banner becomes something people stop reading.
      needsAttention: daysLeft !== null && daysLeft <= 3,
      title:
        daysLeft === null
          ? "You're on a free trial"
          : daysLeft <= 0
            ? "Your free trial ends today"
            : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on your free trial`,
      detail: "Add a plan whenever you're ready — nothing stops working before then.",
    };
  }

  if (subscription.status === "past_due") {
    return {
      stage: "past_due",
      daysLeft,
      planName,
      needsAttention: true,
      title: "Your last payment didn't go through",
      detail: "Update your billing details to keep your workspace running.",
    };
  }

  if (subscription.status === "cancelled" || subscription.status === "expired") {
    return {
      stage: "trial_expired",
      daysLeft,
      planName,
      needsAttention: true,
      title:
        subscription.status === "cancelled"
          ? "Your subscription was cancelled"
          : "Your subscription has expired",
      detail: "Choose a plan to carry on where you left off.",
    };
  }

  // Active, but the period has run out and nothing renewed it.
  if (expired) {
    return {
      stage: "past_due",
      daysLeft,
      planName,
      needsAttention: true,
      title: "Your billing period has ended",
      detail: "Update your billing details to keep your workspace running.",
    };
  }

  return {
    stage: "active",
    daysLeft,
    planName,
    needsAttention: false,
    title: planName ? `You're on ${planName}` : "Your subscription is active",
    detail: "",
  };
}
