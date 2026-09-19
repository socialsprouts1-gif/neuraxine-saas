import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { durationLabel, readSettings, zonedDateLabel, zonedTimeLabel } from "@/lib/appointments";
import { fillTemplate } from "@/lib/booking-dialogue";
import { loadOrgConnection, sendAndLogText } from "@/lib/whatsapp-send";
import { findContactConversation } from "@/lib/contact-conversation";
import {
  MetaApiError,
  describeMetaError,
  sendTemplateMessage,
} from "@/lib/meta-whatsapp";

// Reminding a customer their appointment is coming.
//
// The awkward part is not the scheduling, it is WhatsApp's 24-hour service
// window: a reminder three hours before an appointment booked last week is
// almost always outside it, and outside it Meta accepts nothing but an
// approved template. So a workspace that has named a template gets one sent;
// one that has not gets a free-form message only when the window is
// genuinely open, and the rest are recorded as skipped rather than failing
// quietly and leaving somebody to wonder why nobody was reminded.
//
// Reachable from a scheduler and from a button on the Appointments screen,
// because this project runs on a Vercel plan with no cron.

/** How many reminders one sweep will send. */
const BATCH = 80;

export interface ReminderResult {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  /** The first thing that went wrong, for the message on screen. */
  firstError: string | null;
  error?: string;
}

const EMPTY: ReminderResult = { due: 0, sent: 0, skipped: 0, failed: 0, firstError: null };

interface Candidate {
  id: string;
  org_id: string;
  contact_id: string | null;
  title: string;
  location: string | null;
  starts_at: string;
  duration_minutes: number;
  appointment_type_id: string | null;
}

/**
 * Sends every reminder that has come due.
 *
 * Never throws. A scheduler calling this must get a result it can log, not
 * a stack trace, and the button on the Appointments screen has to be able to
 * report what happened.
 */
export async function dispatchDueReminders(orgId?: string): Promise<ReminderResult> {
  const supabase = createAdminClient();

  // Only workspaces that want reminders at all. Reading the settings first
  // means the meetings query is scoped to them rather than scanning every
  // booking on the platform.
  let settingsQuery = supabase
    .from("appointment_settings")
    .select(
      "org_id, timezone, slot_minutes, buffer_minutes, min_notice_minutes, horizon_days, max_per_slot, hours, reminder_hours, reminder_template, reminder_template_language, reminder_message, location"
    )
    .gt("reminder_hours", 0);
  if (orgId) settingsQuery = settingsQuery.eq("org_id", orgId);

  const { data: settingsRows, error: settingsError } = await settingsQuery;

  if (settingsError) {
    // An unmigrated database is not a failure worth alarming anyone about:
    // there is nothing to remind about yet.
    return { ...EMPTY, error: settingsError.message };
  }
  if (!settingsRows || settingsRows.length === 0) return { ...EMPTY };

  const result: ReminderResult = { ...EMPTY };

  for (const row of settingsRows) {
    const settings = readSettings(row as unknown as Record<string, unknown>);
    const hours = (row as { reminder_hours: number }).reminder_hours;
    const now = Date.now();

    // The window this sweep covers: anything starting between now and the
    // reminder distance. A booking further out is not due yet; one already
    // started is too late to be worth a reminder.
    const { data: due, error } = await supabase
      .from("meetings")
      .select("id, org_id, contact_id, title, location, starts_at, duration_minutes, appointment_type_id")
      .eq("org_id", (row as { org_id: string }).org_id)
      .eq("status", "scheduled")
      .is("reminder_sent_at", null)
      .gte("starts_at", new Date(now).toISOString())
      .lte("starts_at", new Date(now + hours * 3_600_000).toISOString())
      .order("starts_at")
      .limit(BATCH);

    if (error) {
      result.firstError ??= error.message;
      continue;
    }

    for (const meeting of (due ?? []) as Candidate[]) {
      result.due += 1;
      const outcome = await remindOne(supabase, meeting, settings, row as never);

      if (outcome.status === "sent") result.sent += 1;
      else if (outcome.status === "skipped") result.skipped += 1;
      else {
        result.failed += 1;
        result.firstError ??= outcome.reason;
      }
    }
  }

  return result;
}

type Admin = ReturnType<typeof createAdminClient>;

interface SettingsRow {
  reminder_template: string | null;
  reminder_template_language: string;
  reminder_message: string;
  location: string | null;
}

