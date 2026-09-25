"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { durationLabel } from "@/lib/appointments";
import type { AppointmentType } from "@/types/portal";
import { createBooking } from "../appointment-actions";

/**
 * Booking somebody in by hand — a phone call, a walk-in.
 *
 * Goes through the same clash check as the chat flow, so a manual booking
 * cannot quietly double-book a slot the bot is still offering, with an
 * override for the times a business decides to squeeze somebody in anyway.
 */
export default function NewBooking({
  types,
  contacts,
  timezone,
}: {
  types: AppointmentType[];
  contacts: Array<{ id: string; label: string }>;
  timezone: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary inline-flex items-center gap-2"
      >
        <CalendarPlus className="w-4 h-4" />
        Book someone in
      </button>
    );
  }

  return (
    <div className="glass-card p-5">
      <ActionForm action={createBooking} submitLabel="Book it" resetOnSuccess>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold">New booking</h4>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-white/40 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>

        <div className="space-y-4">
          <SelectField
            label="Service"
            name="appointment_type_id"
            defaultValue=""
            options={[
              { value: "", label: "No particular service" },
              ...types
                .filter((type) => type.is_active)
                .map((type) => ({
                  value: type.id,
                  label: `${type.name} · ${durationLabel(type.duration_minutes)}`,
                })),
            ]}
          />

          <SelectField
            label="Customer"
            name="contact_id"
            defaultValue=""
            options={[
              { value: "", label: "Not a saved contact" },
              ...contacts.map((contact) => ({ value: contact.id, label: contact.label })),
            ]}
          />

          {/* Only used when no contact is chosen — otherwise the contact's
              own name is what goes on the booking. */}
          <Field
            label="Who is it for"
            name="title"
            placeholder="Walk-in, or a name"
            hint="Only used when the customer is not a saved contact."
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date" name="date" type="date" required />
            <Field
              label="Time"
              name="time"
              type="time"
              required
              hint={`Read in ${timezone}.`}
            />
          </div>

          <TextareaField label="Notes" name="notes" rows={2} />

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" name="allow_overlap" className="accent-[var(--accent)] w-4 h-4" />
            <span className="text-sm text-white/70">
              Book anyway if the time is taken
              <span className="block text-[11px] text-white/35">
                Otherwise a clash with an existing booking is refused.
              </span>
            </span>
          </label>
        </div>
      </ActionForm>
    </div>
  );
}
