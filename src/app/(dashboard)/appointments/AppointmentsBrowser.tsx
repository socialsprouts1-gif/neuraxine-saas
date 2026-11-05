"use client";

import { useState } from "react";
import { AlertTriangle, CalendarOff, Plus } from "lucide-react";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import type { AppointmentSettings, Slot } from "@/lib/appointments";
import { isClosedAllWeek } from "@/lib/appointments";
import type { AppointmentBlackout, AppointmentType } from "@/types/portal";
import { addBlackout, removeBlackout } from "../appointment-actions";
import AvailabilityEditor from "./AvailabilityEditor";
import NewBooking from "./NewBooking";
import BookingList, { type BookingItem } from "./BookingList";
import BotEditor from "./BotEditor";
import ServiceEditor from "./ServiceEditor";

const TABS = ["Bookings", "Services", "Availability", "Closed dates", "Bot"] as const;
type Tab = (typeof TABS)[number];

export default function AppointmentsBrowser({
  canManage,
  migrated,
  migrationError,
  settings,
  botEnabled,
  keywords,
  messages,
  types,
  blackouts,
  bookings,
  upcomingCount,
  nextSlots,
  contacts,
}: {
  canManage: boolean;
  migrated: boolean;
  migrationError: string | null;
  settings: AppointmentSettings;
  botEnabled: boolean;
  keywords: string[];
  messages: {
    location: string;
    greeting: string;
    confirmation: string;
    noSlots: string;
    cancelled: string;
    reminderHours: number;
    reminderTemplate: string;
    reminderTemplateLanguage: string;
    reminderMessage: string;
  };
  types: AppointmentType[];
  blackouts: AppointmentBlackout[];
  bookings: BookingItem[];
  upcomingCount: number;
  nextSlots: Slot[];
  contacts: Array<{ id: string; label: string }>;
}) {
  const [tab, setTab] = useState<Tab>("Bookings");
  // Read once, at mount. The boundary between "upcoming" and "past" must
  // not move because something unrelated caused a re-render — a booking
  // sliding between the two tabs mid-interaction is worse than one that is
  // a few minutes stale.
  const [now] = useState(() => Date.now());

  if (!migrated) {
    return (
      <div className="glass-card p-6 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#FACC15] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-white/65 leading-relaxed">
          <div className="font-semibold text-white mb-1">The appointment tables are missing</div>
          <p className="mb-2">
            Run <code className="text-accent-ink">supabase/updates/2026-09.sql</code> in the
            Supabase SQL editor, then reload this page. Nothing else on the workspace is affected —
            booking is simply off until it has run.
          </p>
          <p className="mb-2 text-xs text-white/50">
            Platform staff can see exactly which tables are missing, and which file creates each,
            under Admin → Database.
          </p>
          {migrationError && (
            <p className="text-xs text-white/40 break-words">{migrationError}</p>
          )}
        </div>
      </div>
    );
  }

  const upcoming = bookings.filter(
    (booking) => booking.status === "scheduled" && new Date(booking.startsAt).getTime() >= now
  );
  const past = bookings
    .filter(
      (booking) => booking.status !== "scheduled" || new Date(booking.startsAt).getTime() < now
    )
    .reverse();

  // Two states that look like a working setup and are not, so they are said
  // out loud rather than left to be discovered by a customer who gets no
  // reply.
  const notice =
    types.filter((type) => type.is_active).length === 0
      ? "No service is on offer yet, so a customer asking to book has nothing to choose from. Add one under Services."
      : isClosedAllWeek(settings.hours)
        ? "Every day of the week is closed, so no times can be offered. Open at least one day under Availability."
        : !botEnabled
          ? "Booking on WhatsApp is switched off. Customers can still be booked in by hand; nothing happens if they ask. Turn it on under Bot."
          : null;

  return (
    <>
      {notice && (
        <div className="glass-card p-4 mb-5 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#FACC15] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-white/65 leading-relaxed">{notice}</p>
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-white/4 border border-white/8 mb-6 overflow-x-auto">
        {TABS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`flex-1 whitespace-nowrap py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
              tab === option ? "bg-accent text-[#050508]" : "text-white/55 hover:text-white/85"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {tab === "Bookings" && (
        <div className="space-y-6">
          <NewBooking types={types} contacts={contacts} timezone={settings.timezone} />

          <section>
            <h2 className="text-lg font-bold mb-3">
              Upcoming{" "}
              <span className="text-sm font-normal text-white/40 tabular-nums">
                {upcomingCount}
              </span>
            </h2>
            <BookingList
              bookings={upcoming}
              timezone={settings.timezone}
              emptyHint="Bookings a customer makes on WhatsApp land here the moment they tap a time, and so do the ones you add on the Meetings screen."
            />
          </section>

          {past.length > 0 && (
            <section>
              <h2 className="text-lg font-bold mb-3">Past and closed</h2>
              <BookingList
                bookings={past.slice(0, 50)}
                timezone={settings.timezone}
                emptyHint=""
              />
            </section>
          )}
        </div>
      )}

      {tab === "Services" && <ServiceEditor types={types} canManage={canManage} />}

      {tab === "Availability" && (
        <AvailabilityEditor settings={settings} canManage={canManage} />
      )}

      {tab === "Closed dates" && (
        <BlackoutEditor
          blackouts={blackouts}
          timezone={settings.timezone}
          canManage={canManage}
        />
      )}

      {tab === "Bot" && (
        <BotEditor
          enabled={botEnabled}
          keywords={keywords}
          messages={messages}
          canManage={canManage}
          nextSlots={nextSlots}
          timezone={settings.timezone}
          hasServices={types.some((type) => type.is_active)}
        />
      )}
    </>
  );
}

/**
 * Holidays and days off.
 *
 * Separate from the weekly pattern because closing next Tuesday by editing
 * Tuesday's hours would close every Tuesday after it too.
 */
function BlackoutEditor({
  blackouts,
  timezone,
  canManage,
}: {
  blackouts: AppointmentBlackout[];
  timezone: string;
  canManage: boolean;
}) {
  const format = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div className="space-y-2.5">
        {blackouts.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <CalendarOff className="w-6 h-6 text-white/25 mx-auto mb-3" />
            <h3 className="font-semibold mb-1">No closed dates</h3>
            <p className="text-sm text-white/50 max-w-sm mx-auto">
              Add a holiday or a day off and no times will be offered on it, whatever the weekly
              hours say.
            </p>
          </div>
        ) : (
          blackouts.map((blackout) => (
            <div key={blackout.id} className="glass-card p-4 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">
                  {format(blackout.starts_at)}
                  {/* The row is stored as midnight-to-midnight, so the end is
                      the morning after the last closed day. Showing that raw
                      would read as one day too many. */}
                  {!sameDay(blackout.starts_at, blackout.ends_at, timezone) &&
                    ` – ${format(new Date(new Date(blackout.ends_at).getTime() - 1).toISOString())}`}
                </div>
                {blackout.reason && (
                  <div className="text-xs text-white/45 mt-0.5">{blackout.reason}</div>
                )}
              </div>
              {canManage && (
                <ActionForm action={removeBlackout} submitLabel="Reopen" compact>
                  <input type="hidden" name="id" value={blackout.id} />
                </ActionForm>
              )}
            </div>
          ))
        )}
      </div>

      {canManage && (
        <ActionForm action={addBlackout} submitLabel="Close these dates" className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-accent-ink" />
            <h4 className="font-semibold text-sm">Close some dates</h4>
          </div>
          <div className="space-y-4">
            <Field label="From" name="from_date" type="date" required />
            <Field
              label="To"
              name="to_date"
              type="date"
              hint="Leave blank for a single day. Both days are included."
            />
            <Field label="Why" name="reason" placeholder="Diwali" />
          </div>
        </ActionForm>
      )}
    </div>
  );
}

/** True when a blackout covers exactly one day in the business's timezone. */
function sameDay(startIso: string, endIso: string, timezone: string): boolean {
  const key = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso));
  // The end is exclusive, so a one-day closure ends at the next midnight;
  // step back a millisecond to land on the last closed day.
  return key(startIso) === key(new Date(new Date(endIso).getTime() - 1).toISOString());
}
