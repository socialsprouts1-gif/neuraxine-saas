import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { HeroHeader, StatCard } from "@/components/ui/primitives";
import {
  DEFAULT_SETTINGS,
  generateSlots,
  readSettings,
  zonedDateKey,
  type AppointmentSettings,
} from "@/lib/appointments";
import type { AppointmentBlackout, AppointmentType } from "@/types/portal";
import AppointmentsBrowser from "./AppointmentsBrowser";
import type { BookingItem } from "./BookingList";

// Everything about appointments on one screen, in the order somebody sets it
// up: what can be booked, when you are open, when you are not, and what the
// bot says. The bookings themselves lead, because that is what you come back
// for once it is set up.

export default async function AppointmentsPage() {
  const { orgId, role } = await requireFeature("appointments");
  const supabase = await createClient();
  const canManage = role === "owner" || role === "admin";

  const [settingsRow, typesResult, blackoutsResult, bookingsResult, contactsResult] =
    await Promise.all([
      supabase.from("appointment_settings").select("*").eq("org_id", orgId).maybeSingle(),
      supabase
        .from("appointment_types")
        .select("*")
        .eq("org_id", orgId)
        .order("sort_order")
        .limit(100),
      supabase
        .from("appointment_blackouts")
        .select("*")
        .eq("org_id", orgId)
        .gte("ends_at", new Date().toISOString())
        .order("starts_at")
        .limit(100),
      supabase
        .from("meetings")
        .select("*, contacts(name, wa_id)")
        .eq("org_id", orgId)
        .order("starts_at", { ascending: true })
        .limit(300),
      supabase
        .from("contacts")
        .select("id, name, wa_id")
        .eq("org_id", orgId)
        .order("name")
        .limit(500),
    ]);

  // A database that has not run the appointments migration renders the page
  // with defaults and an explanation, rather than an error where the setup
  // instructions should be.
  const migrated = !settingsRow.error && !typesResult.error;

  const settings: AppointmentSettings = migrated
    ? readSettings(settingsRow.data as unknown as Record<string, unknown> | null)
    : DEFAULT_SETTINGS;

  const types = (typesResult.data ?? []) as AppointmentType[];
  const blackouts = (blackoutsResult.data ?? []) as AppointmentBlackout[];

  const bookings: BookingItem[] = (bookingsResult.data ?? []).map((row) => {
    const contact = row.contacts as { name: string | null; wa_id: string } | null;
    return {
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      durationMinutes: row.duration_minutes,
      status: row.status,
      location: row.location,
      source: row.source ?? "manual",
      serviceName: types.find((type) => type.id === row.appointment_type_id)?.name ?? null,
      contactName: contact ? contact.name || contact.wa_id : null,
      contactWaId: contact?.wa_id ?? null,
    };
  });

  const now = new Date();
  const upcoming = bookings.filter(
    (booking) => booking.status === "scheduled" && new Date(booking.startsAt) >= now
  );
  const todayKey = zonedDateKey(now, settings.timezone);
  const today = upcoming.filter(
    (booking) => zonedDateKey(new Date(booking.startsAt), settings.timezone) === todayKey
  );

  // What the customer would be offered right now. The most direct answer to
  // "is this actually working?", and the only way to notice that every day
  // has been closed or the notice period swallowed the whole horizon.
  const free = migrated
    ? generateSlots({
        settings,
        now,
        booked: bookings
          .filter((booking) => booking.status === "scheduled")
          .map((booking) => ({
            startsAt: booking.startsAt,
            durationMinutes: booking.durationMinutes,
          })),
        blackouts: blackouts.map((entry) => ({
          startsAt: entry.starts_at,
          endsAt: entry.ends_at,
        })),
        limit: 200,
      })
    : [];

  const settingsData = (settingsRow.data ?? null) as Record<string, unknown> | null;

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Appointment booking"
        subtitle="What you offer, when you are free, and a booking conversation your customers can finish on WhatsApp without you."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Upcoming" value={upcoming.length} />
        <StatCard label="Today" value={today.length} />
        <StatCard label="Booked on WhatsApp" value={
          bookings.filter((booking) => booking.source === "whatsapp").length
        } />
        <StatCard label="Slots free" value={free.length} />
      </div>

      <AppointmentsBrowser
        canManage={canManage}
        migrated={migrated}
        migrationError={settingsRow.error?.message ?? typesResult.error?.message ?? null}
        settings={settings}
        botEnabled={Boolean(settingsData?.is_enabled)}
        keywords={(settingsData?.trigger_keywords as string[] | undefined) ?? []}
        messages={{
          location: (settingsData?.location as string | null) ?? "",
          greeting: (settingsData?.greeting as string | undefined) ?? "",
          confirmation: (settingsData?.confirmation as string | undefined) ?? "",
          noSlots: (settingsData?.no_slots_message as string | undefined) ?? "",
          cancelled: (settingsData?.cancelled_message as string | undefined) ?? "",
          reminderHours: (settingsData?.reminder_hours as number | undefined) ?? 3,
          reminderTemplate: (settingsData?.reminder_template as string | null) ?? "",
          reminderTemplateLanguage:
            (settingsData?.reminder_template_language as string | undefined) ?? "en",
          reminderMessage: (settingsData?.reminder_message as string | undefined) ?? "",
        }}
        types={types}
        blackouts={blackouts}
        bookings={bookings}
        upcomingCount={upcoming.length}
        nextSlots={free.slice(0, 12)}
        contacts={(contactsResult.data ?? []).map((contact) => ({
          id: contact.id,
          label: contact.name || contact.wa_id,
        }))}
      />
    </div>
  );
}
