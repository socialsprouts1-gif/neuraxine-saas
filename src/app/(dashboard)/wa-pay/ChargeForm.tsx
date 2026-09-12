"use client";

import { useState } from "react";
import { IndianRupee } from "lucide-react";
import ActionForm, { Field, SelectField } from "@/components/ui/ActionForm";
import { formatAmount } from "@/lib/orders";
import { chargeCustomer } from "../commerce-actions";

/**
 * Charging a customer for something agreed in the conversation.
 *
 * No catalogue, no cart — a repair, a consultation, a custom order. This is
 * what most of the businesses using this app actually need, and it should
 * not be behind four tabs about products.
 *
 * The live total is here because tax is applied on top: a business typing
 * ₹1,000 with 18% configured is charging ₹1,180, and finding that out from
 * the customer's screen is a bad way to learn it.
 */
export default function ChargeForm({
  contacts,
  method,
  gatewayLabel,
  taxPercent,
}: {
  contacts: Array<{ id: string; label: string }>;
  method: "link" | "whatsapp";
  gatewayLabel: string | null;
  taxPercent: number;
}) {
  const [rupees, setRupees] = useState("");

  const amount = Number(rupees);
  const base = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
  const tax = Math.round((base * taxPercent) / 100);

  return (
    <ActionForm
      action={chargeCustomer}
      submitLabel={method === "whatsapp" ? "Send payment request" : "Send payment link"}
      className="glass-card p-6"
      resetOnSuccess
    >
      <div className="flex items-center gap-2 mb-1">
        <IndianRupee className="w-4 h-4 text-accent-ink" />
        <h3 className="font-semibold">Charge a customer</h3>
      </div>
      <p className="text-xs text-white/45 mb-5 leading-relaxed">
        {method === "whatsapp"
          ? "Sends Meta's order card. The customer pays by UPI inside the chat."
          : `Sends a ${gatewayLabel ?? "payment"} link in the conversation.`}{" "}
        They have to have messaged you in the last 24 hours — outside that window WhatsApp accepts
        nothing but an approved template.
      </p>

      <div className="space-y-4">
        <SelectField
          label="Customer"
          name="contact_id"
          defaultValue=""
          options={[
            { value: "", label: "Choose a contact…" },
            ...contacts.map((contact) => ({ value: contact.id, label: contact.label })),
          ]}
        />

        <Field
          label="What for"
          name="description"
          required
          placeholder="Screen replacement"
          hint="The customer sees this on the payment page."
        />

        <label className="block">
          <span className="block text-xs font-medium text-white/70 mb-1.5">Amount (₹)</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            required
            value={rupees}
            onChange={(event) => setRupees(event.target.value)}
            placeholder="1500"
            className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all"
          />
          {taxPercent > 0 && base > 0 && (
            <span className="block text-[11px] text-white/45 mt-1.5">
              Plus {taxPercent}% tax ({formatAmount(tax)}) —{" "}
              <span className="text-white/70 font-medium">
                {formatAmount(base + tax)} to pay
              </span>
            </span>
          )}
          {taxPercent === 0 && (
            <span className="block text-[11px] text-white/35 mt-1.5">
              No tax configured. Set one under Commerce → Payments if you need it.
            </span>
          )}
        </label>
      </div>
    </ActionForm>
  );
}
