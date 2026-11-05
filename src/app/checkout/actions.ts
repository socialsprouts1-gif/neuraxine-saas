"use server";

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadIntegration } from "@/lib/integration-store";
import { createRazorpayOrder } from "@/lib/payment-links";
import { checkAmount } from "@/lib/razorpay-checkout";
import { isPaymentProvider } from "@/lib/provider-meta";
import { CLAIM_TOKEN_LENGTH } from "@/lib/guest-checkout";
import type { BillingInterval } from "@/lib/checkout";

// Opening the payment window with no account behind it.
//
// The pricing card used to go to sign-up; now it comes here and the
// gateway opens immediately. The workspace is created afterwards, from
// the name, email and phone the payment itself collected.
//
// Nothing here grants anything. A row is written pending, the customer
// pays, and a signature-checked route marks it paid — the same rule the
// signed-in checkout follows, for the same reason.

const PLATFORM_ORG_SETTING = "platform_payment_org";

export interface GuestCheckoutStart {
  ok: true;
  claimToken: string;
  checkout: {
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    description: string;
  };
  planName: string;
}

export type GuestCheckoutResult = GuestCheckoutStart | { ok: false; error: string };

/**
 * Creates a guest order for a plan slug and returns what the modal needs.
 *
 * The slug is the only thing the caller supplies, and the price is read
 * from the plan row — never from the request. A browser that could name
 * its own amount could buy a year of Scale for one rupee.
 */
export async function startGuestCheckout(slug: string): Promise<GuestCheckoutResult> {
  // Everything below is wrapped, because anything that throws here — an
  // unconfigured environment, a database that is behind on migrations —
  // leaves the customer looking at a spinner on a page about to take
  // their money. A refusal they can read and retry is the worst this is
  // allowed to be.
  try {
    return await start(slug);
  } catch (error) {
    console.error("Guest checkout could not be started", error);
    return {
      ok: false,
      error:
        "We could not open the payment window just now. Please try again, or create an account and pay from Billing.",
    };
  }
}

async function start(slug: string): Promise<GuestCheckoutResult> {
  const wanted = (slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(wanted)) {
    return { ok: false, error: "That plan does not exist." };
  }

  const admin = createAdminClient();

  const { data: plan } = await admin
    .from("plans")
    .select("id, name, slug, price_cents, currency, billing_interval, is_active")
    .eq("slug", wanted)
    .maybeSingle();

  if (!plan || !plan.is_active) {
    return { ok: false, error: "That plan is not on sale." };
  }

  const amount = checkAmount(plan.price_cents);
  if (!amount.ok) return { ok: false, error: amount.error };

  const gateway = await platformGateway(admin);
  if (!gateway.ok) return { ok: false, error: gateway.error };

  // Razorpay Standard Checkout is the only modal this implements. The
  // other gateways have different contracts, and opening a Razorpay modal
  // against Cashfree credentials fails in a way nobody can read.
  if (gateway.provider !== "razorpay") {
    return {
      ok: false,
      error: "Paying straight from the pricing page needs Razorpay. Create an account and pay from Billing.",
    };
  }

  const stored = await loadIntegration(admin, gateway.orgId, gateway.provider);
  if (!stored) {
    return {
      ok: false,
      error: "Online payment is not finished being set up. Create an account and we will sort the plan out with you.",
    };
  }

  const interval: BillingInterval = plan.billing_interval === "yearly" ? "yearly" : "monthly";
  const claimToken = randomBytes(CLAIM_TOKEN_LENGTH / 2).toString("hex");

  const { data: guest, error: guestError } = await admin
    .from("guest_checkouts")
    .insert({
      plan_id: plan.id,
      claim_token: claimToken,
      amount_cents: plan.price_cents,
      currency: plan.currency,
      billing_interval: interval,
      status: "pending",
      provider: gateway.provider,
    })
    .select("id")
    .single();

  if (guestError || !guest) {
    return { ok: false, error: guestError?.message ?? "Could not start the purchase." };
  }

  const created = await createRazorpayOrder(
    { provider: "razorpay", credentials: stored.values, config: stored.config ?? {} },
    {
      amountPaise: amount.paise,
      currency: plan.currency,
      // The gateway's own receipt, so a payment can be traced back to a
      // row here from Razorpay's dashboard without a database.
      receipt: `guest-${guest.id.slice(0, 20)}`,
      notes: { guest_checkout: guest.id, plan: plan.slug },
    }
  );

  if (!created.ok) {
    await admin.from("guest_checkouts").update({ status: "expired" }).eq("id", guest.id);
    return { ok: false, error: created.error };
  }

  // Stored before the modal opens, because this is what the payment is
  // matched on afterwards. Taking an id from the browser instead would
  // let anybody mark any checkout paid by naming it.
  await admin
    .from("guest_checkouts")
    .update({ provider_reference: created.id })
    .eq("id", guest.id);

  return {
    ok: true,
    claimToken,
    planName: plan.name,
    checkout: {
      keyId: created.keyId,
      orderId: created.id,
      amount: created.amountPaise,
      currency: created.currency,
      description: `${plan.name} (${interval})`,
    },
  };
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Whose gateway credentials take the platform's own money.
 *
 * A customer paying us must not be charged through their own Razorpay
 * account — the money would go to them.
 */
async function platformGateway(
  admin: Admin
): Promise<{ ok: true; orgId: string; provider: string } | { ok: false; error: string }> {
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
        "Online payment is not set up on this deployment yet. Create an account and we will sort the plan out with you.",
    };
  }

  return { ok: true, orgId, provider };
}
