import "server-only";

import {
  durationLabel,
  generateSlots,
  readSettings,
  zonedDateLabel,
  zonedTimeLabel,
  type AppointmentSettings,
  type Slot,
} from "@/lib/appointments";
import {
  datePrompt,
  fillTemplate,
  isEmptyPrompt,
  prunePrompt,
  readIntent,
  timePrompt,
  typePrompt,
  type BookableType,
  type BookingPrompt,
} from "@/lib/booking-dialogue";
import { sendAndLogText, type OrgConnection, type RunnerClient } from "@/lib/whatsapp-send";
import {
  loadGoogleCalendar,
  upsertCalendarEvent,
  type CalendarEvent,
} from "@/lib/google-calendar";

// The booking conversation, sending half.
//
// booking-dialogue.ts decides what to ask; this reads the workspace's
// availability, sends the menu, and writes the meeting. It sits in front of
// the graph flows in the runner, because a customer halfway through booking
// who taps a time must get that time, not whatever a flow would have made of
// the message.
//
// Never throws. It runs inside webhook processing, where an exception is a
// customer's message silently dropped.

export interface BookingContext {
  supabase: RunnerClient;
  connection: OrgConnection;
  orgId: string;
  conversationId: string;
  contactId: string;
  contactWaId: string;
  contactName: string | null;
  text: string;
  buttonId: string | null;
}

export interface BookingResult {
  /** What to put on the bot_runs row. */
  label: string;
  reply: string | null;
  outcome: "replied" | "skipped" | "failed";
  error: string | null;
  /** Set when a meeting was actually created. */
  meetingId?: string;
}

interface SettingsRow {
  is_enabled: boolean;
  timezone: string;
  slot_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  horizon_days: number;
  max_per_slot: number;
  hours: unknown;
  trigger_keywords: string[] | null;
  location: string | null;
  greeting: string;
  confirmation: string;
  no_slots_message: string;
  cancelled_message: string;
}

interface SessionRow {
  step: "type" | "date" | "time";
  appointment_type_id: string | null;
  chosen_date: string | null;
}

/** How long a half-finished booking stays open. */
const SESSION_MINUTES = 30;

/**
 * Handles one inbound message if it is part of a booking.
 *
 * Returns null when it is not, leaving the message to the flows and the
 * matcher exactly as before.
 */
export async function tryBooking(context: BookingContext): Promise<BookingResult | null> {
  try {
    return await run(context);
  } catch (error) {
    console.error("Booking bot crashed", error);
    return {
      label: "Appointment booking",
      reply: null,
      outcome: "failed",
      error: error instanceof Error ? error.message : "Unknown booking failure",
    };
  }
}

async function run(context: BookingContext): Promise<BookingResult | null> {
  const { supabase, orgId } = context;

  const [settingsResult, sessionResult] = await Promise.all([
    supabase
      .from("appointment_settings")
      .select(
        "is_enabled, timezone, slot_minutes, buffer_minutes, min_notice_minutes, horizon_days, max_per_slot, hours, trigger_keywords, location, greeting, confirmation, no_slots_message, cancelled_message"
      )
      .eq("org_id", orgId)
      .maybeSingle(),
    loadSession(context),
  ]);

  // No row, an unmigrated database, or booking switched off: not our
  // message. A workspace that has never opened the Appointments page must
  // behave exactly as it did before this existed.
  const row = settingsResult.data as SettingsRow | null;
  if (settingsResult.error || !row?.is_enabled) return null;

  const settings = readSettings(row as unknown as Record<string, unknown>);
  const session = sessionResult;

  const intent = readIntent({
    text: context.text,
    buttonId: context.buttonId,
    keywords: row.trigger_keywords ?? [],
    inSession: session !== null,
  });

  if (intent.kind === "none") {
    // Mid-booking and the customer typed something we cannot read. Say so
    // and re-ask rather than silently handing the message to a flow, which
    // would answer something unrelated and leave the booking hanging.
    if (!session) return null;
    return reask(context, settings, row, session);
  }

  if (intent.kind === "cancel") {
    await clearSession(context);
    return send(context, { body: row.cancelled_message }, "Booking cancelled");
  }

  if (intent.kind === "start") {
    return startBooking(context, settings, row);
  }

  // Everything below is an answer to a question, so there has to have been
  // one. A stale button from a booking that has since expired starts over
  // rather than being read as an answer to nothing.
  if (!session) return startBooking(context, settings, row);

  if (intent.kind === "type") {
    return askForDate(context, settings, row, intent.typeId);
  }

  if (intent.kind === "dates") {
    return askForDate(context, settings, row, session.appointment_type_id);
  }

  if (intent.kind === "date") {
    return askForTime(context, settings, row, session.appointment_type_id, intent.date);
  }

  return book(context, settings, row, session, intent.startsAt);
}

