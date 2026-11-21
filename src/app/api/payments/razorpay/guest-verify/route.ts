import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadIntegration } from "@/lib/integration-store";
import { readCheckoutFields, verifyCheckoutSignature } from "@/lib/razorpay-checkout";

// The guest half of the payment handshake.
//
// The signed-in verify route next door proves two things: that Razorpay
// sent these fields, and that the person asking owns the order. Here
// there is nobody to own anything yet — the whole point is that the
// payment comes before the account.
//
// So the signature is the only proof, and it is enough for what this
// does: it marks one specific guest checkout paid, and that checkout was
// matched on Razorpay's own order id, which was written down before the
// modal opened. Nothing here creates a workspace or grants a plan; the
// claim token does that, later, once somebody has made an account.

export const dynamic = "force-dynamic";

const PLATFORM_ORG_SETTING = "platform_payment_org";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const fields = readCheckoutFields(body);

  if (!fields) {
    return NextResponse.json(
      { ok: false, error: "The payment response was incomplete." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Matched on Razorpay's id, stored before the modal opened. Taking a
  // checkout id from the request body instead would let anybody mark any
  // checkout paid by naming it.
  const { data: guest } = await admin
    .from("guest_checkouts")
    .select("id, status, claim_token")
    .eq("provider_reference", fields.razorpay_order_id)
    .maybeSingle();

  if (!guest) {
    return NextResponse.json(
      { ok: false, error: "That payment does not match a checkout here." },
      { status: 404 }
    );
  }

  const { data: setting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", PLATFORM_ORG_SETTING)
    .maybeSingle();

  const gatewayOrg = (setting?.value as { org_id?: string } | null)?.org_id?.trim();
  if (!gatewayOrg) {
    return NextResponse.json(
      { ok: false, error: "The payment gateway is not configured." },
      { status: 500 }
    );
  }

  const stored = await loadIntegration(admin, gatewayOrg, "razorpay");
  const secret = stored?.values?.key_secret;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "The payment gateway is not configured." },
      { status: 500 }
    );
  }

  // The whole security of this route. Without it, anybody who could guess
  // a Razorpay order id could mark a checkout paid and claim a plan.
  if (!verifyCheckoutSignature(fields, secret)) {
    console.error(`Rejected a guest payment with a bad signature: ${fields.razorpay_order_id}`);
    return NextResponse.json(
      { ok: false, error: "That payment could not be verified." },
      { status: 400 }
    );
  }

  // Already done — the modal was submitted twice, or the page reloaded.
  // The token is returned either way so the customer still gets through.
  if (guest.status === "paid" || guest.status === "claimed") {
    return NextResponse.json({ ok: true, claimToken: guest.claim_token, alreadyDone: true });
  }

  // Whatever the gateway collected before taking the card, used only to
  // prefill the sign-up form. Never trusted as identity — the person can
  // still correct every field.
  const contact = readContact(body);

  const { error } = await admin
    .from("guest_checkouts")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      provider_payment_id: fields.razorpay_payment_id,
      ...contact,
    })
    .eq("id", guest.id)
    .select("id");

  if (error) {
    // The money is taken. Saying "payment failed" here would be a lie
    // that costs a refund and a support ticket.
    console.error("Verified a guest payment but could not record it", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Your payment went through, but we could not finish setting up. Please contact support with this page open.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, claimToken: guest.claim_token });
}

/** The optional contact fields the modal sends back, trimmed and capped. */
function readContact(body: Record<string, unknown> | null) {
  const text = (key: string) => {
    const value = body?.[key];
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
  };
  return {
    contact_name: text("name"),
    contact_email: text("email"),
    contact_phone: text("contact"),
  };
}