async function remindOne(
  supabase: Admin,
  meeting: Candidate,
  settings: ReturnType<typeof readSettings>,
  row: SettingsRow
): Promise<{ status: "sent" | "skipped" | "failed"; reason: string }> {
  if (!meeting.contact_id) {
    // A booking with no contact — added by hand for a walk-in — has nobody
    // to remind. Stamp it so the sweep does not keep picking it up.
    await stamp(supabase, meeting.id, null);
    return { status: "skipped", reason: "No contact on this booking" };
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("wa_id, name, opted_out")
    .eq("id", meeting.contact_id)
    .maybeSingle();

  if (!contact?.wa_id) {
    await stamp(supabase, meeting.id, null);
    return { status: "skipped", reason: "Contact has no WhatsApp number" };
  }

  if (contact.opted_out) {
    // Opting out means opting out of everything we initiate, a reminder
    // included. Stamped so it is not retried.
    await stamp(supabase, meeting.id, null);
    return { status: "skipped", reason: "Contact has opted out" };
  }

  const conversation = await findContactConversation(
    supabase,
    meeting.org_id,
    meeting.contact_id
  );

  const connection = await loadOrgConnection(supabase, meeting.org_id, {
    conversationId: conversation?.id ?? null,
  });
  if (!connection) {
    return {
      status: "failed",
      reason: "No active WhatsApp connection, or its token could not be decrypted",
    };
  }

  const when = new Date(meeting.starts_at);
  const values = {
    date: zonedDateLabel(when, settings.timezone),
    time: zonedTimeLabel(when, settings.timezone),
    service: meeting.title,
    duration: durationLabel(meeting.duration_minutes),
    name: contact.name ?? "",
    location: meeting.location ?? row.location ?? "",
  };

  // A named template works whether or not the window is open, which is the
  // whole reason to configure one.
  if (row.reminder_template) {
    try {
      const sent = await sendTemplateMessage(
        connection.phoneNumberId,
        contact.wa_id,
        row.reminder_template,
        row.reminder_template_language || "en",
        [
          {
            type: "body",
            parameters: [
              { type: "text", text: values.date },
              { type: "text", text: values.time },
            ],
          },
        ],
        connection.accessToken
      );

      if (conversation) {
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          direction: "outbound",
          type: "template",
          content: { template: row.reminder_template, parameters: [values.date, values.time] },
          wa_message_id: sent.messages[0]?.id ?? null,
          status: "sent",
        });
      }

      await stamp(supabase, meeting.id, sent.messages[0]?.id ?? null);
      return { status: "sent", reason: "" };
    } catch (error) {
      const reason =
        error instanceof MetaApiError
          ? describeMetaError(error.status, error.body)
          : error instanceof Error
            ? error.message
            : "Unknown send failure";
      return { status: "failed", reason };
    }
  }

  // No template. Free-form only, so the window decides — and the window is
  // checked rather than skipped, because a reminder is us starting the
  // conversation, not answering one.
  if (!conversation) {
    return { status: "skipped", reason: "No conversation with this contact yet" };
  }

  const sent = await sendAndLogText({
    supabase,
    connection,
    conversationId: conversation.id,
    toWaId: contact.wa_id,
    body: fillTemplate(row.reminder_message, values),
    lastInboundAt: conversation.last_inbound_at,
  });

  if (sent.ok) {
    await stamp(supabase, meeting.id, sent.waMessageId);
    return { status: "sent", reason: "" };
  }

  if (sent.outsideWindow) {
    // Stamped deliberately: retrying cannot succeed, and leaving it unstamped
    // means every sweep from now until the appointment reattempts it.
    await stamp(supabase, meeting.id, null);
    return {
      status: "skipped",
      reason:
        "Outside WhatsApp's 24-hour window. Name an approved template under Appointments → Bot to remind anyway.",
    };
  }

  return { status: "failed", reason: sent.error ?? "Send failed" };
}

/**
 * Marks a reminder dealt with.
 *
 * Written for skips as well as sends, because the alternative is a sweep
 * that reattempts the same impossible reminder every time it runs.
 */
async function stamp(supabase: Admin, meetingId: string, _waMessageId: string | null) {
  const { error } = await supabase
    .from("meetings")
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq("id", meetingId);
  if (error) console.error("Could not stamp the reminder", error);
}
