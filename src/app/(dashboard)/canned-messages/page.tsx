import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { saveCannedMessage, deleteCannedMessage } from "../manage-actions";
import ActionForm, { Field, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui/primitives";

export default async function CannedMessagesPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { data: replies, error } = await supabase
    .from("canned_messages")
    .select("*")
    .eq("org_id", orgId)
    .order("use_count", { ascending: false });

  const all = replies ?? [];

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Canned messages"
        subtitle="Saved replies your team can drop into a conversation instead of retyping them."
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Saved replies" value={all.length} />
        <StatCard label="Times used" value={all.reduce((n, r) => n + r.use_count, 0)} />
        <StatCard label="Most used" value={all[0]?.shortcut ? `/${all[0].shortcut}` : "—"} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="order-2 lg:order-1 space-y-3">
          {error ? (
            <EmptyState
              title="Couldn't load replies"
              description={`${error.message}. If this mentions a missing relation, run supabase/setup.sql again.`}
            />
          ) : all.length > 0 ? (
            all.map((reply) => (
              <Card key={reply.id}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <code className="text-sm text-accent-ink font-semibold">/{reply.shortcut}</code>
                      <span className="text-sm text-white/70">{reply.title}</span>
                    </div>
                    <p className="text-sm text-white/50 whitespace-pre-wrap leading-relaxed">
                      {reply.body}
                    </p>
                  </div>
                  <ActionForm action={deleteCannedMessage} submitLabel="Delete" compact>
                    <input type="hidden" name="id" value={reply.id} />
                  </ActionForm>
                </div>
                <div className="text-[11px] text-white/30">Used {reply.use_count} times</div>
              </Card>
            ))
          ) : (
            <EmptyState
              title="No saved replies yet"
              description="Add the answers your team types most often — pricing, hours, delivery times."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">New saved reply</h2>
          <p className="text-sm text-white/50 mb-5">
            The shortcut is what an agent types after a slash to insert it.
          </p>
          <ActionForm action={saveCannedMessage} submitLabel="Save reply" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Shortcut" name="shortcut" required placeholder="hours" hint="Typed as /hours" />
              <Field label="Title" name="title" required placeholder="Opening hours" />
              <TextareaField
                label="Message"
                name="body"
                required
                rows={5}
                placeholder="We're open Monday to Saturday, 10am to 8pm."
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
