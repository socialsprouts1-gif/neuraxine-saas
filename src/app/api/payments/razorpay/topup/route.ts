import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrg } from "@/lib/org";
import { loadIntegration } from "@/lib/integration-store";
import { readCheckoutFields, verifyCheckoutSignature } from "@/lib/razorpay-checkout";
import { formatMoney } from "@/lib/wallet";
import { isPaymentProvider } from "@/lib/provider-meta";

// Crediting a wallet top-up, once the payment is proved.
//
// The order is matched on Razorpay's own id, which was stored before the
// modal opened. Taking the amount from the request body instead would let
// anybody credit any amount by naming it — the signature proves Razorpay
// sent these three fields, not what they were worth.
//
// Crediting twice is refused by the ledger rather than by a check here:
// the unique index on (org_id, kind, reference) means the second attempt
// loses its insert, and wallet_move returns the balance unchanged. So a
// customer who presses the button twice, or whose browser retries, is
// credited once.

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Signed in, because this credits the caller's own workspace. The
  // signature proves Razorpay sent the fields; it does not prove who is
  // asking, and those are different questions.
  const ctx = await requireOrg();

  const fields = readCheckoutFields(await request.json().catch(() => null));
  if (!fields) {
    return NextResponse.json(
      { ok: false, error: "The payment response was incomplete." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, org_id, amount_cents, currency, status")
    .eq("provider_reference", fields.razorpay_order_id)
    .eq("kind", "wallet_topup")
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ ok: false, error: "That top-up is not on file." }, { status: 404 });
  }

  // Somebody else's top-up, named by its id. The signature would check out
  // perfectly; it says nothing about whose wallet this is.
  if (order.org_id !== ctx.orgId) {
    return NextResponse.json({ ok: false, error: "That top-up is not yours." }, { status: 403 });
  }

  const gateway = await platformGateway(admin);
  if (!gateway) {
    return NextResponse.json(
      { ok: false, error: "The payment gateway is not configured." },
      { status: 503 }
    );
  }

  const stored = await loadIntegration(admin, gateway.orgId, gateway.provider);
  // values is config with the decrypted credentials laid over it, which is
  // what the subscription route reads. Reaching for credentials first
  // worked by accident and only while the key happened to live there.
  const secret = stored?.values?.key_secret;

  if (!secret) {
    // A missing secret is a refusal, not a pass. A route that credits an
    // unverifiable response is one anybody can top up their own wallet
    // with by posting three made-up strings.
    return NextResponse.json(
      { ok: false, error: "The gateway secret is not available, so this cannot be verified." },
      { status: 503 }
    );
  }

  if (!verifyCheckoutSignature(fields, secret)) {
    return NextResponse.json(
      { ok: false, error: "That payment could not be verified." },
      { status: 400 }
    );
  }

  // The amount comes from the order row, never from the request. The row
  // is in paise, like the rest of billing; the wallet is in micros.
  const credited = order.amount_cents * 10_000;

  const { data: balance, error } = await admin.rpc("wallet_move", {
    p_org_id: order.org_id,
    p_kind: "topup",
    p_amount_micros: credited,
    p_description: `Top-up — ${formatMoney(credited, order.currency)}`,
    // Razorpay's payment id, which is what makes a repeat harmless.
    p_reference: fields.razorpay_payment_id,
    p_allow_negative: true,
  });

  if (error) {
    console.error("Could not credit a wallet top-up", error.message);
    return NextResponse.json(
      { ok: false, error: "The payment went through but the balance could not be updated. We will sort it out — get in touch." },
      { status: 500 }
    );
  }

  await admin
    .from("orders")
    // The payment id lives on the ledger line rather than here, which is
    // also what makes a repeat harmless — orders has no column for it.
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", order.id)
    // Only from pending, so a redelivered webhook and this route cannot
    // both decide they were the one that settled it.
    .eq("status", "pending");

  return NextResponse.json({ ok: true, balance: Number(balance ?? 0) });
}

async function platformGateway(
  admin: ReturnType<typeof createAdminClient>
): Promise<{ orgId: string; provider: string } | null> {
  const { data: setting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "platform_payment_org")
    .maybeSingle();

  const value = setting?.value as { org_id?: string; provider?: string } | null;
  const orgId = value?.org_id?.trim();
  const provider = value?.provider?.trim();

  if (!orgId || !provider || !isPaymentProvider(provider)) return null;
  return { orgId, provider };
}
