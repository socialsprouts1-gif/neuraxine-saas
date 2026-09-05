import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { saveReminder, cancelReminder } from "../portal-actions";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, Badge, Table, Td, EmptyState, statusTone } from "@/components/ui/primitives";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RemindersPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: reminders, error }, { data: contacts }] = await Promise.all([
    supabase
      .from("reminders")
      .select("*, contacts(name, wa_id)")
      .eq("org_id", orgId)
      .order("remind_at")
      .limit(100),
    supabase.from("contacts").select("id, name, wa_id").eq("org_id", orgId).limit(200),
  ]);

  const all = reminders ?? [];
  // This is an async Server Component: it runs once per request on the
  // server, so reading the clock here is stable for the whole render. The
  // purity rule targets client components that can re-render at any time.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const pending = all.filter((r) => r.status === "pending");
  const overdue = pending.filter((r) => new Date(r.remind_at).getTime() < now);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Reminders"
        subtitle="Schedule a nudge so a promising conversation doesn't go cold."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Pending" value={pending.length} />
        <StatCard label="Overdue" value={overdue.length} hint={overdue.length ? "Needs attention" : undefined} />
        <StatCard label="Sent" value={all.filter((r) => r.status === "sent").length} />
        <StatCard label="Total" value={all.length} />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState
              title="Couldn't load reminders"
              description={`${error.message}. If this mentions a missing relation, the portal migration hasn't been applied yet.`}
            />
          ) : all.length > 0 ? (
            <Table head={["Reminder", "Contact", "When", "Status", ""]}>
              {all.map((r) => {
                const contact = r.contacts as { name: string | null; wa_id: string } | null;
                const isOverdue = r.status === "pending" && new Date(r.remind_at).getTime() < now;
                return (
                  <tr key={r.id} className="hover:bg-white/3 transition-colors align-top">
                    <Td>
                      <div className="font-medium">{r.title}</div>
                      {r.body && (
                        <div className="text-[11px] text-white/40 mt-0.5 max-w-xs line-clamp-2">
                          {r.body}
                        </div>
                      )}
                    </Td>
                    <Td className="text-white/70 whitespace-nowrap">
                      {contact ? contact.name || contact.wa_id : <span className="text-white/30">—</span>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className={isOverdue ? "text-[#FACC15]" : "text-white/60"}>
                        {formatWhen(r.remind_at)}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={isOverdue ? "amber" : statusTone(r.status)}>
                        {isOverdue ? "overdue" : r.status}
                      </Badge>
                    </Td>
                    <Td>
                      {r.status === "pending" && (
                        <ActionForm action={cancelReminder} submitLabel="Cancel" compact>
                          <input type="hidden" name="id" value={r.id} />
                        </ActionForm>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <EmptyState
              title="No reminders yet"
              description="Schedule one against a contact so you remember to follow up."
            />
          )}

          <p className="text-xs text-white/35 mt-4">
            Reminders are scheduled and tracked here. The job that fires them when they come due
            is not built yet, so a pending reminder will show as overdue rather than sending.
          </p>
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">New reminder</h2>
          <p className="text-sm text-white/50 mb-5">Attach it to a contact, or leave it general.</p>
          <ActionForm action={saveReminder} submitLabel="Schedule reminder" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Title" name="title" required placeholder="Follow up on quote" />
              <SelectField
                label="Contact"
                name="contact_id"
                options={[
                  { value: "", label: "No contact" },
                  ...(contacts ?? []).map((c) => ({
                    value: c.id,
                    label: c.name || c.wa_id,
                  })),
                ]}
              />
              <Field label="Remind me at" name="remind_at" type="datetime-local" required />
              <TextareaField
                label="Note"
                name="body"
                rows={3}
                placeholder="They asked for the enterprise pricing sheet."
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