// ------------------------------------------------------------------ steps

async function startBooking(
  context: BookingContext,
  settings: AppointmentSettings,
  row: SettingsRow
): Promise<BookingResult> {
  const types = await loadTypes(context);

  // A workspace with one service does not need to be asked which one.
  if (types.length <= 1) {
    return askForDate(context, settings, row, types[0]?.id ?? null);
  }

  await saveSession(context, { step: "type", typeId: null, date: null });
  return sendPrompt(context, typePrompt(row.greeting, types), "Chose what to book");
}

async function askForDate(
  context: BookingContext,
  settings: AppointmentSettings,
  row: SettingsRow,
  typeId: string | null
): Promise<BookingResult> {
  const type = typeId ? await loadType(context, typeId) : null;
  const slots = await freeSlots(context, settings, type?.durationMinutes);

  if (slots.length === 0) {
    await clearSession(context);
    return send(context, { body: row.no_slots_message }, "Nothing free");
  }

  await saveSession(context, { step: "date", typeId, date: null });
  return sendPrompt(context, datePrompt(slots, type?.name ?? null), "Chose a day");
}

async function askForTime(
  context: BookingContext,
  settings: AppointmentSettings,
  row: SettingsRow,
  typeId: string | null,
  date: string
): Promise<BookingResult> {
  const type = typeId ? await loadType(context, typeId) : null;
  const slots = await freeSlots(context, settings, type?.durationMinutes, date);

  if (slots.length === 0) {
    // Taken between the menu being sent and the tap arriving. Back to the
    // day list rather than a dead end.
    return askForDate(context, settings, row, typeId);
  }

  await saveSession(context, { step: "time", typeId, date });
  return sendPrompt(context, timePrompt(slots, slots[0].dateLabel), "Chose a time");
}

