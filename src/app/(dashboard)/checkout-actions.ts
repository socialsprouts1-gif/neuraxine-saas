"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrg } from "@/lib/org";
import { loadIntegration } from "@/lib/integration-store";
import { createPaymentLink } from "@/lib/payment-links";
import { isPaymentProvider } from "@/lib/provider-meta";
import {
  chargeFor,
  checkCoupon,
  checkoutReference,
  type BillingInterval,
} from "@/lib/checkout";
import type { ActionResult } from "./actions";

// Buying a plan without a human in the loop.
//
// Neura Chat could bill a customer for their own invoices months before it
// could bill anybody for itself: /billing ended with "contact support to
// change your plan", and every signup was a row somebody typed into the
// admin panel.
//
// The pieces were all here — plans, coupons, orders, subscriptions, a
// payment-link builder and a signature-checked webhook. What was missing
// was the loop between them, which is this file plus one branch in the
// payment webhook.
//
// Nothing here grants a plan. The order is written pending, the customer
// is sent to the gateway, and the subscription is activated by the webhook
// after a signature has been verified — so the only thing that can put a
// workspace on a plan is money actually arriving.

/** The platform's own gateway, for taking our own payments. */
const PLATFORM_ORG_SETTING = "platform_payment_org";

async function origin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Which workspace's gateway credentials take the platform's own money.
 *
 * A tenant paying us must not be charged through their own Razorpay
 * account — the money would go to them. So the gateway is the platform's,
 * named in platform_settings, and defaults to whichever workspace the
 * platform staff run their own business from.
 */
async function platformGateway(): Promise<
  | { ok: true; orgId: string; provider: string }
  | { ok: false; error: string }
