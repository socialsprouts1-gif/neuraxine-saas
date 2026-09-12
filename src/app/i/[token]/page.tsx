import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  amountInWords,
  formatInvoiceAmount,
  isOverdue,
  todayIn,
} from "@/lib/invoices";
import type { Invoice, InvoiceItem, InvoiceSettings } from "@/types/portal";
import PrintButton from "./PrintButton";

// The invoice, as the customer sees it.
//
// No login. The token in the URL is eighteen random bytes, which is what
// makes that safe — and it is read with the service role rather than through
// an anonymous RLS policy, because a policy permissive enough to allow a
// token lookup is also permissive enough to allow listing every invoice on
// the platform.
//
// Printable rather than a PDF. Generating one server-side needs a headless
// browser or a layout engine, and WhatsApp would need the file at a public
// URL anyway — so the customer gets a page their phone renders and their
// browser can save. Named as a trade rather than left as a gap.

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await loadInvoice(token);
  if (!loaded) return { title: "Invoice" };

  return {
    title: `Invoice ${loaded.invoice.number ?? ""} · ${
      loaded.settings.business_name ?? "Invoice"
    }`.trim(),
    // Not indexed: this is somebody's bill.
    robots: { index: false, follow: false },
  };
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const loaded = await loadInvoice(token);
  if (!loaded) notFound();

  const { invoice, items, settings } = loaded;
  const today = todayIn(settings.timezone);
  const outstanding = invoice.total_cents - invoice.amount_paid_cents;
  const settled = invoice.status === "paid" || outstanding <= 0;
  const cancelled = invoice.status === "cancelled";
  const overdue = !settled && !cancelled && isOverdue(invoice.due_on, today);

  // Rebuilt from the stored line figures rather than recomputed: the
  // document must not change under the customer if the arithmetic is ever
  // adjusted.
  const bands = new Map<number, { taxable: number; tax: number }>();
  for (const item of items) {
    const percent = Number(item.tax_percent);
    if (percent <= 0) continue;
    const band = bands.get(percent) ?? { taxable: 0, tax: 0 };
    band.taxable += item.taxable_cents;
    band.tax += item.tax_cents;
    bands.set(percent, band);
  }

  const money = (cents: number) => formatInvoiceAmount(cents, invoice.currency);

  return (
    <main className="min-h-screen bg-[#f4f4f5] py-8 px-4 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto">
        {/* Only on screen. The paid or overdue state is the first thing the
            customer needs, and it has no business on a printed document. */}
        <div className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-3">
          <div
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              cancelled
                ? "bg-zinc-200 text-zinc-600"
                : settled
                  ? "bg-emerald-100 text-emerald-800"
                  : overdue
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
            }`}
          >
            {cancelled
              ? "This invoice was cancelled"
              : settled
                ? "Paid — thank you"
                : overdue
                  ? `Overdue since ${invoice.due_on}`
                  : `${money(outstanding)} due${invoice.due_on ? ` by ${invoice.due_on}` : ""}`}
          </div>

          <div className="flex items-center gap-2">
            <PrintButton />
            {!settled && !cancelled && invoice.payment_link_url && (
              <a
                href={invoice.payment_link_url}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
              >
                Pay {money(outstanding)}
              </a>
            )}
          </div>
        </div>

        <article className="bg-white rounded-2xl shadow-sm print:shadow-none print:rounded-none p-8 md:p-10 text-zinc-900">
          <header className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-zinc-200">
            <div className="min-w-0">
              {settings.logo_url ? (
                // Not next/image: the URL is whatever the tenant pasted, and
                // allowlisting every possible host is not worth a build
                // failure on an unknown domain.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logo_url}
                  alt={settings.business_name ?? "Logo"}
                  className="h-12 w-auto mb-3 object-contain"
                />
              ) : null}
              <h1 className="text-xl font-bold">
                {settings.business_name ?? "Invoice"}
              </h1>
              <div className="text-sm text-zinc-600 mt-1 whitespace-pre-line leading-relaxed">
                {[
                  settings.address,
                  [settings.city, settings.state, settings.postal_code]
                    .filter(Boolean)
                    .join(", "),
                  settings.country,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </div>
              <div className="text-sm text-zinc-600 mt-1">
                {settings.gstin && (
                  <div>
                    <span className="text-zinc-400">GSTIN</span> {settings.gstin}
                  </div>
                )}
                {settings.phone && <div>{settings.phone}</div>}
                {settings.email && <div>{settings.email}</div>}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                Tax invoice
              </div>
              <div className="text-2xl font-bold mt-1">{invoice.number ?? "Draft"}</div>
              <dl className="text-sm text-zinc-600 mt-3 space-y-0.5">
                {invoice.issued_on && (
                  <div>
                    <dt className="inline text-zinc-400">Date </dt>
                    <dd className="inline">{invoice.issued_on}</dd>
                  </div>
                )}
                {invoice.due_on && (
                  <div>
                    <dt className="inline text-zinc-400">Due </dt>
                    <dd className="inline">{invoice.due_on}</dd>
                  </div>
                )}
              </dl>
            </div>
          </header>

          <section className="grid sm:grid-cols-2 gap-6 py-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5">
                Billed to
              </div>
              <div className="font-semibold">{invoice.customer_name ?? "—"}</div>
              {invoice.customer_address && (
                <div className="text-sm text-zinc-600 mt-0.5 whitespace-pre-line">
                  {invoice.customer_address}
                </div>
              )}
              {invoice.customer_state && (
                <div className="text-sm text-zinc-600">{invoice.customer_state}</div>
              )}
              {invoice.customer_gstin && (
                <div className="text-sm text-zinc-600 mt-0.5">
                  <span className="text-zinc-400">GSTIN</span> {invoice.customer_gstin}
                </div>
              )}
              {invoice.customer_phone && (
                <div className="text-sm text-zinc-600">{invoice.customer_phone}</div>
              )}
            </div>

            {/* The place of supply, which is what decides IGST versus
                CGST+SGST — and is required on the document. */}
            <div className="sm:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5">
                Place of supply
              </div>
              <div className="text-sm">
                {invoice.customer_state ?? settings.state ?? "—"}
              </div>
              <div className="text-sm text-zinc-500 mt-0.5">
                {invoice.inter_state ? "Inter-state — IGST" : "Intra-state — CGST + SGST"}
              </div>
            </div>
          </section>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-zinc-200 text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="text-left py-2.5 pr-3 font-semibold">Description</th>
                  <th className="text-left py-2.5 px-3 font-semibold whitespace-nowrap">
                    HSN/SAC
                  </th>
                  <th className="text-right py-2.5 px-3 font-semibold">Qty</th>
                  <th className="text-right py-2.5 px-3 font-semibold">Rate</th>
                  <th className="text-right py-2.5 px-3 font-semibold">GST</th>
                  <th className="text-right py-2.5 pl-3 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-100">
                    <td className="py-2.5 pr-3">{item.description}</td>
                    <td className="py-2.5 px-3 text-zinc-500 whitespace-nowrap">
                      {item.hsn_code ?? "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {Number(item.quantity)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      {money(item.unit_price_cents)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      {Number(item.tax_percent)}%
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums font-medium whitespace-nowrap">
                      {money(item.total_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="flex flex-col sm:flex-row justify-between gap-8 pt-6">
            <div className="text-sm max-w-xs">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5">
                Amount in words
              </div>
              <div className="text-zinc-700">
                {amountInWords(invoice.total_cents, invoice.currency)}
              </div>

              {(settings.upi_id || settings.bank_account_number) && (
                <div className="mt-6">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5">
                    Pay by transfer
                  </div>
                  <dl className="text-zinc-700 space-y-0.5">
                    {settings.upi_id && (
                      <div>
                        <dt className="inline text-zinc-400">UPI </dt>
                        <dd className="inline">{settings.upi_id}</dd>
                      </div>
                    )}
                    {settings.bank_account_name && <div>{settings.bank_account_name}</div>}
                    {settings.bank_account_number && (
                      <div>
                        <dt className="inline text-zinc-400">A/C </dt>
                        <dd className="inline tabular-nums">
                          {settings.bank_account_number}
                        </dd>
                      </div>
                    )}
                    {settings.bank_ifsc && (
                      <div>
                        <dt className="inline text-zinc-400">IFSC </dt>
                        <dd className="inline">{settings.bank_ifsc}</dd>
                      </div>
                    )}
                    {settings.bank_name && (
                      <div className="text-zinc-500">{settings.bank_name}</div>
                    )}
                  </dl>
                </div>
              )}
            </div>

            <dl className="text-sm w-full sm:w-72 space-y-1.5">
              <Row label="Subtotal" value={money(invoice.subtotal_cents)} />
              {invoice.discount_cents > 0 && (
                <Row label="Discount" value={`− ${money(invoice.discount_cents)}`} />
              )}
              <Row label="Taxable value" value={money(invoice.taxable_cents)} />

              {[...bands.entries()]
                .sort(([a], [b]) => a - b)
                .map(([percent, band]) =>
                  invoice.inter_state ? (
                    <Row
                      key={percent}
                      label={`IGST ${percent}%`}
                      value={money(band.tax)}
                    />
                  ) : (
                    <div key={percent}>
                      <Row
                        label={`CGST ${percent / 2}%`}
                        value={money(Math.floor(band.tax / 2))}
                      />
                      <Row
                        label={`SGST ${percent / 2}%`}
                        value={money(band.tax - Math.floor(band.tax / 2))}
                      />
                    </div>
                  )
                )}

              {invoice.round_off_cents !== 0 && (
                <Row
                  label="Round off"
                  value={`${invoice.round_off_cents > 0 ? "+" : "−"} ${money(
                    Math.abs(invoice.round_off_cents)
                  )}`}
                />
              )}

              <div className="flex items-center justify-between pt-2 mt-2 border-t border-zinc-300">
                <dt className="font-bold">Total</dt>
                <dd className="font-bold text-lg tabular-nums">
                  {money(invoice.total_cents)}
                </dd>
              </div>

              {invoice.amount_paid_cents > 0 && (
                <>
                  <Row label="Paid" value={`− ${money(invoice.amount_paid_cents)}`} />
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-200">
                    <dt className="font-semibold">Balance due</dt>
                    <dd className="font-semibold tabular-nums">{money(outstanding)}</dd>
                  </div>
                </>
              )}
            </dl>
          </section>

          {(invoice.notes || invoice.terms_text || settings.terms_text) && (
            <footer className="mt-8 pt-6 border-t border-zinc-200 text-xs text-zinc-500 space-y-3">
              {invoice.notes && (
                <div>
                  <div className="font-semibold text-zinc-600 mb-0.5">Notes</div>
                  <p className="whitespace-pre-line">{invoice.notes}</p>
                </div>
              )}
              <div>
                <div className="font-semibold text-zinc-600 mb-0.5">Terms</div>
                <p className="whitespace-pre-line">
                  {invoice.terms_text ?? settings.terms_text}
                </p>
              </div>
              {invoice.number && (
                <p className="text-zinc-400">
                  This is a computer-generated invoice.
                </p>
              )}
            </footer>
          )}
        </article>

        <p className="print:hidden text-center text-xs text-zinc-400 mt-4">
          Questions about this invoice? Reply on WhatsApp.
        </p>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

interface Loaded {
  invoice: Invoice;
  items: InvoiceItem[];
  settings: InvoiceSettings;
}

/**
 * The invoice behind a token.
 *
 * A draft is deliberately not found: it has no number and has not been
 * issued, so a link to one leaked from the builder must not render as a
 * document.
 */
async function loadInvoice(token: string): Promise<Loaded | null> {
  if (!isSupabaseConfigured()) return null;
  if (!/^[a-f0-9]{20,80}$/.test(token)) return null;

  try {
    const supabase = createAdminClient();

    const { data: invoice } = await supabase
      .from("invoices")
      .select("*")
      .eq("public_token", token)
      .maybeSingle();

    if (!invoice || !invoice.number) return null;

    const [{ data: items }, { data: settings }] = await Promise.all([
      supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoice.id)
        .order("sort_order"),
      supabase
        .from("invoice_settings")
        .select("*")
        .eq("org_id", invoice.org_id)
        .maybeSingle(),
    ]);

    return {
      invoice: invoice as Invoice,
      items: (items ?? []) as InvoiceItem[],
      // A workspace that never opened the settings screen still has an
      // invoice worth rendering; the header is just thinner.
      settings: (settings ?? { org_id: invoice.org_id }) as InvoiceSettings,
    };
  } catch (error) {
    console.error("Could not load the public invoice", error);
    return null;
  }
}
