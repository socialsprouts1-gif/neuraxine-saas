"use client";

import { useState } from "react";
import { Copy, ExternalLink, FileText, User } from "lucide-react";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { Badge, type Tone } from "@/components/ui/primitives";
import { formatInvoiceAmount, isOverdue } from "@/lib/invoices";
import {
  deleteInvoice,
  duplicateInvoice,
  invoiceLink,
  issueInvoiceAction,
  recordPayment,
  sendInvoiceAction,
  setInvoiceStatus,
} from "../../invoice-actions";
import InvoiceBuilder, { type BuilderInvoice } from "./InvoiceBuilder";

export interface InvoiceListRow {
  id: string;
  number: string | null;
  status: string;
  issuedOn: string | null;
  dueOn: string | null;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  customerName: string | null;
  customerGstin: string | null;
  customerAddress: string | null;
  customerState: string | null;
  notes: string | null;
  contactId: string | null;
  interState: boolean;
  publicToken: string;
  paymentLinkUrl: string | null;
  sentAt: string | null;
  createdAt: string;
  recurringId: string | null;
  lines: Array<{
    description: string;
    hsnCode: string | null;
    quantity: number;
    unitPriceCents: number;
    taxPercent: number;
    discountPercent: number;
    totalCents: number;
  }>;
}

const STATUS_TONE: Record<string, Tone> = {
  draft: "grey",
  sent: "blue",
  partly_paid: "amber",
  paid: "green",
  cancelled: "grey",
};

