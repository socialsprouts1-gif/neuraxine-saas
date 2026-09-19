"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import {
  DEFAULT_HOURS,
  WEEKDAYS,
  formatClock,
  isValidTimeZone,
  parseClock,
  readSettings,
  zonedToUtc,
  type Weekday,
  type Window,
} from "@/lib/appointments";
import { dispatchDueReminders } from "@/lib/appointment-reminders";
import {
  deleteCalendarEvent,
  loadGoogleCalendar,
  upsertCalendarEvent,
} from "@/lib/google-calendar";
import type { ActionResult } from "./actions";

// Everything the Appointments screen writes.
//
// As everywhere else, the org comes from the session and never from the
// submitted form: a form field naming an org id is a request to write to
// somebody else's workspace.

async function requireManager() {
  const ctx = await requireFeature("appointments");
  if (ctx.role !== "owner" && ctx.role !== "admin") return null;
  return ctx;
}

const DENIED = "Only owners and admins can change appointment settings.";

function number(form: FormData, name: string, fallback: number): number {
  const raw = String(form.get(name) ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

// ------------------------------------------------------------- availability

/**
 * Reads the weekly hours out of the form.
 *
 * Each day submits a checkbox and any number of start/end pairs, named
 * `mon_start`/`mon_end`. A day whose box is unticked is closed regardless of
 * what its times say, so unticking Sunday does not require clearing the
 * times you might want back next week.
 */
function readWeek(form: FormData): { hours: Record<Weekday, Window[]>; error: string | null } {
  const hours = {} as Record<Weekday, Window[]>;

  for (const day of WEEKDAYS) {
    if (!form.get(`${day}_open`)) {
      hours[day] = [];
      continue;
    }

    const starts = form.getAll(`${day}_start`).map(String);
    const ends = form.getAll(`${day}_end`).map(String);
    const windows: Window[] = [];

    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index]?.trim();
      const end = ends[index]?.trim();
      // A blank pair is a row the user emptied rather than an error.
      if (!start && !end) continue;

      const from = parseClock(start ?? "");
      const to = parseClock(end ?? "");
      if (from === null || to === null) {
        return { hours, error: `${day.toUpperCase()}: “${start} – ${end}” is not a valid time.` };
      }
      if (to <= from) {
        return {
          hours,
          error: `${day.toUpperCase()}: the closing time has to be after the opening one.`,
        };
      }
      windows.push({ start: formatClock(from), end: formatClock(to) });
    }

    windows.sort((a, b) => a.start.localeCompare(b.start));

    // Overlapping windows would offer the same slot twice on one day.
    for (let index = 1; index < windows.length; index += 1) {
      if (windows[index].start < windows[index - 1].end) {
        return { hours, error: `${day.toUpperCase()}: two opening times overlap.` };
      }
    }

    hours[day] = windows;
  }

  return { hours, error: null };
}

export async function saveAvailability(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone || !isValidTimeZone(timezone)) {
    return {
      ok: false,
      error: `“${timezone}” is not a timezone this server recognises. Use an IANA name such as Asia/Kolkata.`,
    };
  }

  const { hours, error } = readWeek(formData);
  if (error) return { ok: false, error };

  const supabase = await createClient();
  const { error: writeError } = await supabase.from("appointment_settings").upsert(
    {
      org_id: ctx.orgId,
      timezone,
      slot_minutes: Math.max(5, Math.min(480, number(formData, "slot_minutes", 30))),
      buffer_minutes: Math.max(0, Math.min(240, number(formData, "buffer_minutes", 0))),
      min_notice_minutes: Math.max(0, Math.min(20160, number(formData, "min_notice_minutes", 60))),
      horizon_days: Math.max(1, Math.min(120, number(formData, "horizon_days", 14))),
      max_per_slot: Math.max(1, Math.min(100, number(formData, "max_per_slot", 1))),
      hours,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );

  if (writeError) return { ok: false, error: writeError.message };

  revalidatePath("/appointments");
  return { ok: true, message: "Availability saved." };
}

// ------------------------------------------------------------------- bot

