// Taking money for the product itself.
//
// Everything needed to bill a customer for their own invoices was built
// months ago. Billing them for Neura Chat was a row somebody typed into
// the admin panel by hand, and /billing ended with "contact support to
// change your plan" — which is the line between a demo and a business.
//
// Pure here: what a plan costs after a coupon, when the next period ends,
// and whether a subscription is currently good. The gateway call and the
// database writes are in the actions.

/** Discount shapes the coupons table allows. */
export type DiscountType = "percent" | "fixed";

export interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_redemptions: number | null;
  times_redeemed: number;
  expires_at: string | null;
  is_active: boolean;
}

export type CouponVerdict =
  | { ok: true; coupon: Coupon }
  | { ok: false; reason: string };

/**
 * Whether a coupon may be used right now.
 *
 * The reasons are deliberately vague about which condition failed. A
 * precise "that code has been used 50 times" tells someone probing codes
 * that the code exists, and the customer cannot act on the difference
 * anyway — either it works or they pay full price.
 */
export function checkCoupon(coupon: Coupon | null, now: Date = new Date()): CouponVerdict {
  if (!coupon || !coupon.is_active) {
    return { ok: false, reason: "That code isn't valid." };
  }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: "That code isn't valid." };
  }
  if (coupon.max_redemptions !== null && coupon.times_redeemed >= coupon.max_redemptions) {
    return { ok: false, reason: "That code isn't valid." };
  }
  if (coupon.discount_value <= 0) {
    return { ok: false, reason: "That code isn't valid." };
  }
  return { ok: true, coupon };
}

export interface Charge {
  /** What the plan lists, in the smallest currency unit. */
  listCents: number;
  discountCents: number;
  /** What the customer actually pays. */
  totalCents: number;
}

/**
 * What this plan costs with this coupon applied.
 *
 * A percentage over 100 and a fixed amount over the price both floor the
 * total at zero rather than going negative — a coupon that would pay the
 * customer is a typo in the admin panel, not an instruction.
 */
export function chargeFor(listCents: number, coupon?: Coupon | null): Charge {
  const list = Math.max(0, Math.round(listCents));
  if (!coupon) return { listCents: list, discountCents: 0, totalCents: list };

  const raw =
    coupon.discount_type === "percent"
      ? Math.round((list * Math.min(100, coupon.discount_value)) / 100)
      : Math.round(coupon.discount_value);

  const discount = Math.min(list, Math.max(0, raw));
  return { listCents: list, discountCents: discount, totalCents: list - discount };
}

export type BillingInterval = "monthly" | "yearly";

/**
 * The end of a billing period that starts at `from`.
 *
 * Calendar months, not 30 days: somebody who pays on the 3rd expects to
 * pay on the 3rd. A start date past the end of the target month clamps to
 * that month's last day — 31 January plus one month is 28 February, and
 * rolling into March instead would quietly give away three days a year.
 */
export function periodEnd(from: Date, interval: BillingInterval): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const day = from.getUTCDate();

  const targetYear = interval === "yearly" ? year + 1 : year + (month === 11 ? 1 : 0);
  const targetMonth = interval === "yearly" ? month : (month + 1) % 12;

  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(day, lastDay),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds()
    )
  );
}

export interface SubscriptionRow {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/**
 * Whether this subscription currently entitles the workspace to anything.
 *
 * A trial counts. A cancelled subscription counts until its period runs
 * out, because the customer paid for that period — cutting them off the
 * moment they cancel is how a cancellation becomes a chargeback.
 */
export function isEntitled(
  subscription: SubscriptionRow | null,
  now: Date = new Date()
): boolean {
  if (!subscription) return false;
  if (subscription.status === "expired") return false;

  const ends = subscription.current_period_end
    ? new Date(subscription.current_period_end).getTime()
    : null;

  // No end date on an active or trialing row means open-ended, which is
  // what platform staff assigning a plan by hand produces.
  if (ends === null) return subscription.status === "active" || subscription.status === "trialing";

  if (ends <= now.getTime()) return false;
  return ["active", "trialing", "past_due", "cancelled"].includes(subscription.status);
}

/** Days left in the current period, or null when it is open-ended. */
export function daysRemaining(
  subscription: SubscriptionRow | null,
  now: Date = new Date()
): number | null {
  if (!subscription?.current_period_end) return null;
  const ms = new Date(subscription.current_period_end).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * The reference that travels to the gateway and back.
 *
 * Prefixed so the payment webhook can tell a plan payment from an invoice
 * or a store order without looking anything up — all three arrive at the
 * same endpoint.
 */
export function checkoutReference(orderId: string): string {
  return `SUB-${orderId}`;
}

/** The order id inside a reference, or null if it is not one of ours. */
export function orderIdFromReference(reference: string): string | null {
  const match = /^SUB-([0-9a-f-]{36})$/i.exec(reference.trim());
  return match ? match[1] : null;
}