async function book(
  context: BookingContext,
  settings: AppointmentSettings,
  row: SettingsRow,
  session: SessionRow,
  startsAt: string
): Promise<BookingResult> {
  const type = session.appointment_type_id
    ? await loadType(context, session.appointment_type_id)
    : null;
  const duration = type?.durationMinutes ?? settings.slotMinutes;

  // Re-generate rather than trusting the tapped id. The list was built when
  // the message was sent, and somebody else may have taken the slot in
  // between — offering it again would double-book them.
  const stillFree = (await freeSlots(context, settings, duration)).some(
    (slot) => slot.startsAt === startsAt
  );

  if (!stillFree) {
    return askForDate(context, settings, row, session.appointment_type_id);
  }

  const when = new Date(startsAt);
  const title = type ? `${type.name} — ${context.contactName ?? "WhatsApp booking"}` : "Appointment";

  const { data: meeting, error } = await context.supabase
    .from("meetings")
    .insert({
      org_id: context.orgId,
      contact_id: context.contactId,
      appointment_type_id: session.appointment_type_id,
      title,
      location: type?.location ?? row.location ?? null,
      starts_at: startsAt,
      duration_minutes: duration,
      status: "scheduled",
      source: "whatsapp",
      notes: "Booked by the customer on WhatsApp.",
    })
    .select("id")
    .single();

  if (error || !meeting) {
    console.error("Could not write the booking", error);
    return {
      label: "Appointment booking",
      reply: null,
      outcome: "failed",
      error: error?.message ?? "The meeting could not be saved",
    };
  }

  await clearSession(context);

  // Into the business's calendar, if one is connected. After the meeting is
  // written and never before: a calendar that is unreachable must not cost
  // the customer their booking, so this can only ever add a note to a
  // booking that already exists.
  await pushToCalendar(context, meeting.id, {
    summary: title,
    location: type?.location ?? row.location ?? undefined,
    startsAt,
    durationMinutes: duration,
    timezone: settings.timezone,
    description: `Booked by ${context.contactName ?? context.contactWaId} on WhatsApp.`,
  });

  const body = fillTemplate(row.confirmation, {
    date: zonedDateLabel(when, settings.timezone),
    time: zonedTimeLabel(when, settings.timezone),
    service: type?.name ?? "your appointment",
    duration: durationLabel(duration),
    name: context.contactName ?? "",
    location: type?.location ?? row.location ?? "",
  });

  const result = await send(context, { body }, "Appointment booked");
  return { ...result, meetingId: meeting.id };
}

/** The customer said something mid-booking that was not an answer. */
async function reask(
  context: BookingContext,
  settings: AppointmentSettings,
  row: SettingsRow,
  session: SessionRow
): Promise<BookingResult> {
  if (session.step === "type") return startBooking(context, settings, row);
  if (session.step === "date") {
    return askForDate(context, settings, row, session.appointment_type_id);
  }
  return askForTime(
    context,
    settings,
    row,
    session.appointment_type_id,
    session.chosen_date ?? ""
  );
}

// ----------------------------------------------------------------- pieces

/**
 * What is free, given what is already booked and what is blacked out.
 *
 * Only looks at the horizon the workspace configured, and only at meetings
 * still standing — a cancelled one frees its slot.
 */
async function freeSlots(
  context: BookingContext,
  settings: AppointmentSettings,
  durationMinutes?: number,
  onlyDate?: string
): Promise<Slot[]> {
  const now = new Date();
  const until = new Date(now.getTime() + settings.horizonDays * 24 * 60 * 60_000);

  const [meetings, blackouts] = await Promise.all([
    context.supabase
      .from("meetings")
      .select("starts_at, duration_minutes")
      .eq("org_id", context.orgId)
      .eq("status", "scheduled")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", until.toISOString()),
    context.supabase
      .from("appointment_blackouts")
      .select("starts_at, ends_at")
      .eq("org_id", context.orgId)
      .gte("ends_at", now.toISOString())
      .lte("starts_at", until.toISOString()),
  ]);

  return generateSlots({
    settings,
    durationMinutes,
    now,
    booked: (meetings.data ?? []).map((entry) => ({
      startsAt: entry.starts_at,
      durationMinutes: entry.duration_minutes,
    })),
    blackouts: (blackouts.data ?? []).map((entry) => ({
      startsAt: entry.starts_at,
      endsAt: entry.ends_at,
    })),
    onlyDate,
    // Enough to fill any menu several times over without generating a
    // fortnight of five-minute slots for a list that shows nine.
    limit: onlyDate ? 60 : 300,
  });
}

async function loadTypes(context: BookingContext): Promise<BookableType[]> {
  const { data } = await context.supabase
    .from("appointment_types")
    .select("id, name, description, duration_minutes, price_cents")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("sort_order")
    .limit(20);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
  }));
}

