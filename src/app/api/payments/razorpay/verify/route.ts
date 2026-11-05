import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrg } from "@/lib/org";
import { loadIntegration } from "@/lib/integration-store";
import { isPaymentProvider } from "@/lib/provider-meta";
import { readCheckoutFields, verifyCheckoutSignature } from "@/lib/razorpay-checkout";
import { activateSubscription } from "@/lib/subscription-activate";
import { checkoutReference } from "@/lib/checkout";

// What the browser hands back when a Standard Checkout modal succeeds.
//
// The webhook remains the thing that decides a workspace is on a plan.
// This exists because the webhook can take a few seconds and the customer
// is sitting on the page watching — so the same activation is done here
// too, from a signature checked with the same secret. Whichever arrives
// first wins, and the second is a no-op, because activateSubscription
// refuses an order that is already paid.
//
// It is emphatically not a shortcut past the webhook. A customer who
// closes the tab the instant the modal succeeds never reaches this route,
// and must still get what they paid for.

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Signed in, because this activates a plan for the caller's own
  // workspace. The signature proves Razorpay sent these three fields; it
  // does not prove who is asking, and those are different questions.
  const ctx = await requireOrg();

  const fields = readCheckoutFields(await request.json().catch(() => null));
  if (!fields) {
    return NextResponse.json(
      { ok: false, error: "The payment response was incomplete." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // The order is matched on Razorpay's own id, which was stored when the
  // order was created. Taking the order id from the request body instead
  // would let anybody activate any order by naming it.
  const { data: order } = await admin
    .from("orders")
    .select("id, org_id, status")
    .eq("provider_reference", fields.razorpay_order_id)
    .eq("kind", "subscription")
    .maybeSingle();

  if (!order) {
    return NextResponse.json(
      { ok: false, error: "That payment does not match an order here." },
      { status: 404 }
    );
  }

  if (order.org_id !== ctx.orgId) {
    return NextResponse.json({ ok: false, error: "That order is not yours." }, { status: 403 });
  }

  const { data: setting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "platform_payment_org")
    .maybeSingle();

  const gateway = setting?.value as { org_id?: string; provider?: string } | null;
  if (!gateway?.org_id || !gateway.provider || !isPaymentProvider(gateway.provider)) {
    return NextResponse.json(
      { ok: false, error: "No payment gateway is configured." },
      { status: 503 }
    );
  }

  const stored = await loadIntegration(admin, gateway.org_id, gateway.provider);
  const secret = stored?.values?.key_secret;
  if (!secret) {
    // A missing secret is a refusal, not a pass. A route that accepts an
    // unverifiable response is one anybody can use to grant themselves a
    // plan by posting three made-up strings.
    return NextResponse.json(
      { ok: false, error: "The gateway secret is not available, so this cannot be verified." },
      { status: 503 }
    );
  }

  if (!verifyCheckoutSignature(fields, secret)) {
    // Only a pending order is failed here. One the webhook has already
    // marked paid must not be undone by a bad response arriving after it.
    await admin
      .from("orders")
      .update({ status: "failed" })
      .eq("id", order.id)
      .eq("status", "pending");

    return NextResponse.json(
      { ok: false, error: "That payment could not be verified." },
      { status: 400 }
    );
  }

  const activated = await activateSubscription(admin, order.id, {
    provider: "razorpay",
    reference: checkoutReference(order.id),
  });

  if (!activated.ok) {
    return NextResponse.json({ ok: false, error: activated.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    // Told apart so the page can say "already done" rather than claiming
    // to have just activated something the webhook activated first.
    alreadyDone: Boolean(activated.alreadyDone),
    planName: activated.planName ?? null,
  });
}
