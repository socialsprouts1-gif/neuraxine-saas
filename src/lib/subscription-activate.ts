import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { periodEnd, type BillingInterval } from "@/lib/checkout";

// Putting a workspace on a plan, once the money has arrived.
//
// The only place in the product that writes an active subscription. It
// runs as the service role — subscriptions deliberately has no insert
// policy for tenants, so a workspace cannot promote itself — and it is
// called from exactly two places: the payment webhook, after a gateway
// signature has been verified, and the free-total branch of checkout.
//
// Idempotent, because gateways redeliver. A second notification for an
// order already marked paid must not extend the period by another month.

type Admin = ReturnType<typeof createAdminClient>;

export type ActivateResult =
  | { ok: true; alreadyDone: boolean; planName: string | null }
  | { ok: false; error: string };

/**
 * Marks an order paid and moves its workspace onto the plan it bought.
 *
 * The new period starts now rather than at the end of the old one. That is
 * the simple reading and it favours the customer on an upgrade; a
 * mid-period switch that carried the old end date would shorten what they
 * just paid for.
 */
export async function activateSubscription(
  admin: Admin,
  orderId: string,
  payment: { provider: string; reference: string }
): Promise<ActivateResult> {
  const { data: order } = await admin
    .from("orders")
    .select("id, org_id, plan_id, coupon_id, status, billing_interval, amount_cents")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "That order no longer exists." };

  // Gateways redeliver. Extending the period again on the second
  // notification would give away a month per retry.
  if (order.status === "paid") {
    return { ok: true, alreadyDone: true, planName: null };
  }

  if (!order.plan_id) {
    return { ok: false, error: "That order is not for a plan." };
  }

  const { data: plan } = await admin
    .from("plans")
    .select("id, name, billing_interval")
    .eq("id", order.plan_id)
    .maybeSingle();

  if (!plan) return { ok: false, error: "The plan on that order no longer exists." };

  const interval = ((order.billing_interval ?? plan.billing_interval) === "yearly"
    ? "yearly"
    : "monthly") as BillingInterval;

  const now = new Date();
  const { error: subscriptionError } = await admin.from("subscriptions").upsert(
    {
      org_id: order.org_id,
      plan_id: plan.id,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd(now, interval).toISOString(),
      // A renewal after a cancellation has to clear the flag, or the
      // subscription they just paid to restart is still marked ending.
      cancel_at_period_end: false,
      updated_at: now.toISOString(),
    },
    { onConflict: "org_id" }
  );

  if (subscriptionError) return { ok: false, error: subscriptionError.message };

  const { error: orderError } = await admin
    .from("orders")
    .update({
      status: "paid",
      paid_at: now.toISOString(),
      provider: payment.provider,
      provider_reference: payment.reference,
    })
    .eq("id", order.id);

  if (orderError) return { ok: false, error: orderError.message };

  // Counted after the order is marked paid, so a redelivery cannot count
  // it twice. False means the coupon ran out between the price being
  // quoted and paid — the money is already taken, so it is a note rather
  // than a refusal.
  if (order.coupon_id) {
    const { data: counted } = await admin.rpc("redeem_coupon", {
      target_coupon: order.coupon_id,
    });
    if (counted === false) {
      console.warn(`Order ${order.id} used a coupon that had already run out.`);
    }
  }

  return { ok: true, alreadyDone: false, planName: plan.name };
}
