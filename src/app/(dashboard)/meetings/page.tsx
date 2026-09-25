import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { HeroHeader, EmptyState, StatCard } from "@/components/ui/primitives";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { saveMeeting } from "../leads-actions";
import { MEETING_PLATFORMS, PLATFORM_LABEL } from "@/lib/meeting-platform";
import { listConnections } from "@/lib/connections";
import { optionLabel } from "@/lib/number-identity";
import MeetingRow, { type MeetingItem } from "./MeetingRow";

export default async function MeetingsPage() {
  const { orgId } = await requireFeature("meetings");
  const supabase = await createClient();

  const [{ data: meetings, error }, { data: contacts }, connections] = await Promise.all([
    supabase
      .from("meetings")
      .select("*, contacts(name, wa_id)")
      .eq("org_id", orgId)
      .order("starts_at", { ascending: true })
      .limit(200),
    supabase
      .from("contacts")
      .select("id, name, wa_id")
      .eq("org_id", orgId)
      .order("name")
      .limit(500),
    listConnections(supabase, orgId),
  ]);

  const all = meetings ?? [];
  // Only a working number can carry a confirmation, so only those are
  // offered — naming one that is disabled is the same outage with a
  // different cause.
  const activeNumbers = connections.filter((connection) => connection.status === "active");

  const items: MeetingItem[] = all.map((meeting) => {
    const contact = meeting.contacts as { name: string | null; wa_id: string } | null;
    return {
      id: meeting.id,
      title: meeting.title,
      notes: meeting.notes,
      location: meeting.location,
      startsAt: meeting.starts_at,
      durationMinutes: meeting.duration_minutes,
      status: meeting.status,
      contactName: contact ? contact.name || contact.wa_id : null,
    };
  });

  const upcoming = items.filter((item) => item.status === "scheduled" && !hasPassed(item.startsAt));
  const past = items
    .filter((item) => item.status !== "scheduled" || hasPassed(item.startsAt))
    .reverse();

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Meetings"
        subtitle="Calls and appointments you have committed to, with the customer they belong to."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Upcoming" value={upcoming.length} />
        <StatCard label="Today" value={upcoming.filter((item) => isToday(item.startsAt)).length} />
        <StatCard
          label="Completed"
          value={items.filter((item) => item.status === "completed").length}
        />
        <StatCard
          label="No-shows"
          value={items.filter((item) => item.status === "no_show").length}
        />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="order-2 lg:order-1 space-y-6">
          {error ? (
            <EmptyState
              title="Couldn't load meetings"
              description={`${error.message}. If this mentions a missing relation, run the latest migration in supabase/setup.sql.`}
            />
          ) : (
            <>
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-3">
                  Upcoming
                </h2>
                {upcoming.length === 0 ? (
                  <div className="glass-card p-8 text-center">
                    <p className="text-sm text-white/45">
                      Nothing booked. Schedule one from the panel beside this.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcoming.map((item) => (
                      <MeetingRow key={item.id} meeting={item} />
                    ))}
                  </div>
                )}
              </section>

              {past.length > 0 && (
                <section>
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-3">
                    Past and closed
                  </h2>
                  <div className="space-y-2">
                    {past.slice(0, 50).map((item) => (
                      <MeetingRow key={item.id} meeting={item} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="order-1 lg:order-2 glass-card p-6">
          <h2 className="font-semibold mb-1">Schedule a meeting</h2>
          <p className="text-sm text-white/50 mb-5 leading-relaxed">
            Pick a contact and the confirmation goes to them on WhatsApp — what it is, when, how
            long, and how to join.
          </p>

          <ActionForm action={saveMeeting} submitLabel="Schedule" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Title" name="title" required placeholder="Product demo" />
              <SelectField
                label="Contact"
                name="contact_id"
                defaultValue=""
                options={[
                  { value: "", label: "No contact" },
                  ...(contacts ?? []).map((contact) => ({
                    value: contact.id,
                    label: contact.name || contact.wa_id,
                  })),
                ]}
              />
              <Field label="Starts at" name="starts_at" type="datetime-local" required />
              <Field
                label="Duration"
                name="duration_minutes"
                type="number"
                defaultValue="30"
                hint="In minutes."
              />
              <SelectField
                label="Where"
                name="platform"
                defaultValue="google_meet"
                options={MEETING_PLATFORMS.map((platform) => ({
                  value: platform,
                  label: PLATFORM_LABEL[platform],
                }))}
              />
              <Field
                label="Meeting link"
                name="meeting_url"
                placeholder="https://meet.google.com/abc-defg-hij"
                hint="Needed for Google Meet, Zoom and Calendly. The link and the platform have to agree — a Zoom link under Google Meet sends the customer to the wrong place."
              />
              <Field
                label="Address or number"
                name="location"
                placeholder="12 MG Road, Akola"
                hint="For an in-person meeting or a phone call. Left blank when there is a link."
              />

              {activeNumbers.length > 1 && (
                <SelectField
                  label="Confirm from"
                  name="connection_id"
                  options={activeNumbers.map((connection) => ({
                    value: connection.id,
                    label: optionLabel(connection),
                  }))}
                />
              )}

              <TextareaField label="Notes" name="notes" rows={3} />

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="notify"
                  defaultChecked
                  className="accent-[var(--accent)] w-4 h-4 mt-0.5"
                />
                <span className="text-sm text-white/75">
                  Tell the customer on WhatsApp
                  <span className="block text-[11px] text-white/40 leading-relaxed">
                    Needs a contact picked above, and a conversation with them inside WhatsApp&apos;s
                    24-hour window. The meeting saves either way.
                  </span>
                </span>
              </label>
            </div>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}

function hasPassed(iso: string): boolean {
  return Date.parse(iso) < Date.now();
}

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}
