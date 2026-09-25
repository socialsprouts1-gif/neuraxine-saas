"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { createShipmentOrder } from "../integration-actions";

/**
 * Everything Shiprocket asks for, asked once.
 *
 * The two-step version — raise it in Commerce, then find it here and
 * push it — is the same work split across two screens, and the second
 * half is the half people forget. The fields are grouped the way a
 * courier form is, because that is the order the information arrives in
 * when somebody is reading it off a message.
 */
export default function NewShipmentOrder({
  numbers,
}: {
  numbers: Array<{ id: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm">
        <Plus className="w-4 h-4" />
        New order
      </button>
    );
  }

  return (
    <div className="glass-card p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold">New order</h2>
          <p className="text-xs text-white/45 mt-0.5">
            Raised here, and sent to Shiprocket in the same step if you want.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-white/40 hover:text-white"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <ActionForm action={createShipmentOrder} submitLabel="Create order" resetOnSuccess>
        <Section title="Customer">
          <Field label="Name" name="ship_name" placeholder="Asha Verma" />
          <Field
            label="Phone"
            name="ship_phone"
            required
            placeholder="98765 43210"
            hint="Matched to an existing contact, so the order lands in the chat they are already in."
          />
          <Field label="Email" name="ship_email" placeholder="asha@example.com" />
        </Section>

        <Section title="Where it goes">
          <Field label="Street address" name="ship_address" placeholder="12 MG Road, Indiranagar" />
          <Field label="City" name="ship_city" placeholder="Bengaluru" />
          <Field label="State" name="ship_state" placeholder="Karnataka" />
          <Field
            label="Pincode"
            name="ship_pincode"
            placeholder="560038"
            hint="Six digits. Shiprocket refuses anything else."
          />
        </Section>

        <Section title="What is being shipped">
          <Field label="Item" name="item_name" required placeholder="Cotton kurta" />
          <Field label="SKU" name="item_sku" placeholder="KUR-01" />
          <Field label="Quantity" name="item_quantity" defaultValue="1" />
          <Field label="Price each (₹)" name="item_price" placeholder="499" />
          <Field label="Shipping charge (₹)" name="shipping_charges" placeholder="0" />
        </Section>

        <Section title="The parcel">
          <Field label="Weight (grams)" name="weight_grams" placeholder="500" hint="Blank ships as 500g." />
          <Field label="Length (cm)" name="length_cm" placeholder="10" />
          <Field label="Breadth (cm)" name="breadth_cm" placeholder="10" />
          <Field label="Height (cm)" name="height_cm" placeholder="10" />
        </Section>

        <div className="mt-4 space-y-3">
          {numbers.length > 0 && (
            <label className="block">
              <span className="block text-xs font-medium text-white/70 mb-1.5">
                Message the customer from
              </span>
              <select
                name="connection_id"
                className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
              >
                <option value="" className="bg-[var(--surface-3)]">
                  Whichever number the conversation is on
                </option>
                {numbers.map((number) => (
                  <option key={number.id} value={number.id} className="bg-[var(--surface-3)]">
                    {number.label}
                  </option>
                ))}
              </select>
              <span className="block text-[11px] text-white/35 mt-1.5">
                Saved on the order, so every later update goes out from the same number.
              </span>
            </label>
          )}

          <Field label="Reference" name="reference" hint="Left blank, one is generated." />
          <Field label="Note for the courier" name="notes" placeholder="Leave with the neighbour" />

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" name="paid" className="accent-[var(--accent)] w-4 h-4" />
            <span className="text-xs text-white/60">
              Already paid — ships as Prepaid rather than COD
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              name="tell_customer"
              defaultChecked
              className="accent-[var(--accent)] w-4 h-4"
            />
            <span className="text-xs text-white/60">
              Tell the customer on WhatsApp that the order is placed
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              name="push_now"
              defaultChecked
              className="accent-[var(--accent)] w-4 h-4"
            />
            <span className="text-xs text-white/60">Send to Shiprocket straight away</span>
          </label>
        </div>
      </ActionForm>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2.5">
        {title}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}
