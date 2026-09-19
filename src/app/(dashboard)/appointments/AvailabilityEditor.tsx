"use client";

import { useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import {
  WEEKDAYS,
  WEEKDAY_LABEL,
  type AppointmentSettings,
  type Weekday,
  type Window,
} from "@/lib/appointments";
import { resetAvailability, saveAvailability } from "../appointment-actions";

/**
 * The opening hours, a week at a time.
 *
 * Several windows per day rather than one, because most businesses shut for
 * lunch and expressing that as one long window means offering appointments
 * nobody will turn up for.
 */
export default function AvailabilityEditor({
  settings,
  canManage,
}: {
  settings: AppointmentSettings;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-white/50">
          Only owners and admins can change when the business is open.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ActionForm action={saveAvailability} submitLabel="Save availability" className="glass-card p-6">
        <h3 className="font-semibold mb-1">Opening hours</h3>
        <p className="text-xs text-white/45 mb-5 leading-relaxed">
          The pattern a normal week follows. Add a second row to a day to shut for lunch. Times are
          read in the timezone below, so what a customer is offered is what the clock on your wall
          says.
        </p>

        <div className="space-y-2 mb-6">
          {WEEKDAYS.map((day) => (
            <DayRow key={day} day={day} windows={settings.hours[day]} />
          ))}
        </div>

        <h3 className="font-semibold mb-1">How slots are cut</h3>
        <p className="text-xs text-white/45 mb-4 leading-relaxed">
          A service&rsquo;s own length decides how long the appointment is. These decide how far
          apart the offered start times are, and how much of the diary a customer can see.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field
            label="Timezone"
            name="timezone"
            defaultValue={settings.timezone}
            required
            placeholder="Asia/Kolkata"
            hint="An IANA name. Asia/Kolkata, Europe/London, America/New_York."
          />
          <Field
            label="Minutes between start times"
            name="slot_minutes"
            type="number"
            defaultValue={String(settings.slotMinutes)}
            hint="30 gives 9:00, 9:30, 10:00…"
          />
          <Field
            label="Gap after each booking"
            name="buffer_minutes"
            type="number"
            defaultValue={String(settings.bufferMinutes)}
            hint="Minutes of breathing room before the next one can start."
          />
          <Field
            label="Shortest notice"
            name="min_notice_minutes"
            type="number"
            defaultValue={String(settings.minNoticeMinutes)}
            hint="Minutes. Nothing sooner than this is offered — 60 stops a 9:00 booking at 8:59."
          />
          <Field
            label="How far ahead customers can book"
            name="horizon_days"
            type="number"
            defaultValue={String(settings.horizonDays)}
            hint="Days."
          />
          <Field
            label="Bookings per time slot"
            name="max_per_slot"
            type="number"
            defaultValue={String(settings.maxPerSlot)}
            hint="1 for one-to-one. Raise it for a class or a clinic with several rooms."
          />
        </div>
      </ActionForm>

      <ActionForm action={resetAvailability} submitLabel="Reset to Mon–Sat, 9 to 6" compact>
        <p className="text-xs text-white/40 flex items-start gap-2">
          <RotateCcw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Puts the standard week back. Nothing already booked is affected.
        </p>
      </ActionForm>
    </div>
  );
}

/**
 * One day.
 *
 * The rows are local state so a window can be added or removed without a
 * round trip; the whole week is submitted together, because a half-saved
 * week is a business open on days it is not.
 */
function DayRow({ day, windows }: { day: Weekday; windows: Window[] }) {
  const [rows, setRows] = useState<Window[]>(
    windows.length > 0 ? windows : [{ start: "09:00", end: "18:00" }]
  );
  const [open, setOpen] = useState(windows.length > 0);

  return (
    <div className="rounded-xl border border-white/8 bg-white/4 p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 w-32 flex-shrink-0 cursor-pointer">
          <input
            type="checkbox"
            name={`${day}_open`}
            checked={open}
            onChange={(event) => setOpen(event.target.checked)}
            className="accent-[var(--accent)] w-4 h-4"
          />
          <span className={`text-sm font-medium ${open ? "text-white" : "text-white/35"}`}>
            {WEEKDAY_LABEL[day]}
          </span>
        </label>

        {open ? (
          <div className="flex-1 space-y-2 min-w-0">
            {rows.map((window, index) => (
              <div key={index} className="flex items-center gap-2 flex-wrap">
                <input
                  type="time"
                  name={`${day}_start`}
                  defaultValue={window.start}
                  className="bg-white/5 border border-white/12 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
                />
                <span className="text-white/30 text-sm">to</span>
                <input
                  type="time"
                  name={`${day}_end`}
                  defaultValue={window.end}
                  className="bg-white/5 border border-white/12 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50"
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove this window from ${WEEKDAY_LABEL[day]}`}
                    onClick={() => setRows(rows.filter((_, at) => at !== index))}
                    className="p-1.5 rounded-lg text-white/35 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {index === rows.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setRows([...rows, { start: "14:00", end: "18:00" }])}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-white/45 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm text-white/30">Closed</span>
        )}
      </div>
    </div>
  );
}
