import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { createSupportTicket } from "../actions";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, Badge, EmptyState, statusTone } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";

const PRIORITY_TONE = { urgent: "red", high: "amber", normal: "grey", low: "grey" } as const;

export default async function SupportPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const all = tickets ?? [];

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="My support" subtitle="Raise an issue with the Neura Chat team and track it here." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Open" value={all.filter((t) => t.status === "open").length} />
        <StatCard label="In progress" value={all.filter((t) => t.status === "pending").length} />
        <StatCard label="Resolved" value={all.filter((t) => t.status === "resolved").length} />
        <StatCard label="Total" value={all.length} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="order-2 lg:order-1 space-y-3">
          {error ? (
            <EmptyState title="Couldn't load tickets" description={error.message} />
          ) : all.length > 0 ? (
            all.map((t) => (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{t.subject}</h3>
                  <div className="flex items-center gap-2">
                    <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                  </div>
                </div>
                <p className="text-sm text-white/55 whitespace-pre-wrap mb-3">{t.body}</p>
                <p className="text-[11px] text-white/35">Raised {formatDate(t.created_at)}</p>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No tickets"
              description="Nothing raised yet. If something isn't working, tell us on the right."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">Raise a ticket</h2>
          <p className="text-sm text-white/50 mb-5">
            The more specific you are, the faster we can help.
          </p>
          <ActionForm action={createSupportTicket} submitLabel="Raise ticket" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Subject" name="subject" required placeholder="Messages not sending" />
              <SelectField
                label="Priority"
                name="priority"
                defaultValue="normal"
                options={[
                  { value: "low", label: "Low — a question" },
                  { value: "normal", label: "Normal — something's off" },
                  { value: "high", label: "High — blocking my work" },
                  { value: "urgent", label: "Urgent — customers affected" },
                ]}
              />
              <TextareaField
                label="What's happening?"
                name="body"
                rows={5}
                required
                placeholder="Include what you tried, what you expected, and any error message you saw."
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
