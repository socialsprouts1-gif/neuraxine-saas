import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { loadInvoiceSettings } from "@/lib/invoice-engine";
import { formatInvoiceAmount, isOverdue, todayIn } from "@/lib/invoices";
import { HeroHeader, StatCard } from "@/components/ui/primitives";
import InvoiceListBrowser from "./InvoiceListBrowser";
import type { InvoiceListRow } from "./InvoiceRow";

// The invoices themselves.
//
// Ordered newest first, with the money that is actually owed on the cards
// rather than the money that was billed — "₹4.2 lakh invoiced" is a vanity
// figure next to "₹80,000 overdue".

export default async function InvoiceListPage() {
  const { orgId } = await requireFeature("invoicing");
  const supabase = await createClient();

  const settings = await loadInvoiceSettings(supabase, orgId);

  const [invoicesResult, contactsResult] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("contacts")
      .select("id, name, wa_id, custom_fields")
      .eq("org_id", orgId)
      .order("name")
      .limit(500),
  ]);

  const migrated = !invoicesResult.error;
  const rows = invoicesResult.data ?? [];

  // Lines for everything on screen, in one query rather than one per row.
  const { data: itemRows } = migrated && rows.length > 0
    ? await supabase
        .from("invoice_items")
        .select("*")
        .in(
          "invoice_id",
          rows.map((row) => row.id)
        )
        .order("sort_order")
    : { data: [] };

  const linesByInvoice = new Map<string, InvoiceListRow["lines"]>();
  for (const item of itemRows ?? []) {
    const list = linesByInvoice.get(item.invoice_id) ?? [];
    list.push({
      description: item.description,
      hsnCode: item.hsn_code,
      quantity: Number(item.quantity),
      unitPriceCents: item.unit_price_cents,
      taxPercent: Number(item.tax_percent),
      discountPercent: Number(item.discount_percent),
      totalCents: item.total_cents,
    });
    linesByInvoice.set(item.invoice_id, list);
  }

  const invoices: InvoiceListRow[] = rows.map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status,
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    currency: row.currency,
    totalCents: row.total_cents,
    amountPaidCents: row.amount_paid_cents,
    customerName: row.customer_name,
    customerGstin: row.customer_gstin,
    customerAddress: row.customer_address,
    customerState: row.customer_state,
    notes: row.notes,
    contactId: row.contact_id,
    interState: row.inter_state,
    publicToken: row.public_token,
    paymentLinkUrl: row.payment_link_url,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    recurringId: row.recurring_id,
    lines: linesByInvoice.get(row.id) ?? [],
  }));

  const today = todayIn(settings.timezone);

  const live = invoices.filter(
    (invoice) => invoice.status !== "cancelled" && invoice.status !== "draft"
  );
  const outstanding = live.reduce(
    (total, invoice) => total + Math.max(0, invoice.totalCents - invoice.amountPaidCents),
    0
  );
  const overdueList = live.filter(
    (invoice) =>
      invoice.totalCents - invoice.amountPaidCents > 0 && isOverdue(invoice.dueOn, today)
  );
  const overdueTotal = overdueList.reduce(
    (total, invoice) => total + (invoice.totalCents - invoice.amountPaidCents),
    0
  );
  const collected = invoices.reduce((total, invoice) => total + invoice.amountPaidCents, 0);

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Invoices"
        subtitle="Raise it, send it on WhatsApp, and know when it has been paid."
      />

      {migrated && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Outstanding" value={formatInvoiceAmount(outstanding)} />
          <StatCard
            label="Overdue"
            value={formatInvoiceAmount(overdueTotal)}
            hint={`${overdueList.length} ${overdueList.length === 1 ? "invoice" : "invoices"}`}
          />
          <StatCard label="Collected" value={formatInvoiceAmount(collected)} />
          <StatCard label="Drafts" value={invoices.filter((i) => i.status === "draft").length} />
        </div>
      )}

      {!settings.business_name && migrated && (
        <div className="glass-card p-4 mb-5">
          <p className="text-xs text-white/65 leading-relaxed">
            No business name is set, so invoices will go out without one.{" "}
            <Link href="/invoice/settings" className="text-accent-ink hover:underline">
              Fill in your details
            </Link>{" "}
            first — the name, address and GSTIN are what make it a document somebody can file.
          </p>
        </div>
      )}

      <InvoiceListBrowser
        invoices={invoices}
        migrated={migrated}
        migrationError={invoicesResult.error?.message ?? null}
        today={today}
        contacts={(contactsResult.data ?? []).map((contact) => {
          const custom = (contact.custom_fields ?? {}) as Record<string, string>;
          return {
            id: contact.id,
            label: contact.name || contact.wa_id,
            gstin: custom.gstin ?? custom.GSTIN ?? null,
          };
        })}
        defaultTax={Number(settings.default_tax_percent) || 0}
        sellerGstin={settings.gstin}
        roundToRupee={settings.round_to_rupee}
        currency={settings.currency}
      />
    </div>
  );
}
