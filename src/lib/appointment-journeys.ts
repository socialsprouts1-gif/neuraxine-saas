import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enrol } from "@/lib/drip-engine";
import { isAppointmentEvent, type AppointmentEvent } from "@/lib/drip";

// Sequences that start because an appointment did something.
//
// This is the piece the follow-up engine was missing. It already knew how
// to walk somebody through a sequence on their own clock, and how to let
// them in by keyword, by hand, or by API call. What it could not be told
// is "when somebody's appointment finishes" — which is where almost all
// of the follow-up in any appointment business actually lives.
//
// The shape is the same in every trade, which is the whole point of
// keeping it here rather than in a dentistry feature:
//
//   booked      → confirmation, what to bring, how to find you
//   completed   → aftercare, a check-in in a few days, a review request,
//                 a reminder months later
//   no_show     → a nudge to rebook, instead of a lost slot
//   cancelled   → an offer of another time, while they still want it
//
// A dentist calls the last one a recall, a salon a touch-up, a gym a
// reassessment, a tutor the next term. Only the words differ, and the
// words live in the templates, not in here.
//
// Called from every place a booking changes state, which is the one thing
// that must not be got wrong: a trigger wired into the manual form alone
// would never fire for the bookings customers make themselves, and those
// are most of them.

export interface JourneyResult {
  /** How many sequences this event put somebody into. */
  started: number;
  /** Set when a sequence was waiting but could not be started. */
  blocked?: string;
}

const NOTHING: JourneyResult = { started: 0 };

/**
 * Starts every sequence that was waiting for this event on this booking.
 *
 * Never throws. A broken follow-up rule must not stop a booking from
 * being marked done, and it must not break the webhook the customer's own
 * booking arrives through.
 */
export async function startAppointmentJourneys(input: {
  orgId: string;
  meetingId: string;
  event: AppointmentEvent;
}): Promise<JourneyResult> {
  try {
    if (!input.orgId || !input.meetingId || !isAppointmentEvent(input.event)) return NOTHING;

    const supabase = createAdminClient();

    // Which sequences are waiting for this. Checked first because most
    // workspaces have none, and there is no reason to read the booking or
    // the contact for a workspace that has set nothing up.
    const { data: candidates, error } = await supabase
      .from("drip_campaigns")
      .select("id, name, status, trigger_appointment_type_id")
      .eq("org_id", input.orgId)
      .in("status", ["active", "draft", "paused"])
      .eq("trigger_type", "appointment")
      .eq("trigger_event", input.event);

    if (error || !candidates || candidates.length === 0) return NOTHING;

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, contact_id, appointment_type_id")
      .eq("id", input.meetingId)
      .eq("org_id", input.orgId)
      .maybeSingle();

    if (!meeting) return NOTHING;

    // Sequences scoped to one kind of visit only run for that kind. Done
    // before the switched-on check, so marking a cleaning done does not
    // report on the root-canal sequence nobody asked about.
    const relevant = candidates.filter(
      (campaign) =>
        !campaign.trigger_appointment_type_id ||
        campaign.trigger_appointment_type_id === meeting.appointment_type_id
    );

    if (relevant.length === 0) return NOTHING;

    const matching = relevant.filter((campaign) => campaign.status === "active");

    // A sequence that is built but not switched on.
    //
    // Said out loud, because the alternative is the worst failure this
    // feature has: somebody creates a journey, marks an appointment done
    // to test it, sees "Updated." and nothing else, and concludes the
    // whole thing is broken. It is not broken — it is a draft.
    if (matching.length === 0) {
      const asleep = relevant[0];
      return {
        started: 0,
        blocked: `“${asleep.name}” is ${
          asleep.status === "draft" ? "still a draft" : "paused"
        } — switch it on and it will run from the next appointment.`,
      };
    }

    // The follow-up goes to a phone number, and a booking typed in by
    // hand with no contact attached has none. Said out loud rather than
    // swallowed: a sequence that quietly does nothing is the kind of
    // thing somebody discovers a month later.
    if (!meeting.contact_id) {
      return {
        started: 0,
        blocked:
          matching.length === 1
            ? `“${matching[0].name}” could not start — this booking has no contact, so there is no number to message.`
            : `${matching.length} follow-up sequences could not start — this booking has no contact, so there is no number to message.`,
      };
    }

    const { data: contact } = await supabase
      .from("contacts")
      .select("id, wa_id")
      .eq("id", meeting.contact_id)
      .eq("org_id", input.orgId)
      .maybeSingle();

    if (!contact?.wa_id) {
      return {
        started: 0,
        blocked: "The contact on this booking has no WhatsApp number, so no follow-up could start.",
      };
    }

    let started = 0;
    let blocked: string | undefined;

    for (const campaign of matching) {
      // restart, because somebody who came back deserves the aftercare
      // again. Six months is exactly the gap these sequences are built
      // for, and a one-off enrolment would make the second visit silent.
      const result = await enrol(
        supabase,
        campaign.id,
        [{ waId: contact.wa_id, contactId: contact.id }],
        "appointment",
        { restart: true }
      );

      if (result.error) blocked ??= `“${campaign.name}”: ${result.error}`;
      started += result.enrolled;
    }

    return { started, blocked };
  } catch (error) {
    return {
      started: 0,
      blocked: error instanceof Error ? error.message : "The follow-up sequences could not be read.",
    };
  }
}

/** "Started 2 follow-up sequences." — the half-sentence an action appends. */
export function describeJourneys(result: JourneyResult): string {
  if (result.blocked) return result.blocked;
  if (result.started === 0) return "";
  if (result.started === 1) return "Follow-up sequence started.";
  return `${result.started} follow-up sequences started.`;
}