async function loadType(
  context: BookingContext,
  id: string
): Promise<(BookableType & { location: string | null }) | null> {
  const { data } = await context.supabase
    .from("appointment_types")
    .select("id, name, description, duration_minutes, price_cents, location")
    .eq("org_id", context.orgId)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    durationMinutes: data.duration_minutes,
    priceCents: data.price_cents,
    location: data.location,
  };
}

async function loadSession(context: BookingContext): Promise<SessionRow | null> {
  const { data, error } = await context.supabase
    .from("booking_sessions")
    .select("step, appointment_type_id, chosen_date, expires_at")
    .eq("conversation_id", context.conversationId)
    .maybeSingle();

  if (error || !data) return null;

  // Expired sessions are treated as absent and cleared on the way past, so
  // an abandoned booking cannot capture an unrelated message a day later.
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await clearSession(context);
    return null;
  }

  return {
    step: data.step,
    appointment_type_id: data.appointment_type_id,
    chosen_date: data.chosen_date,
  };
}

async function saveSession(
  context: BookingContext,
  state: { step: "type" | "date" | "time"; typeId: string | null; date: string | null }
): Promise<void> {
  const now = new Date();
  const { error } = await context.supabase.from("booking_sessions").upsert(
    {
      conversation_id: context.conversationId,
      org_id: context.orgId,
      contact_id: context.contactId,
      step: state.step,
      appointment_type_id: state.typeId,
      chosen_date: state.date,
      // Pushed forward on every step: the clock runs from the last thing
      // the customer did, not from when they started.
      expires_at: new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "conversation_id" }
  );

  if (error) console.error("Could not save the booking session", error);
}

async function clearSession(context: BookingContext): Promise<void> {
  const { error } = await context.supabase
    .from("booking_sessions")
    .delete()
    .eq("conversation_id", context.conversationId);
  if (error) console.error("Could not clear the booking session", error);
}

// ------------------------------------------------------------------ send

async function sendPrompt(
  context: BookingContext,
  prompt: BookingPrompt,
  label: string
): Promise<BookingResult> {
  const pruned = prunePrompt(prompt);

  // Every row was filtered out. Sending an empty list is a Meta error, and
  // the customer would see nothing at all.
  if (isEmptyPrompt(pruned)) {
    return {
      label,
      reply: null,
      outcome: "skipped",
      error: "Nothing left to offer once the list was capped",
    };
  }

  const sent = await sendAndLogText({
    supabase: context.supabase,
    connection: context.connection,
    conversationId: context.conversationId,
    toWaId: context.contactWaId,
    body: pruned.body,
    list: { buttonText: pruned.buttonText, sections: pruned.sections },
    // Answering a message that just arrived, so the service window is open.
    skipWindowCheck: true,
  });

  return {
    label,
    reply: pruned.body,
    outcome: sent.ok ? "replied" : "failed",
    error: sent.ok ? null : sent.error,
  };
}

async function send(
  context: BookingContext,
  message: { body: string },
  label: string
): Promise<BookingResult> {
  const sent = await sendAndLogText({
    supabase: context.supabase,
    connection: context.connection,
    conversationId: context.conversationId,
    toWaId: context.contactWaId,
    body: message.body,
    skipWindowCheck: true,
  });

  return {
    label,
    reply: message.body,
    outcome: sent.ok ? "replied" : "failed",
    error: sent.ok ? null : sent.error,
  };
}

// -------------------------------------------------------------- calendar

/**
 * Puts a booking in the connected calendar, and records what happened.
 *
 * Never throws and never reports failure upwards. The booking is already
 * saved and the customer already told; a Google outage is something for the
 * operator to see on the booking, not a reason to fail the conversation.
 */
async function pushToCalendar(
  context: BookingContext,
  meetingId: string,
  event: CalendarEvent
): Promise<void> {
  try {
    const credentials = await loadGoogleCalendar(context.supabase, context.orgId);
    if (!credentials) return;

    const result = await upsertCalendarEvent(credentials, event);
    await context.supabase
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
    console.error("Calendar push failed", error);
  }
}
