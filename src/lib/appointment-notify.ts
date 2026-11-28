import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailBrand } from "@/lib/email";
import { ownerEmail } from "@/lib/billing-emails";
import { newBookingEmail } from "@/lib/email-templates";
import { zonedDateLabel, zonedTimeLabel } from "@/lib/appointments";

// Telling the business a customer booked itself in.
//
// Only for bookings the customer made. A booking the business typed into
// its own Appointments screen does not need an email telling it what it
// just did, and sending one trains people to ignore the ones that matter.
//
// Never throws. This runs immediately after the booking is written, and
// a failure to send an email must not cost the customer their
// appointment or turn the bot's confirmation into an error.

export async function notifyNewBooking(input: {
  orgId: string;
  meetingId: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: settings } = await admin
      .from("appointment_settings")
      .select("timezone, notify_on_booking, notify_email, location")
      .eq("org_id", input.orgId)
      .maybeSingle();

    // A missing row means the columns have not been migrated yet, or the
    // business never opened the screen. Neither is a reason to send an
    // email nobody asked for.
    if (!settings || settings.notify_on_booking === false) return;

    const { data: meeting } = await admin
      .from("meetings")
      .select("id, title, starts_at, duration_minutes, location, contact_id")
      .eq("id", input.meetingId)
      .maybeSingle();
    if (!meeting) return;

    const { data: contact } = meeting.contact_id
      ? await admin
          .from("contacts")
          .select("name, wa_id")
          .eq("id", meeting.contact_id)
          .maybeSingle()
      : { data: null };

    const to = settings.notify_email?.trim() || (await ownerEmail(admin, input.orgId));
    if (!to) return;

    const timeZone = settings.timezone || "Asia/Kolkata";
    const starts = new Date(meeting.starts_at);

    // The business's own timezone, not the server's. A booking shown an
    // hour out is worse than no email: somebody acts on it.
    const when = `${zonedDateLabel(starts, timeZone)} at ${zonedTimeLabel(starts, timeZone)}`;

    // The bot writes "Haircut — Priya" as the title. The customer's name
    // is shown separately, so the duplicate tail is trimmed off.
    const what = (meeting.title ?? "an appointment").split(" — ")[0].trim() || "an appointment";

    await sendEmail({
      to,
      orgId: input.orgId,
      kind: "booking_created",
      // One email per booking, however many times this is reached. The
      // bot retries, the webhook redelivers, and the customer would
      // otherwise be announced four times.
      dedupeKey: `booking:${meeting.id}`,
      body: (brand) =>
        newBookingEmail(brand, {
          customerName: contact?.name?.trim() || "A customer",
          customerNumber: contact?.wa_id ?? null,
          what,
          when,
          location: meeting.location ?? settings.location ?? null,
        }),
      vars: {
        customer: contact?.name?.trim() || "A customer",
        when,
        what,
      },
    });
  } catch (error) {
    console.error("Could not send the new-booking notification", error);
  }
}

/** The brand is re-exported so a caller can preview the wording. */
export { emailBrand };