> {
  const admin = createAdminClient();

  const { data: setting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", PLATFORM_ORG_SETTING)
    .maybeSingle();

  const value = setting?.value as { org_id?: string; provider?: string } | null;
  const orgId = value?.org_id?.trim();
  const provider = value?.provider?.trim();

  if (!orgId || !provider || !isPaymentProvider(provider)) {
    return {
      ok: false,
      error:
        "Online payment is not set up yet. Platform staff need to name the workspace and gateway that take payments, under Admin → Platform settings.",
    };
  }

  return { ok: true, orgId, provider };
}

export interface QuotedPlan {
  planId: string;
  name: string;
  interval: BillingInterval;
  listCents: number;
  discountCents: number;
  totalCents: number;
  currency: string;
}

/**
 * What a plan would cost this workspace, with a coupon applied.
 *
 * Quoting and charging go through the same two functions, so the price on
 * the button is the price on the gateway. Two code paths for that is how
 * a customer ends up disputing a charge.
 */
export async function quotePlan(
  formData: FormData
): Promise<(ActionResult & { quote?: QuotedPlan })> {
  await requireOrg();

  const planId = String(formData.get("plan_id") ?? "").trim();
  if (!planId) return { ok: false, error: "No plan selected." };

  const code = String(formData.get("coupon") ?? "").trim();

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, name, price_cents, currency, billing_interval, is_active")
    .eq("id", planId)
    .maybeSingle();

  if (!plan || !plan.is_active) return { ok: false, error: "That plan is not available." };

  let coupon = null;
  let note = "";
  if (code) {
    // Read with the service role: tenants deliberately cannot read the
    // coupons table at all, or any signed-in user could enumerate every
    // discount code in the system.
    const admin = createAdminClient();
    const { data: found } = await admin
      .from("coupons")
      .select("*")
      .eq("code", code.toUpperCase())
      .maybeSingle();

    const verdict = checkCoupon(found ?? null);
    if (!verdict.ok) return { ok: false, error: verdict.reason };
    coupon = verdict.coupon;
    note = ` Code ${coupon.code} applied.`;
  }

  const charge = chargeFor(plan.price_cents, coupon);

  return {
    ok: true,
    message: `Ready to pay.${note}`,
    quote: {
      planId: plan.id,
      name: plan.name,
      interval: plan.billing_interval as BillingInterval,
      currency: plan.currency,
      ...charge,
    },
  };
}

/**
 * Starts a purchase and returns the link to pay at.
 *
 * A free total skips the gateway and activates immediately: a 100% coupon
 * that still demands a payment link is a broken promise, and gateways
 * refuse a zero-amount link anyway.
 */
export async function startCheckout(
  formData: FormData
): Promise<ActionResult & { payUrl?: string }> {
  const ctx = await requireOrg();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return { ok: false, error: "Only an owner or an admin can change the plan." };
  }

  const quoted = await quotePlan(formData);
  if (!quoted.ok || !quoted.quote) return quoted;
  const quote = quoted.quote;

  const code = String(formData.get("coupon") ?? "").trim();
  const admin = createAdminClient();

  let couponId: string | null = null;
  if (code) {
    const { data: found } = await admin
      .from("coupons")
      .select("id")
      .eq("code", code.toUpperCase())
      .maybeSingle();
    couponId = found?.id ?? null;
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      org_id: ctx.orgId,
      plan_id: quote.planId,
      coupon_id: couponId,
      kind: "subscription",
      description: `${quote.name} (${quote.interval})`,
      amount_cents: quote.totalCents,
      discount_cents: quote.discountCents,
      billing_interval: quote.interval,
      currency: quote.currency,
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { ok: false, error: orderError?.message ?? "Could not start the purchase." };
  }

  // Nothing to charge. Activated here rather than sent to a gateway that
  // would refuse a zero-amount link.
  if (quote.totalCents <= 0) {
    const { activateSubscription } = await import("@/lib/subscription-activate");
    const done = await activateSubscription(admin, order.id, {
      provider: "none",
      reference: checkoutReference(order.id),
    });
    if (!done.ok) return { ok: false, error: done.error };

    revalidatePath("/billing");
    revalidatePath("/", "layout");
    return { ok: true, message: `You are on ${quote.name}. Nothing to pay.` };
  }

  const gateway = await platformGateway();
  if (!gateway.ok) return { ok: false, error: gateway.error };

  const stored = await loadIntegration(admin, gateway.orgId, gateway.provider);
  if (!stored) {
    return {
      ok: false,
      error: `The platform's ${gateway.provider} credentials are missing. Platform staff need to connect it under Integrations on the payments workspace.`,
    };
  }

  const link = await createPaymentLink(
    {
      provider: gateway.provider as never,
      credentials: stored.values,
      config: stored.config ?? {},
    },
    {
      amountCents: quote.totalCents,
      currency: quote.currency,
      description: `Neura Chat — ${quote.name} (${quote.interval})`,
      customerEmail: ctx.user.email ?? null,
      // The reference is what the webhook matches on, and it is prefixed
      // so a plan payment is distinguishable from an invoice or a store
      // order — all three arrive at the same endpoint.
      reference: checkoutReference(order.id),
      returnUrl: `${await origin()}/billing?paid=1`,
    }
  );

  if (!link.ok) {
    await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
    return { ok: false, error: link.error };
  }

  await admin
    .from("orders")
    .update({
      provider: gateway.provider,
      provider_reference: link.id,
      payment_link_url: link.url,
    })
    .eq("id", order.id);

  revalidatePath("/billing");
  return { ok: true, message: "Opening the payment page…", payUrl: link.url };
}

/**
 * Stops the subscription renewing, without cutting anything off today.
 *
 * The period already paid for runs to its end. Revoking access the moment
 * somebody cancels is how a cancellation becomes a chargeback.
 */
export async function cancelSubscription(): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") {
    return { ok: false, error: "Only an owner can cancel the plan." };
  }

  const admin = createAdminClient();
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("current_period_end")
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  const { error } = await admin
    .from("subscriptions")
    .update({
      cancel_at_period_end: true,
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/billing");
  return {
    ok: true,
    message: subscription?.current_period_end
      ? `Cancelled. Everything keeps working until ${new Date(subscription.current_period_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`
      : "Cancelled.",
  };
}
