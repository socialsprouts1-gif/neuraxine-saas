"use client";

import { useState } from "react";
import { Clock, IndianRupee, MapPin, Pencil, Plus } from "lucide-react";
import ActionForm, { Field, TextareaField } from "@/components/ui/ActionForm";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { durationLabel } from "@/lib/appointments";
import type { AppointmentType } from "@/types/portal";
import { deleteAppointmentType, saveAppointmentType } from "../appointment-actions";

/**
 * The list of things a customer can book.
 *
 * This is what becomes the first menu in the chat, so the name and the
 * length matter more than they look — the customer chooses on them and the
 * length decides how much of the diary the booking takes.
 */
export default function ServiceEditor({
  types,
  canManage,
}: {
  types: AppointmentType[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {types.length === 0 ? (
        <EmptyState
          title="Nothing bookable yet"
          description="Add what customers can book — a consultation, a demo, a service. Each one gets its own length and price, and they appear as the first menu in the chat."
        />
      ) : (
        <div className="space-y-2.5">
          {types.map((type) =>
            editing === type.id ? (
              <div key={type.id} className="glass-card p-5">
                <ServiceForm type={type} onDone={() => setEditing(null)} />
              </div>
            ) : (
              <div key={type.id} className="glass-card p-4 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium truncate">{type.name}</span>
                    {!type.is_active && <Badge tone="grey">hidden</Badge>}
                  </div>
                  {type.description && (
                    <p className="text-xs text-white/50 mb-1.5 line-clamp-2">{type.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/45">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {durationLabel(type.duration_minutes)}
                    </span>
                    {type.price_cents > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <IndianRupee className="w-3.5 h-3.5" />
                        {(type.price_cents / 100).toLocaleString("en-IN")}
                      </span>
                    )}
                    {type.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        {type.location}
                      </span>
                    )}
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditing(type.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <DeleteService id={type.id} name={type.name} />
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}

      {canManage &&
        (adding ? (
          <div className="glass-card p-5">
            <ServiceForm onDone={() => setAdding(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add a service
          </button>
        ))}
    </div>
  );
}

function ServiceForm({ type, onDone }: { type?: AppointmentType; onDone: () => void }) {
  return (
    <ActionForm action={saveAppointmentType} submitLabel={type ? "Save changes" : "Add service"}>
      {type && <input type="hidden" name="id" value={type.id} />}

      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold">{type ? `Edit ${type.name}` : "New service"}</h4>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-white/40 hover:text-white transition-colors"
        >
          Close
        </button>
      </div>

      <div className="space-y-4">
        <Field
          label="Name"
          name="name"
          required
          defaultValue={type?.name}
          placeholder="Consultation"
          hint="Shown to the customer as a menu row, so keep it under 24 characters."
        />
        <TextareaField
          label="Description"
          name="description"
          rows={2}
          defaultValue={type?.description ?? ""}
          placeholder="A 30-minute call to work out what you need."
        />
        <div className="grid sm:grid-cols-3 gap-4">
          <Field
            label="Length in minutes"
            name="duration_minutes"
            type="number"
            required
            defaultValue={String(type?.duration_minutes ?? 30)}
          />
          <Field
            label="Price in ₹"
            name="price"
            type="number"
            defaultValue={String((type?.price_cents ?? 0) / 100)}
            hint="0 to leave it off the menu."
          />
          <Field
            label="Order"
            name="sort_order"
            type="number"
            defaultValue={String(type?.sort_order ?? 0)}
            hint="Lower comes first."
          />
        </div>
        <Field
          label="Where"
          name="location"
          defaultValue={type?.location ?? ""}
          placeholder="Clinic, Andheri West"
          hint="Left blank, the workspace address on the Bot tab is used."
        />
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={type ? type.is_active : true}
            className="accent-[var(--accent)] w-4 h-4"
          />
          <span className="text-sm text-white/70">
            Offer this to customers
            <span className="block text-[11px] text-white/35">
              Unticked, it stays here but never appears in the chat menu.
            </span>
          </span>
        </label>
      </div>
    </ActionForm>
  );
}

/**
 * Deleting asks first.
 *
 * Bookings already made survive — the foreign key clears rather than
 * cascades — but the service is gone from every future menu, which is not
 * something to do on a mis-tap.
 */
function DeleteService({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="px-3 py-2 rounded-lg text-xs text-white/40 hover:text-[#F87171] hover:bg-[#F87171]/10 transition-colors"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-white/50 hidden sm:inline">Delete “{name}”?</span>
      <ActionForm action={deleteAppointmentType} submitLabel="Yes, delete" compact>
        <input type="hidden" name="id" value={id} />
      </ActionForm>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-white/40 hover:text-white transition-colors"
      >
        No
      </button>
    </div>
  );
}
