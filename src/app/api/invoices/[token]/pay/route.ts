import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { attachPaymentLink } from "@/lib/invoice-engine";

// "Pay now" on a shared invoice.
//
// The payment link used to be created only when an invoice was sent from
// the Invoices screen over WhatsApp. Any other way of sharing it — copying
// the link into a chat, forwarding it, pasting it in an email — produced a
// perfectly good invoice page with no way to pay from it. The customer read
// the bill, found no button, and the business chased them by hand.
//
// So the link is made when somebody actually goes to pay, rather than in
// advance on one particular route out of the building. It is stored on the
// invoice as before, so the second visitor reuses the first one's link and
// the gateway sees one payment request per invoice, not one per view.

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invoicePage = `/i/${encodeURIComponent(token)}`;

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL(`${invoicePage}?pay=unavailable`, _request.url));
  }

  const supabase = createAdminClient();

  // By token, with the service role: the same reasoning as the invoice
  // page itself. An RLS policy loose enough to allow a token lookup is
  // loose enough to allow listing every invoice on the platform.
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, org_id, number, status, total_cents, amount_paid_cents, currency, customer_name, customer_phone, payment_link_url"
    )
    .eq("public_token", token)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.redirect(new URL(invoicePage, _request.url));
  }

  const outstanding = invoice.total_cents - invoice.amount_paid_cents;
  const settled = invoice.status === "paid" || outstanding <= 0;

  // Nothing to pay, or nothing that should be paid. Back to the invoice,
  // which says which of the two it is.
  if (settled || invoice.status === "cancelled") {
    return NextResponse.redirect(new URL(invoicePage, _request.url));
  }

  if (invoice.payment_link_url) {
    return NextResponse.redirect(invoice.payment_link_url);
  }

  const link = await attachPaymentLink(supabase, invoice.org_id, invoice);

  if (!link.ok) {
    // The reason is for the business, not the customer: it names their
    // gateway configuration. The customer gets the invoice page back,
    // which still carries the bank details and the UPI id.
    console.error(`Could not create a payment link for invoice ${invoice.id}: ${link.error}`);
    return NextResponse.redirect(new URL(`${invoicePage}?pay=unavailable`, _request.url));
  }

  return NextResponse.redirect(link.url);
}
