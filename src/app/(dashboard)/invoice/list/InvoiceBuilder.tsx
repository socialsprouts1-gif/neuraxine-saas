"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import ActionForm, { Field, TextareaField } from "@/components/ui/ActionForm";
import {
  formatInvoiceAmount,
  invoiceTotals,
  isValidGstin,
  type InvoiceLine,
} from "@/lib/invoices";
import { saveInvoice } from "../../invoice-actions";

export interface BuilderLine {
  description: string;
  hsnCode: string;
  quantity: string;
  price: string;
  tax: string;
  discount: string;
}

export interface BuilderInvoice {
  id: string;
  contactId: string | null;
  customerName: string;
  customerGstin: string;
  customerAddress: string;
  customerState: string;
  customerEmail: string;
  notes: string;
  lines: BuilderLine[];
}

function blankLine(defaultTax: number): BuilderLine {
  return {
    description: "",
    hsnCode: "",
    quantity: "1",
    price: "",
    tax: String(defaultTax),
    discount: "0",
  };
}

/**
 * The invoice builder.
 *
 * The totals are computed here as you type, using the same pure function the
 * server uses to write them — so the figure on screen is the figure that
 * gets stored, rather than an approximation that turns out to differ by a
 * rupee once tax rounding is involved.
 */
export default function InvoiceBuilder({
  contacts,
  defaultTax,
  sellerGstin,
  roundToRupee,
  currency,
  existing,
  onDone,
}: {
  contacts: Array<{ id: string; label: string; gstin: string | null }>;
  defaultTax: number;
  sellerGstin: string | null;
  roundToRupee: boolean;
  currency: string;
  existing?: BuilderInvoice;
  onDone?: () => void;
}) {
  const [lines, setLines] = useState<BuilderLine[]>(
    existing?.lines.length ? existing.lines : [blankLine(defaultTax)]
  );
  const [customerGstin, setCustomerGstin] = useState(existing?.customerGstin ?? "");
  const [contactId, setContactId] = useState(existing?.contactId ?? "");

  const update = (index: number, patch: Partial<BuilderLine>) =>
    setLines((current) =>
      current.map((line, at) => (at === index ? { ...line, ...patch } : line))
    );

  // The same arithmetic the server runs, on what is typed so far. Lines with
  // no amount are left out, so an empty row does not read as a zero line.
  const parsed: InvoiceLine[] = lines
    .filter((line) => line.description.trim() && Number(line.price) > 0)
    .map((line) => ({
      description: line.description,
      quantity: Number(line.quantity) || 1,
      unitPriceCents: Math.round((Number(line.price) || 0) * 100),
      taxPercent: Number(line.tax) || 0,
      discountPercent: Number(line.discount) || 0,
    }));

  const sellerState = (sellerGstin ?? "").slice(0, 2);
  const customerState = customerGstin.slice(0, 2);
  const interState =
    sellerState.length === 2 &&
    customerState.length === 2 &&
    sellerState !== customerState;

  const totals = invoiceTotals(parsed, { interState, roundToRupee });
  const gstinLooksRight = customerGstin.trim() === "" || isValidGstin(customerGstin);

  return (
    <ActionForm
      action={saveInvoice}
      submitLabel={existing?.id ? "Save changes" : "Save draft"}
      className="glass-card p-6"
    >
      {existing?.id && <input type="hidden" name="id" value={existing.id} />}

      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold">{existing?.id ? "Edit invoice" : "New invoice"}</h3>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-white/40 hover:text-white transition-colors"
          >
            Close
          </button>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
            Bill to
          </h4>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-white/70 mb-1.5">Customer</span>
              <select
                name="contact_id"
                value={contactId}
                onChange={(event) => {
                  setContactId(event.target.value);
                  // Prefill the GSTIN we already hold for this contact: it is
                  // what decides the tax split, and typing it twice is how
                  // the two copies end up different.
                  const chosen = contacts.find((entry) => entry.id === event.target.value);
                  if (chosen?.gstin) setCustomerGstin(chosen.gstin);
                }}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
              >
                <option value="" className="bg-[var(--surface-3)]">
                  Not a saved contact
                </option>
                {contacts.map((contact) => (
                  <option
                    key={contact.id}
                    value={contact.id}
                    className="bg-[var(--surface-3)]"
                  >
                    {contact.label}
                  </option>
                ))}
              </select>
              <span className="block text-[11px] text-white/35 mt-1">
                A contact is needed to send the invoice on WhatsApp.
              </span>
            </label>

            <Field
              label="Name on the invoice"
              name="customer_name"
              defaultValue={existing?.customerName ?? ""}
              hint="Leave blank to use the contact's name."
            />

            <label className="block">
              <span className="block text-xs font-medium text-white/70 mb-1.5">
                Customer GSTIN
              </span>
              <input
                name="customer_gstin"
                value={customerGstin}
                onChange={(event) => setCustomerGstin(event.target.value.toUpperCase())}
                maxLength={15}
                placeholder="Optional"
                className={`w-full bg-white/5 border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none transition-all font-mono ${
                  gstinLooksRight
                    ? "border-white/12 focus:border-accent/50"
                    : "border-[#F87171]/50 focus:border-[#F87171]"
                }`}
              />
              <span
                className={`block text-[11px] mt-1 ${
                  gstinLooksRight ? "text-white/35" : "text-[#F87171]"
                }`}
              >
                {!gstinLooksRight
                  ? "Does not check out — the last character is a checksum."
                  : interState
                    ? `Different state to yours, so this bills IGST.`
                    : "Same state as yours, so this bills CGST + SGST."}
              </span>
            </label>

            <Field
              label="Customer state"
              name="customer_state"
              defaultValue={existing?.customerState ?? ""}
              placeholder="Maharashtra"
            />
          </div>

          <div className="mt-4">
            <TextareaField
              label="Billing address"
              name="customer_address"
              rows={2}
              defaultValue={existing?.customerAddress ?? ""}
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40">
              Lines
            </h4>
            <span className="text-[11px] text-white/35">Amounts in rupees, before tax</span>
          </div>

          <div className="space-y-2">
            {lines.map((line, index) => (
              <div
                key={index}
                className="rounded-xl border border-white/8 bg-white/4 p-3 space-y-2"
              >
                <div className="flex gap-2">
                  <input
                    name="line_description"
                    value={line.description}
                    onChange={(event) => update(index, { description: event.target.value })}
                    placeholder="What is being billed"
                    className="flex-1 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove this line"
                      onClick={() => setLines(lines.filter((_, at) => at !== index))}
                      className="p-2 rounded-lg text-white/35 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <LineInput
                    label="HSN/SAC"
                    name="line_hsn"
                    value={line.hsnCode}
                    onChange={(value) => update(index, { hsnCode: value })}
                  />
                  <LineInput
                    label="Qty"
                    name="line_quantity"
                    type="number"
                    value={line.quantity}
                    onChange={(value) => update(index, { quantity: value })}
                  />
                  <LineInput
                    label="Rate ₹"
                    name="line_price"
                    type="number"
                    value={line.price}
                    onChange={(value) => update(index, { price: value })}
                  />
                  <LineInput
                    label="GST %"
                    name="line_tax"
                    type="number"
                    value={line.tax}
                    onChange={(value) => update(index, { tax: value })}
                  />
                  <LineInput
                    label="Disc %"
                    name="line_discount"
                    type="number"
                    value={line.discount}
                    onChange={(value) => update(index, { discount: value })}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setLines([...lines, blankLine(defaultTax)])}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/8 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add a line
          </button>
        </div>

        {/* The running total, from the same function the server uses — so
            what is on screen is what gets stored. */}
        <div className="rounded-xl border border-white/10 bg-white/4 p-4">
          <div className="space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatInvoiceAmount(totals.subtotalCents, currency)} />
            {totals.discountCents > 0 && (
              <Row
                label="Discount"
                value={`− ${formatInvoiceAmount(totals.discountCents, currency)}`}
              />
            )}
            {totals.bands
              .filter((band) => band.percent > 0)
              .map((band) =>
                interState ? (
                  <Row
                    key={band.percent}
                    label={`IGST ${band.percent}%`}
                    value={formatInvoiceAmount(band.igstCents, currency)}
                  />
                ) : (
                  <div key={band.percent}>
                    <Row
                      label={`CGST ${band.percent / 2}%`}
                      value={formatInvoiceAmount(band.cgstCents, currency)}
                    />
                    <Row
                      label={`SGST ${band.percent / 2}%`}
                      value={formatInvoiceAmount(band.sgstCents, currency)}
                    />
                  </div>
                )
              )}
            {totals.roundOffCents !== 0 && (
              <Row
                label="Round off"
                value={`${totals.roundOffCents > 0 ? "+" : "−"} ${formatInvoiceAmount(
                  Math.abs(totals.roundOffCents),
                  currency
                )}`}
              />
            )}
            <div className="pt-2 mt-2 border-t border-white/8">
              <Row
                label="Total"
                value={formatInvoiceAmount(totals.totalCents, currency)}
                strong
              />
            </div>
          </div>
        </div>

        <TextareaField
          label="Notes on this invoice"
          name="notes"
          rows={2}
          defaultValue={existing?.notes ?? ""}
        />
      </div>
    </ActionForm>
  );
}

function LineInput({
  label,
  name,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-white/35 mb-1">
        {label}
      </span>
      <input
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-white/5 border border-white/12 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
      />
    </label>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "text-white/70 font-medium" : "text-xs text-white/45"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${
          strong ? "text-white font-bold text-base" : "text-xs text-white/65"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