export async function saveBookingBot(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const keywords = String(formData.get("trigger_keywords") ?? "")
    .split(/[,\n]/)
    .map((word) => word.trim().toLowerCase())
    // Only whole words are matched, so a phrase would never fire. Better to
    // refuse it here than to store something that silently never works.
    .filter((word) => word.length > 0 && !word.includes(" "));

  const enabled = Boolean(formData.get("is_enabled"));

  if (enabled && keywords.length === 0) {
    return {
      ok: false,
      error:
        "Give at least one single word that starts a booking — with none, the bot can never be triggered.",
    };
  }

  const supabase = await createClient();

  if (enabled) {
    // Turning the bot on with nothing bookable would answer every "book"
    // with an empty menu.
    const { count } = await supabase
      .from("appointment_types")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("is_active", true);

    if (!count) {
      return {
        ok: false,
        error: "Add at least one bookable service first — there is nothing for the bot to offer.",
      };
    }
  }

  const text = (name: string, fallback: string) => {
    const value = String(formData.get(name) ?? "").trim();
    return value || fallback;
  };

  const { error } = await supabase.from("appointment_settings").upsert(
    {
      org_id: ctx.orgId,
      is_enabled: enabled,
      trigger_keywords: keywords,
      location: String(formData.get("location") ?? "").trim() || null,
      greeting: text("greeting", "Happy to book you in. What would you like to book?"),
      confirmation: text(
        "confirmation",
        "Booked. See you on {{date}} at {{time}}. Reply CANCEL if you need to change it."
      ),
      no_slots_message: text(
        "no_slots_message",
        "Sorry, there is nothing free in the next couple of weeks."
      ),
      cancelled_message: text("cancelled_message", "No problem — nothing has been booked."),
      reminder_hours: Math.max(0, Math.min(168, number(formData, "reminder_hours", 3))),
      // Blank means "no template", which is different from a template named
      // "" — so it is stored as null rather than an empty string.
      reminder_template: String(formData.get("reminder_template") ?? "").trim() || null,
      reminder_template_language:
        String(formData.get("reminder_template_language") ?? "").trim() || "en",
      reminder_message: text(
        "reminder_message",
        "Reminder: your appointment is at {{time}} today. Reply here if you need to change it."
      ),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  return {
    ok: true,
    message: enabled
      ? "Booking bot is on. Message your number with one of those words to try it."
      : "Booking bot is off.",
  };
}

// -------------------------------------------------------------- services

export async function saveAppointmentType(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the service a name customers will recognise." };

  const duration = number(formData, "duration_minutes", 30);
  if (duration < 5 || duration > 1440) {
    return { ok: false, error: "A booking has to be between 5 minutes and 24 hours long." };
  }

  // Typed in rupees, stored in paise, as everywhere else.
  const rupees = number(formData, "price", 0);
  if (rupees < 0) return { ok: false, error: "A price cannot be negative." };

  const id = String(formData.get("id") ?? "").trim();
  const supabase = await createClient();

  const row = {
    org_id: ctx.orgId,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    duration_minutes: duration,
    price_cents: rupees * 100,
    location: String(formData.get("location") ?? "").trim() || null,
    is_active: formData.get("is_active") !== null,
    sort_order: number(formData, "sort_order", 0),
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from("appointment_types").update(row).eq("id", id).eq("org_id", ctx.orgId)
    : await supabase.from("appointment_types").insert(row);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  return { ok: true, message: id ? "Service updated." : `“${name}” added.` };
}

export async function deleteAppointmentType(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "No service to delete." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointment_types")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  // Bookings already made keep their time and length; the foreign key is
  // `on delete set null`, so deleting a service does not delete anyone's
  // appointment.
  return { ok: true, message: "Service removed. Existing bookings are untouched." };
}

// ------------------------------------------------------------- blackouts

export async function addBlackout(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const from = String(formData.get("from_date") ?? "").trim();
  const to = String(formData.get("to_date") ?? "").trim() || from;
  if (!from) return { ok: false, error: "Pick a date to close." };

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("appointment_settings")
    .select("timezone")
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return { ok: false, error: "Those dates could not be read." };

  // Midnight to midnight in the business's own timezone. Storing the plain
  // date would close the wrong day for anyone not on UTC.
  const startsAt = zonedToUtc(start.year, start.month, start.day, 0, 0, timezone);
  const endsAt = zonedToUtc(end.year, end.month, end.day + 1, 0, 0, timezone);

  if (endsAt <= startsAt) {
    return { ok: false, error: "The last day has to be on or after the first." };
  }

  const { error } = await supabase.from("appointment_blackouts").insert({
    org_id: ctx.orgId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    reason: String(formData.get("reason") ?? "").trim() || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  return { ok: true, message: "Those dates are now closed for booking." };
}

export async function removeBlackout(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "Nothing to remove." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointment_blackouts")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  return { ok: true, message: "Open for booking again." };
}

/** "2026-09-11" from a date input. */
function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

// -------------------------------------------------------------- bookings

/** Marks a booking done, missed or cancelled from the Appointments screen. */
export async function setBookingStatus(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("appointments");
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!id) return { ok: false, error: "No booking selected." };
  if (!["scheduled", "completed", "cancelled", "no_show"].includes(status)) {
    return { ok: false, error: "Not a status a booking can be in." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("meetings")
    .update({ status: status as "scheduled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };

  // A cancelled or completed booking should not stay in the diary as
  // something somebody is expected to attend.
  await syncBookingToCalendar(supabase, ctx.orgId, id);

  revalidatePath("/appointments");
  revalidatePath("/meetings");
  return { ok: true, message: "Updated." };
}

/**
 * Puts the default week back.
 *
 * A workspace that has closed every day cannot be booked at all, and the
 * quickest way out of that is not editing seven rows by hand.
 */
export async function resetAvailability(): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const supabase = await createClient();
  const { error } = await supabase.from("appointment_settings").upsert(
    { org_id: ctx.orgId, hours: DEFAULT_HOURS, updated_at: new Date().toISOString() },
    { onConflict: "org_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/appointments");
  return { ok: true, message: "Back to Monday–Saturday, 9 to 6." };
}

/**
 * The settings row as the screen needs it, defaults where there is none.
 *
 * Exported so the page and the actions agree on what an unconfigured
 * workspace looks like rather than each inventing its own answer.
 */
export async function currentAvailability(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appointment_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  return readSettings(data as unknown as Record<string, unknown> | null);
}

// -------------------------------------------------------------- reminders

/**
 * Sends the reminders that have come due, now.
 *
 * The same work a scheduler does. This project runs on a Vercel plan with no
 * cron, so without a button the column that records a sent reminder would
 * never be written and nobody would ever be reminded.
 */
export async function sendRemindersNow(): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const result = await dispatchDueReminders(ctx.orgId);
  revalidatePath("/appointments");

  if (result.error) return { ok: false, error: result.error };
  if (result.due === 0) {
    return {
      ok: true,
      message: "Nothing due. Reminders go out inside the window you set before each appointment.",
    };
  }

  const parts = [
    `${result.sent} sent`,
    result.skipped > 0 ? `${result.skipped} skipped` : null,
    result.failed > 0 ? `${result.failed} failed` : null,
  ].filter(Boolean);

  return {
    ok: result.failed === 0,
    ...(result.failed === 0
      ? { message: `${parts.join(", ")}.${result.firstError ? ` ${result.firstError}` : ""}` }
      : { error: `${parts.join(", ")}. ${result.firstError}` }),
  } as ActionResult;
}

// ------------------------------------------------------- manual bookings

/**
 * Books somebody in by hand — a phone call, a walk-in.
 *
 * Goes through the same availability check as the chat flow, so a manual
 * booking cannot quietly double-book a slot the bot is still offering. The
 * check can be overridden, because a business that wants to squeeze somebody
 * in knows better than its own opening hours.
 */
export async function createBooking(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("appointments");

  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  if (!date || !time) return { ok: false, error: "Pick a date and a time." };

  const day = parseDate(date);
  const clock = parseClock(time);
  if (!day || clock === null) return { ok: false, error: "That date or time could not be read." };

  const supabase = await createClient();
  const settings = await currentAvailability(ctx.orgId);

  const typeId = String(formData.get("appointment_type_id") ?? "").trim() || null;
  const { data: type } = typeId
    ? await supabase
        .from("appointment_types")
        .select("id, name, duration_minutes, location")
        .eq("org_id", ctx.orgId)
        .eq("id", typeId)
        .maybeSingle()
    : { data: null };

  const duration = type?.duration_minutes ?? settings.slotMinutes;
  const startsAt = zonedToUtc(
    day.year,
    day.month,
    day.day,
    Math.floor(clock / 60),
    clock % 60,
    settings.timezone
  );

  // The overlap check the chat flow gets for free from slot generation. Not
  // the full generator: a manual booking is allowed outside opening hours,
  // it just must not land on top of somebody else.
  if (!formData.get("allow_overlap")) {
    const windowStart = new Date(startsAt.getTime() - 12 * 3_600_000).toISOString();
    const windowEnd = new Date(startsAt.getTime() + 12 * 3_600_000).toISOString();
    const { data: nearby } = await supabase
      .from("meetings")
      .select("starts_at, duration_minutes")
      .eq("org_id", ctx.orgId)
      .eq("status", "scheduled")
      .gte("starts_at", windowStart)
      .lte("starts_at", windowEnd);

    const from = startsAt.getTime();
    const to = from + duration * 60_000;
    const clashes = (nearby ?? []).filter((entry) => {
      const otherFrom = new Date(entry.starts_at).getTime();
      const otherTo = otherFrom + entry.duration_minutes * 60_000;
      return from < otherTo && otherFrom < to;
    }).length;

    if (clashes >= settings.maxPerSlot) {
      return {
        ok: false,
        error: `That time is already taken${
          settings.maxPerSlot > 1 ? ` (${settings.maxPerSlot} per slot)` : ""
        }. Tick “book anyway” to double up.`,
      };
    }
  }

  const contactId = String(formData.get("contact_id") ?? "").trim() || null;
  const { data: contact } = contactId
    ? await supabase
        .from("contacts")
        .select("name, wa_id")
        .eq("org_id", ctx.orgId)
        .eq("id", contactId)
        .maybeSingle()
    : { data: null };

  const who = contact ? contact.name || contact.wa_id : String(formData.get("title") ?? "").trim();
  const title = type ? `${type.name}${who ? ` — ${who}` : ""}` : who || "Appointment";

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({
      org_id: ctx.orgId,
      contact_id: contactId,
      appointment_type_id: typeId,
      created_by: ctx.user.id,
      title,
      notes: String(formData.get("notes") ?? "").trim() || null,
      location: type?.location ?? null,
      starts_at: startsAt.toISOString(),
      duration_minutes: duration,
      status: "scheduled",
      source: "manual",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  await syncBookingToCalendar(supabase, ctx.orgId, meeting.id);

  revalidatePath("/appointments");
  revalidatePath("/meetings");
  return { ok: true, message: `Booked for ${date} at ${time}.` };
}

// --------------------------------------------------------------- calendar

/**
 * Pushes one booking to the connected calendar.
 *
 * Shared by the manual form and the status changes, so a cancelled booking
 * disappears from the diary rather than sitting there for somebody to turn
 * up to.
 */
async function syncBookingToCalendar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  meetingId: string
): Promise<void> {
  try {
    const credentials = await loadGoogleCalendar(supabase, orgId);
    if (!credentials) return;

    const { data: meeting } = await supabase
      .from("meetings")
      .select(
        "title, notes, location, starts_at, duration_minutes, status, calendar_event_id"
      )
      .eq("org_id", orgId)
      .eq("id", meetingId)
      .maybeSingle();
    if (!meeting) return;

    // A booking that is no longer happening should not be in the diary.
    if (meeting.status !== "scheduled") {
      if (meeting.calendar_event_id) {
        const removed = await deleteCalendarEvent(credentials, meeting.calendar_event_id);
        await supabase
          .from("meetings")
          .update(
            removed.ok
              ? { calendar_event_id: null, calendar_error: null }
              : { calendar_error: removed.error?.slice(0, 500) ?? null }
          )
          .eq("id", meetingId);
      }
      return;
    }

    const settings = await currentAvailability(orgId);
    const result = await upsertCalendarEvent(
      credentials,
      {
        summary: meeting.title,
        description: meeting.notes ?? undefined,
        location: meeting.location ?? undefined,
        startsAt: meeting.starts_at,
        durationMinutes: meeting.duration_minutes,
        timezone: settings.timezone,
      },
      meeting.calendar_event_id
    );

    await supabase
      .from("meetings")
      .update(
        result.ok
          ? {
              calendar_event_id: result.eventId,
              calendar_synced_at: new Date().toISOString(),
              calendar_error: null,
            }
          : { calendar_error: result.error.slice(0, 500) }
      )
      .eq("id", meetingId);
  } catch (error) {
    // The booking is saved either way. A calendar problem belongs on the
    // booking, not in the operator's face as a failed save.
    console.error("Calendar sync failed", error);
  }
}
