import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { createAutomation, toggleAutomation } from "../actions";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { formatDateTime } from "@/types/admin";

const TRIGGER_LABELS: Record<string, string> = {
  keyword: "Keyword match",
  first_message: "First message",
  no_reply: "No reply",
};

// Which part of the stack answered. Worth naming plainly: "assistant" and
// "faq" mean very different things to someone tuning their bots.
const MATCH_LABELS: Record<string, string> = {
  flow_step: "Chatbot step",
  chatbot: "Chatbot",
  faq: "FAQ bot",
  automation: "Automation",
  assistant: "AI assistant",
  handoff: "Human handoff",
  none: "No match",
};

const OUTCOME_TONE: Record<string, "green" | "grey" | "red" | "purple"> = {
  replied: "green",
  skipped: "grey",
  handoff: "purple",
  failed: "red",
};

export default async function AutomationsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: flows, error }, { data: runs }] = await Promise.all([
    supabase
      .from("automation_flows")
      .select("id, name, trigger_type, trigger_config, actions_json, is_active, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("bot_runs")
      .select("id, inbound_text, matched_kind, matched_label, reply_text, outcome, error, duration_ms, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Automations"
        subtitle="Reply automatically when an inbound message matches a trigger."
      />

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState
              title="Couldn't load automations"
              description={`${error.message}. If this mentions a missing relation, the database migrations haven't been applied yet.`}
            />
          ) : flows && flows.length > 0 ? (
            <Table head={["Name", "Trigger", "Reply", "State", ""]}>
              {flows.map((f) => {
                const cfg = f.trigger_config as { keyword?: string };
                const actions = f.actions_json as Array<{ type: string; body?: string }>;
                return (
                  <tr key={f.id} className="hover:bg-white/3 transition-colors">
                    <Td className="font-medium">{f.name}</Td>
                    <Td>
                      <div className="text-xs text-white/60">
                        {TRIGGER_LABELS[f.trigger_type] ?? f.trigger_type}
                      </div>
                      {cfg?.keyword && <Badge tone="purple">{cfg.keyword}</Badge>}
                    </Td>
                    <Td className="text-xs text-white/50 max-w-xs truncate">
                      {actions?.[0]?.body ?? <span className="text-white/30">—</span>}
                    </Td>
                    <Td>
                      <Badge tone={f.is_active ? "green" : "grey"}>
                        {f.is_active ? "active" : "paused"}
                      </Badge>
                    </Td>
                    <Td>
                      <ActionForm
                        action={toggleAutomation}
                        submitLabel={f.is_active ? "Pause" : "Activate"}
                        compact
                      >
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="is_active" value={String(f.is_active)} />
                      </ActionForm>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <EmptyState
              title="No automations yet"
              description="Create a keyword automation to reply instantly when someone messages a specific word."
            />
          )}

          <p className="text-xs text-white/35 mt-4">
            Active automations are evaluated on every inbound message, after chatbots
            and the FAQ bot and before the AI assistant. Every evaluation — match or no
            match — is recorded below.
          </p>

          {/* The audit trail. This is the screen to open when someone asks
              why the bot said what it said, or why it stayed quiet. */}
          <Card className="mt-6">
            <h2 className="font-semibold mb-1">Bot activity</h2>
            <p className="text-sm text-white/50 mb-5">
              Every inbound message the bots evaluated, newest first.
            </p>

            {runs && runs.length > 0 ? (
              <Table head={["When", "Message", "Matched", "Reply", "Outcome"]}>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-white/5 last:border-0">
                    <Td>
                      <span className="text-xs text-white/40 whitespace-nowrap">
                        {formatDateTime(run.created_at)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs text-white/70 line-clamp-2">
                        {run.inbound_text || "—"}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs">{MATCH_LABELS[run.matched_kind] ?? run.matched_kind}</span>
                        {run.matched_label && (
                          <span className="text-[11px] text-white/35 line-clamp-1">
                            {run.matched_label}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-xs text-white/60 line-clamp-2">
                        {run.error ? (
                          <span className="text-red-400">{run.error}</span>
                        ) : (
                          run.reply_text || "—"
                        )}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Badge tone={OUTCOME_TONE[run.outcome] ?? "grey"}>{run.outcome}</Badge>
                        {run.duration_ms !== null && (
                          <span className="text-[10px] text-white/25">{run.duration_ms}ms</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="text-sm text-white/40">
                Nothing yet. Activity appears here as soon as a message arrives on your
                connected WhatsApp number.
              </p>
            )}
          </Card>
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">New automation</h2>
          <p className="text-sm text-white/50 mb-5">Start with a keyword auto-reply.</p>
          <ActionForm action={createAutomation} submitLabel="Create automation" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Name" name="name" required placeholder="Pricing auto-reply" />
              <SelectField
                label="Trigger"
                name="trigger_type"
                defaultValue="keyword"
                options={[
                  { value: "keyword", label: "Keyword match" },
                  { value: "first_message", label: "First message" },
                  { value: "no_reply", label: "No reply" },
                ]}
              />
              <Field label="Keyword" name="keyword" placeholder="price" />
              <TextareaField
                label="Reply message"
                name="reply"
                rows={3}
                placeholder="Thanks for reaching out! Our plans start at ₹999/month."
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
