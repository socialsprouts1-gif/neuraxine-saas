import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { listConnections } from "@/lib/connections";
import { optionLabel } from "@/lib/number-identity";
import { scheduleMessage, cancelScheduledMessage } from "../portal-actions";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  Table,
  Td,
  EmptyState,
} from "@/components/ui/primitives";
import { describeWhen, dueForSend } from "@/lib/scheduled-message";
import DueRunner from "./DueRunner";

/**
 * Messages written now and delivered later.
 *
 * Its own section rather than a corner of the inbox, because the thing
 * being managed is a queue: what is waiting, what went, what failed and
 * why. An inbox is organised by conversation, which is the wrong axis for
 * "what have I committed to sending on Thursday".
 */
export default async function ScheduledPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: rows, error }, { data: contacts }, connections] = await Promise.all([
    supabase
      .from("scheduled_messages")
      .select("*")
      .eq("org_id", orgId)
      .order("send_at", { ascending: false })
      .limit(100),
    supabase.from("contacts").select("id, name, wa_id").eq("org_id", orgId).order("name").limit(300),
    listConnections(supabase, orgId),
  ]);

  const all = rows ?? [];

  // Contact names fetched separately rather than embedded: an embed
  // depends on PostgREST spotting the foreign key, and a queue that fails
  // to load because of a relationship hint is a queue nobody can manage.
  const namedIds = [...new Set(all.map((row) => row.contact_id).filter(Boolean))] as string[];
  const nameById = new Map(
    ((contacts ?? []) as Array<{ id: string; name: string | null }>)
      .filter((contact) => namedIds.includes(contact.id))
      .map((contact) => [contact.id, contact.name])
  );
  const pending = all.filter((row) => row.status === "pending");
  const active = connections.filter((connection) => connection.status === "active");

  // Server Component: the clock is read once per request and is stable for
  // this render, unlike in a client component that can re-render at will.
  const now = new Date();

  // Anything already past its time. The runner below only polls when this
  // is non-zero, so an empty queue costs nothing.
  const dueNow = dueForSend(all, now).length;

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Scheduled messages"
        subtitle="Write it now, have it arrive when it should."
      />

      {/* Said plainly, because the alternative is somebody watching a
          message sit at "pending" past its time and concluding the feature
          is broken. It is not — it is waiting for something to run. */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">How these get sent</h2>
        <p className="text-sm text-white/50 leading-relaxed mb-4">
          Messages go out when the scheduler runs. It runs by itself every minute while you
          have Neura Chat open in a browser tab — any page, not just this one — and once a day
          from the server as a backstop. So keeping a tab open is the surest way to have
          something land on the minute. The button below sends anything already due, right now.
        </p>
        <DueRunner dueNow={dueNow} />
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Waiting" value={pending.length} hint={dueNow > 0 ? `${dueNow} due now` : undefined} />
        <StatCard label="Sent" value={all.filter((r) => r.status === "sent").length} />
        <StatCard label="Failed" value={all.filter((r) => r.status === "failed").length} />
        <StatCard label="Cancelled" value={all.filter((r) => r.status === "cancelled").length} />
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState
              title="Couldn't load scheduled messages"
              description={`${error.message}. If this mentions a missing relation, run supabase/updates/2026-09.sql — the scheduled_messages table comes from it.`}
            />
          ) : all.length > 0 ? (
            <Table head={["When", "To", "Message", "Status", ""]}>
              {all.map((row) => {
                const name = row.contact_id ? nameById.get(row.contact_id) : null;
                return (
                  <tr key={row.id} className="hover:bg-white/3 transition-colors align-top">
                    <Td className="whitespace-nowrap">
                      <div className="text-xs">
                        {new Date(row.send_at).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {row.status === "pending" && (
                        <div className="text-[10px] text-white/35">
                          {describeWhen(row.send_at, now)}
                        </div>
                      )}
                    </Td>
                    <Td className="text-xs">
                      <div>{name ?? "—"}</div>
                      <div className="text-white/35 tabular-nums">{row.wa_id}</div>
                    </Td>
                    <Td className="text-xs text-white/65 max-w-md">
                      <div className="line-clamp-3 leading-relaxed">{row.body}</div>
                      {row.error && (
                        <div className="text-[11px] text-[#F87171] mt-1 leading-relaxed">
                          {row.error}
                        </div>
                      )}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          row.status === "sent"
                            ? "green"
                            : row.status === "failed"
                              ? "red"
                              : row.status === "cancelled"
                                ? "grey"
                                : "amber"
                        }
                      >
                        {row.status}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      {row.status === "pending" && (
                        <ActionForm
                          action={cancelScheduledMessage}
                          submitLabel="Cancel"
                          compact
                        >
                          <input type="hidden" name="id" value={row.id} />
                        </ActionForm>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <EmptyState
              title="Nothing scheduled"
              description="Write a follow-up now and it will go out at the time you pick — useful when the right moment to send is one you will not be at a keyboard for."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">Schedule a message</h2>
          <p className="text-xs text-white/45 mb-5 leading-relaxed">
            It goes out as a plain WhatsApp message, so the contact has to have written to you
            within the last 24 hours of the send time — that is WhatsApp&apos;s rule, not ours.
            Outside that window it needs an approved template, which campaigns handle.
          </p>

          <ActionForm action={scheduleMessage} submitLabel="Schedule it" resetOnSuccess>
            <SelectField
              label="Contact"
              name="contact_id"
              options={[
                { value: "", label: "Type a number instead" },
                ...(contacts ?? []).map((contact) => ({
                  value: contact.id,
                  label: contact.name ? `${contact.name} · ${contact.wa_id}` : contact.wa_id,
                })),
              ]}
            />

            <Field
              label="Or a number"
              name="wa_id"
              placeholder="919876543210"
              hint="Country code first, no + and no spaces. Ignored when a contact is picked above."
            />

            {active.length > 1 && (
              <SelectField
                label="Send from"
                name="connection_id"
                options={active.map((connection) => ({
                  value: connection.id,
                  label: optionLabel(connection),
                }))}
              />
            )}
            {active.length > 1 && (
              <p className="text-[11px] text-white/35 -mt-2 leading-relaxed">
                Send from the number the customer already knows. One arriving from a number they
                have never written to reads as a stranger.
              </p>
            )}

            <Field
              label="Send at"
              name="send_at"
              type="datetime-local"
              required
              hint="At least a minute from now. To send straight away, use the inbox."
            />

            <TextareaField
              label="Message"
              name="body"
              required
              rows={5}
              placeholder="Just following up on the quote I sent — happy to go through it whenever suits."
            />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
