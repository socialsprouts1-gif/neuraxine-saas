"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateSubscription } from "@/lib/subscription-activate";
import { readTrialDays } from "@/lib/trial";
import {
  canClaim,
  normaliseClaimToken,
  bonusDaysFor,
  readGuestContact,
  type GuestContact,
} from "@/lib/guest-checkout";

// Turning a payment into a workspace.
//
// The guest checkout took the money before an account existed. This is
// the other half: somebody has now signed up, and the plan they already
// paid for has to land on their brand-new workspace.
//
// The claim token is the only thing that ties the two together, so it is
// treated like a credential — checked, spent once, and never returned to
// the browser again afterwards.

export interface ClaimSummary {
  ok: true;
  planName: string;
  contact: GuestContact;
  amountCents: number;
  currency: string;
}

export type ClaimLookup = ClaimSummary | { ok: false; error: string; alreadyClaimed?: boolean };

/**
 * What a claim token is worth, for the sign-up page to show and prefill.
 *
 * Read-only and deliberately thin: it returns the plan's name and the
 * contact details the gateway already collected, and nothing that would
 * help somebody who found the token do anything else with it.
 */
export async function describeClaim(token: string): Promise<ClaimLookup> {
  const claim = normaliseClaimToken(token);
  if (!claim) return { ok: false, error: "That payment link is not valid." };

  const admin = createAdminClient();

  const { data: guest } = await admin
    .from("guest_checkouts")
    .select(
      "id, plan_id, status, paid_at, amount_cents, currency, contact_name, contact_email, contact_phone"
    )
    .eq("claim_token", claim)
    .maybeSingle();

  if (!guest) return { ok: false, error: "That payment link is not valid." };

  const verdict = canClaim(guest);
  if (!verdict.ok) {
    return { ok: false, error: verdict.reason, alreadyClaimed: verdict.alreadyClaimed };
  }

  const { data: plan } = await admin
    .from("plans")
    .select("name")
    .eq("id", guest.plan_id)
    .maybeSingle();

  return {
    ok: true,
    planName: plan?.name ?? "your plan",
    contact: readGuestContact(guest),
    amountCents: guest.amount_cents,
    currency: guest.currency,
  };
}

export interface ClaimResult {
  ok: boolean;
  error?: string;
  planName?: string;
  bonusDays?: number;
}

/**
 * Attaches a paid guest checkout to the workspace of whoever is signed in.
 *
 * Called straight after sign-up. The workspace comes from the session,
 * never from an argument, so a token alone cannot move somebody else's
 * payment onto a workspace of the caller's choosing.
 */
export async function claimGuestCheckout(token: string): Promise<ClaimResult> {
  const claim = normaliseClaimToken(token);
  if (!claim) return { ok: false, error: "That payment link is not valid." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return { ok: false, error: "Sign in first, then the plan will be applied." };

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const orgId = membership?.org_id;
  if (!orgId) return { ok: false, error: "Your workspace is still being created. Try again in a moment." };

  const { data: guest } = await admin
    .from("guest_checkouts")
    .select(
      "id, plan_id, status, paid_at, amount_cents, currency, billing_interval, provider, provider_reference, provider_payment_id"
    )
    .eq("claim_token", claim)
    .maybeSingle();

  if (!guest) return { ok: false, error: "That payment link is not valid." };

  const verdict = canClaim(guest);
  if (!verdict.ok) return { ok: false, error: verdict.reason };

  // Spent before the subscription is written. Two tabs finishing sign-up
  // at once would otherwise both pass the check above and both activate;
  // the update is conditional on the row still being 'paid', so exactly
  // one of them changes a row and the other gets nothing back.
  const { data: spent } = await admin
    .from("guest_checkouts")
    .update({
      status: "claimed",
      claimed_at: new Date().toISOString(),
      claimed_org_id: orgId,
    })
    .eq("id", guest.id)
    .eq("status", "paid")
    .select("id");

  if (!spent || spent.length === 0) {
    return { ok: false, error: "That payment has already been used to create a workspace." };
  }

  // The order row the rest of the product reads: billing history, the
  // receipt email, the admin screens. It is written already paid because
  // it is a record of a payment that has demonstrably happened.
  const { data: plan } = await admin
    .from("plans")
    .select("name")
    .eq("id", guest.plan_id)
    .maybeSingle();

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      org_id: orgId,
      plan_id: guest.plan_id,
      kind: "subscription",
      description: `${plan?.name ?? "Plan"} (${guest.billing_interval}) — paid at sign-up`,
      amount_cents: guest.amount_cents,
      currency: guest.currency,
      billing_interval: guest.billing_interval,
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    // The token is spent and the money is taken. Loud, because this needs
    // a human: the customer has paid and has no plan.
    console.error(`Claimed guest checkout ${guest.id} but could not write its order`, orderError);
    return {
      ok: false,
      error:
        "Your payment is recorded but the plan could not be applied automatically. Contact support and we will fix it right away.",
    };
  }

  const { data: billing } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "billing")
    .maybeSingle();

  // The trial they would have had for signing up free, plus the bonus for
  // paying up front — both on top of the interval they bought.
  const bonusDays = bonusDaysFor(readTrialDays(billing?.value));

  const activated = await activateSubscription(
    admin,
    order.id,
    {
      provider: guest.provider ?? "razorpay",
      reference: guest.provider_payment_id ?? guest.provider_reference ?? guest.id,
    },
    { bonusDays }
  );

  if (!activated.ok) {
    console.error(`Claimed guest checkout ${guest.id} but activation failed: ${activated.error}`);
    return {
      ok: false,
      error:
        "Your payment is recorded but the plan could not be applied automatically. Contact support and we will fix it right away.",
    };
  }

  return { ok: true, planName: plan?.name ?? "your plan", bonusDays };
}