export default function InvoiceRow({
  invoice,
  today,
  contacts,
  defaultTax,
  sellerGstin,
  roundToRupee,
}: {
  invoice: InvoiceListRow;
  today: string;
  contacts: Array<{ id: string; label: string; gstin: string | null }>;
  defaultTax: number;
  sellerGstin: string | null;
  roundToRupee: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const outstanding = invoice.totalCents - invoice.amountPaidCents;
  const settled = invoice.status === "paid" || invoice.status === "cancelled";
  // Overdue is derived, never stored: storing it would need something to
  // sweep every invoice at midnight to keep it true.
  const overdue =
    !settled &&
    outstanding > 0 &&
    isOverdue(invoice.dueOn, today) &&
    invoice.status !== "draft";

  if (editing) {
    const existing: BuilderInvoice = {
      id: invoice.id,
      contactId: invoice.contactId,
      customerName: invoice.customerName ?? "",
      customerGstin: invoice.customerGstin ?? "",
      customerAddress: invoice.customerAddress ?? "",
      customerState: invoice.customerState ?? "",
      customerEmail: "",
      notes: invoice.notes ?? "",
      lines: invoice.lines.map((line) => ({
        description: line.description,
        hsnCode: line.hsnCode ?? "",
        quantity: String(line.quantity),
        price: String(line.unitPriceCents / 100),
        tax: String(line.taxPercent),
        discount: String(line.discountPercent),
      })),
    };

    return (
      <InvoiceBuilder
        contacts={contacts}
        defaultTax={defaultTax}
        sellerGstin={sellerGstin}
        roundToRupee={roundToRupee}
        currency={invoice.currency}
        existing={existing}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <code className="text-sm font-semibold text-accent-ink">
              {invoice.number ?? "Draft"}
            </code>
            <Badge tone={overdue ? "red" : (STATUS_TONE[invoice.status] ?? "grey")}>
              {overdue ? "overdue" : invoice.status.replace("_", " ")}
            </Badge>
            {invoice.interState && <Badge tone="grey">IGST</Badge>}
            {invoice.recurringId && <Badge tone="purple">recurring</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
            {invoice.customerName && (
              <span className="inline-flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                {invoice.customerName}
              </span>
            )}
            {invoice.issuedOn && <span>issued {invoice.issuedOn}</span>}
            {invoice.dueOn && !settled && (
              <span className={overdue ? "text-[#F87171]" : ""}>due {invoice.dueOn}</span>
            )}
            {invoice.amountPaidCents > 0 && outstanding > 0 && (
              <span className="text-[#FACC15]">
                {formatInvoiceAmount(invoice.amountPaidCents, invoice.currency)} paid
              </span>
            )}
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold tabular-nums">
            {formatInvoiceAmount(invoice.totalCents, invoice.currency)}
          </div>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="text-[11px] text-white/40 hover:text-white transition-colors"
          >
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-white/8 space-y-4">
          {invoice.lines.length > 0 && (
            <div className="space-y-1.5">
              {invoice.lines.map((line, index) => (
                <div key={index} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-white/70 min-w-0 truncate">
                    {line.quantity} × {line.description}
                    {line.taxPercent > 0 && (
                      <span className="text-white/35"> · {line.taxPercent}% GST</span>
                    )}
                  </span>
                  <span className="text-white/50 tabular-nums flex-shrink-0">
                    {formatInvoiceAmount(line.totalCents, invoice.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {invoice.notes && (
            <p className="text-xs text-white/50">
              <span className="text-white/35">Notes:</span> {invoice.notes}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <a
              href={`/i/${invoice.publicToken}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-accent2-ink hover:underline"
            >
              <FileText className="w-3.5 h-3.5" />
              View the invoice
            </a>
            {invoice.paymentLinkUrl && (
              <a
                href={invoice.paymentLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-accent2-ink hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Payment link
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!settled && (
              <ActionForm
                action={sendInvoiceAction}
                submitLabel={invoice.sentAt ? "Send again" : "Issue & send"}
                compact
              >
                <input type="hidden" name="id" value={invoice.id} />
              </ActionForm>
            )}

            {overdue && (
              <ActionForm action={sendInvoiceAction} submitLabel="Chase it" compact>
                <input type="hidden" name="id" value={invoice.id} />
                <input type="hidden" name="reminder" value="1" />
              </ActionForm>
            )}

            {invoice.status === "draft" && (
              <ActionForm action={issueInvoiceAction} submitLabel="Issue only" compact>
                <input type="hidden" name="id" value={invoice.id} />
              </ActionForm>
            )}

            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/8 transition-colors"
            >
              Edit
            </button>

            <ActionForm action={duplicateInvoice} submitLabel="Copy" compact>
              <input type="hidden" name="id" value={invoice.id} />
            </ActionForm>

            <ActionForm action={invoiceLink} submitLabel="Get link" compact>
              <input type="hidden" name="id" value={invoice.id} />
              <p className="sr-only">Shows the customer link, for pasting elsewhere</p>
            </ActionForm>

            {invoice.status === "draft" ? (
              <ActionForm action={deleteInvoice} submitLabel="Delete draft" compact>
                <input type="hidden" name="id" value={invoice.id} />
              </ActionForm>
            ) : (
              invoice.status !== "cancelled" && (
                <ActionForm action={setInvoiceStatus} submitLabel="Cancel" compact>
                  <input type="hidden" name="id" value={invoice.id} />
                  <input type="hidden" name="status" value="cancelled" />
                </ActionForm>
              )
            )}
          </div>

          {/* Only once there is something to be paid. A draft has not been
              sent to anybody, so nobody can have paid it. */}
          {!settled && invoice.number && outstanding > 0 && (
            <ActionForm action={recordPayment} submitLabel="Record payment" compact>
              <input type="hidden" name="id" value={invoice.id} />
              <div className="grid sm:grid-cols-2 gap-3">
                <Field
                  label="Amount (₹)"
                  name="amount"
                  type="number"
                  hint={`Blank records the rest — ${formatInvoiceAmount(
                    outstanding,
                    invoice.currency
                  )}.`}
                />
                <Field
                  label="How"
                  name="method"
                  placeholder="cash, UPI, transfer"
                  hint="For your own records."
                />
              </div>
            </ActionForm>
          )}

          <p className="text-[11px] text-white/30 flex items-start gap-1.5">
            <Copy className="w-3 h-3 flex-shrink-0 mt-0.5" />
            The invoice page prints cleanly — the customer&rsquo;s browser can save it as a PDF.
          </p>
        </div>
      )}
    </div>
  );
}
