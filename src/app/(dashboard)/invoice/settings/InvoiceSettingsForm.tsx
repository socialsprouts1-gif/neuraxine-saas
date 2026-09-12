"use client";

import { useState } from "react";
import { AlertTriangle, Building2, Hash, Landmark, MessageSquare } from "lucide-react";
import ActionForm, { Field, TextareaField } from "@/components/ui/ActionForm";
import { formatInvoiceNumber, isValidGstin } from "@/lib/invoices";
import type { InvoiceSettings } from "@/types/portal";
import { saveInvoiceSettings } from "../../invoice-actions";

/**
 * The invoice identity.
 *
 * Two things get live feedback because both are expensive to get wrong and
 * silent about it: the GSTIN, whose last character is a checksum, and the
 * number format, which somebody will otherwise discover on the first
 * document they send a customer.
 */
export default function InvoiceSettingsForm({
  settings,
  canManage,
  migrated,
  migrationError,
  issuedCount,
}: {
  settings: InvoiceSettings;
  canManage: boolean;
  migrated: boolean;
  migrationError: string | null;
  issuedCount: number;
}) {
  const [gstin, setGstin] = useState(settings.gstin ?? "");
  const [prefix, setPrefix] = useState(settings.number_prefix);
  const [next, setNext] = useState(String(settings.next_number));
  const [padding, setPadding] = useState(String(settings.number_padding));

  const gstinLooksRight = gstin.trim() === "" || isValidGstin(gstin);
  const preview = formatInvoiceNumber(
    prefix,
    Number(next) || 1,
    Number(padding) || 4
  );

  if (!migrated) {
    return (
      <div className="glass-card p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#FACC15] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-white/65 leading-relaxed">
          <div className="font-semibold text-white mb-1">The invoice tables are missing</div>
          <p className="mb-2">
            Run <code className="text-accent-ink">supabase/updates/2026-09.sql</code> in the
            Supabase SQL editor, then reload. Platform staff can see exactly what is missing under
            Admin → Database.
          </p>
          {migrationError && <p className="text-xs text-white/40 break-words">{migrationError}</p>}
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-white/50">Only owners and admins can change invoicing.</p>
      </div>
    );
  }

  return (
    <ActionForm
      action={saveInvoiceSettings}
      submitLabel="Save invoice settings"
      className="space-y-4"
    >
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-accent-ink" />
          <h3 className="font-semibold">Your business</h3>
        </div>
        <p className="text-xs text-white/45 mb-5 leading-relaxed">
          The registered name, not the workspace label. This is what appears at the top of the
          document.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Business name"
            name="business_name"
            defaultValue={settings.business_name ?? ""}
            placeholder="Umm Clothing Pvt Ltd"
          />
          <Field
            label="Phone"
            name="phone"
            defaultValue={settings.phone ?? ""}
            placeholder="+91 98765 43210"
          />
          <Field
            label="Email"
            name="email"
            type="email"
            defaultValue={settings.email ?? ""}
          />
          <Field
            label="Logo URL"
            name="logo_url"
            type="url"
            defaultValue={settings.logo_url ?? ""}
            hint="Shown on the invoice page. Upload it under Gallery and paste the link."
          />
        </div>

        <div className="mt-4">
          <TextareaField
            label="Address"
            name="address"
            rows={2}
            defaultValue={settings.address ?? ""}
            placeholder="Shop 4, MG Road"
          />
        </div>

        <div className="grid sm:grid-cols-4 gap-4 mt-4">
          <Field label="City" name="city" defaultValue={settings.city ?? ""} />
          <Field
            label="State"
            name="state"
            defaultValue={settings.state ?? ""}
            placeholder="Maharashtra"
          />
          <Field label="PIN" name="postal_code" defaultValue={settings.postal_code ?? ""} />
          <Field label="Country" name="country" defaultValue={settings.country} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <label className="block">
            <span className="block text-xs font-medium text-white/70 mb-1.5">GSTIN</span>
            <input
              name="gstin"
              value={gstin}
              onChange={(event) => setGstin(event.target.value.toUpperCase())}
              placeholder="27AAPFU0939F1ZV"
              maxLength={15}
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
              {gstin.trim() === ""
                ? "Leave blank if you are not registered. The invoice is still valid; it just carries no tax."
                : gstinLooksRight
                  ? "Checks out. The state code decides whether a sale is CGST+SGST or IGST."
                  : "Does not check out. The last character is a checksum, so one typo fails here."}
            </span>
          </label>
          <Field
            label="PAN"
            name="pan"
            defaultValue={settings.pan ?? ""}
            placeholder="AAPFU0939F"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Hash className="w-4 h-4 text-accent-ink" />
            <h3 className="font-semibold">Numbering</h3>
          </div>
          <p className="text-xs text-white/45 mb-5 leading-relaxed">
            GST requires consecutive numbers with no gaps, so a number is claimed when an invoice
            is issued and never reused — a cancelled invoice keeps its number rather than freeing
            it.
          </p>

          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-white/70 mb-1.5">Prefix</span>
              <input
                name="number_prefix"
                value={prefix}
                onChange={(event) => setPrefix(event.target.value)}
                placeholder="INV"
                className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-white/70 mb-1.5">Next number</span>
              <input
                name="next_number"
                type="number"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-white/70 mb-1.5">Digits</span>
              <input
                name="number_padding"
                type="number"
                value={padding}
                onChange={(event) => setPadding(event.target.value)}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
              />
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/4 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-1">
              Next invoice will be
            </div>
            <code className="text-base text-accent-ink font-semibold">{preview}</code>
          </div>

          {issuedCount > 0 && (
            <p className="text-[11px] text-white/35 mt-3 leading-relaxed">
              {issuedCount} {issuedCount === 1 ? "invoice has" : "invoices have"} been issued, so
              the counter cannot be moved backwards — it would reuse a number that is already on a
              document.
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-4 mt-5 pt-5 border-t border-white/8">
            <Field
              label="Payment terms"
              name="default_terms_days"
              type="number"
              defaultValue={String(settings.default_terms_days)}
              hint="Days. The due date is this many days after the invoice date."
            />
            <Field
              label="Default GST %"
              name="default_tax_percent"
              type="number"
              defaultValue={String(settings.default_tax_percent)}
              hint="Prefilled on each new line. Can be changed per line."
            />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer mt-4">
            <input
              type="checkbox"
              name="round_to_rupee"
              defaultChecked={settings.round_to_rupee}
              className="accent-[var(--accent)] w-4 h-4 mt-0.5"
            />
            <span className="text-sm text-white/75">
              Round the total to the nearest rupee
              <span className="block text-[11px] text-white/40">
                Shown as its own “round off” line, which is the Indian convention.
              </span>
            </span>
          </label>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-1">
            <Landmark className="w-4 h-4 text-accent-ink" />
            <h3 className="font-semibold">How to pay you</h3>
          </div>
          <p className="text-xs text-white/45 mb-5 leading-relaxed">
            Printed on the invoice, so a customer who does not use the payment link still has
            somewhere to send the money.
          </p>

          <div className="space-y-4">
            <Field
              label="UPI ID"
              name="upi_id"
              defaultValue={settings.upi_id ?? ""}
              placeholder="business@upi"
            />
            <Field
              label="Account name"
              name="bank_account_name"
              defaultValue={settings.bank_account_name ?? ""}
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field
                label="Account number"
                name="bank_account_number"
                defaultValue={settings.bank_account_number ?? ""}
              />
              <Field
                label="IFSC"
                name="bank_ifsc"
                defaultValue={settings.bank_ifsc ?? ""}
                placeholder="HDFC0001234"
              />
            </div>
            <Field
              label="Bank"
              name="bank_name"
              defaultValue={settings.bank_name ?? ""}
              placeholder="HDFC Bank, Andheri West"
            />
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="w-4 h-4 text-accent-ink" />
          <h3 className="font-semibold">What you say</h3>
        </div>
        <p className="text-xs text-white/45 mb-5 leading-relaxed">
          Placeholders: <code className="text-white/60">{"{{number}}"}</code>{" "}
          <code className="text-white/60">{"{{total}}"}</code>{" "}
          <code className="text-white/60">{"{{due}}"}</code>{" "}
          <code className="text-white/60">{"{{link}}"}</code>{" "}
          <code className="text-white/60">{"{{name}}"}</code>{" "}
          <code className="text-white/60">{"{{words}}"}</code>. One it does not know is left as it
          is, rather than becoming a gap.
        </p>

        <div className="space-y-4">
          <TextareaField
            label="Sending an invoice"
            name="send_message"
            rows={2}
            defaultValue={settings.send_message}
          />
          <TextareaField
            label="Chasing an overdue one"
            name="reminder_message"
            rows={2}
            defaultValue={settings.reminder_message}
          />
          <TextareaField
            label="When payment lands"
            name="payment_received_message"
            rows={2}
            defaultValue={settings.payment_received_message}
          />
          <TextareaField
            label="Terms printed on the invoice"
            name="terms_text"
            rows={3}
            defaultValue={settings.terms_text}
          />
          <TextareaField
            label="Default notes"
            name="notes"
            rows={2}
            defaultValue={settings.notes ?? ""}
            hint="Prefilled on a new invoice. Editable per invoice."
          />
        </div>
      </div>
    </ActionForm>
  );
}
