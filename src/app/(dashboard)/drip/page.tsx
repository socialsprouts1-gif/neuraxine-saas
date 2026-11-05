import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { listActiveConnections, optionLabel } from "@/lib/connections";
import {
  PageHeader,
  StatCard,
  Badge,
  Card,
  EmptyState,
  statusTone,
} from "@/components/ui/primitives";
import { Droplets, Users, Send, CheckCircle2 } from "lucide-react";
import { resolveTemplateShape } from "@/lib/template-unpack";
import { variableCount } from "@/lib/template-variables";
import { describeWait, type DripSettings, type DripStep } from "@/lib/drip";
import {
  NewDripButton,
  EditDripButton,
  DripStatusButton,
  DeleteDripButton,
  EnrolButton,
} from "./DripToolbar";
import type { TemplateChoice } from "./DripBuilder";

// Drip campaigns.
//
// Its own screen rather than a tab on Campaigns, because it is a different
// object: a campaign has an audience and a send time, a drip has neither.
// People join it one at a time and each of them is at a different point in
// it, so what this page has to show is not "how far along is the send" but
// "how many people are in it and where are they".

export const dynamic = "force-dynamic";

export default async function DripPage() {
  const { orgId } = await requireFeature("drip");
  const supabase = await createClient();

  const numbers = (await listActiveConnections(supabase, orgId)).map((connection) => ({
    id: connection.id,
    label: optionLabel(connection),
  }));

  const [{ data: campaigns }, { data: templates }, { data: steps }, { data: enrolments }] =
    await Promise.all([
      supabase
        .from("drip_campaigns")
        .select(
          "id, name, description, status, trigger_type, trigger_keywords, exit_on_keyword, exit_keywords, exit_on_reply, skip_missed_steps, time_zone, connection_id, created_at"
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("message_templates")
        .select("id, name, language, status, body_text, header_format, header_text, components_json")
        .eq("org_id", orgId)
        .eq("status", "approved")
        .order("name"),
      supabase
        .from("drip_steps")
        .select("campaign_id, step_index, template_id, variables, wait_kind, wait_minutes, send_at_minutes, send_at_days")
        .eq("org_id", orgId)
        .order("step_index"),
      supabase
        .from("drip_enrollments")
        .select("campaign_id, status")
        .eq("org_id", orgId)
        .limit(5000),
    ]);

  const templateChoices: TemplateChoice[] = (templates ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    language: row.language,
    status: row.status,
    // Counted from what Meta holds, so a sequence cannot be built against a
    // template whose variables nobody filled in — the refusal that would
    // otherwise arrive once per person.
    variables: variableCount(resolveTemplateShape(row).bodyText),
  }));

  const templateName = new Map(templateChoices.map((row) => [row.id, row.name]));

  const stepsByCampaign = new Map<string, DripStep[]>();
  for (const step of steps ?? []) {
    const list = stepsByCampaign.get(step.campaign_id) ?? [];
    list.push({
      stepIndex: step.step_index,
      templateId: step.template_id,
      variables: step.variables ?? [],
      waitKind: step.wait_kind,
      waitMinutes: step.wait_minutes,
      sendAtMinutes: step.send_at_minutes,
      sendAtDays: step.send_at_days,
    });
    stepsByCampaign.set(step.campaign_id, list);
  }

  const counts = new Map<string, { active: number; completed: number; exited: number }>();
  for (const row of enrolments ?? []) {
    const tally = counts.get(row.campaign_id) ?? { active: 0, completed: 0, exited: 0 };
    if (row.status === "active") tally.active += 1;
    else if (row.status === "completed") tally.completed += 1;
    else tally.exited += 1;
    counts.set(row.campaign_id, tally);
  }

  const live = (campaigns ?? []).filter((row) => row.status === "active").length;
  const totalActive = [...counts.values()].reduce((sum, tally) => sum + tally.active, 0);
  const totalDone = [...counts.values()].reduce((sum, tally) => sum + tally.completed, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drip Campaigns"
        subtitle="Follow-up sequences people join one at a time and walk through on their own clock."
        action={<NewDripButton templates={templateChoices} numbers={numbers} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Droplets} label="Sequences" value={String((campaigns ?? []).length)} />
        <StatCard icon={Send} label="Running" value={String(live)} />
        <StatCard icon={Users} label="People in a sequence" value={String(totalActive)} />
        <StatCard icon={CheckCircle2} label="Finished" value={String(totalDone)} />
      </div>

      {templateChoices.length === 0 && (
        <Card>
          <p className="text-sm text-[#FACC15]/85 leading-relaxed">
            No approved templates yet. Every step of a sequence sends one — these reach people
            outside the 24-hour window, where WhatsApp refuses free text — so there is nothing to
            build a sequence from until Meta has approved at least one.
          </p>
        </Card>
      )}

      {(campaigns ?? []).length === 0 ? (
        <EmptyState
          title="No sequences yet"
          description="A drip is a series of follow-ups. Somebody joins — by messaging a keyword, by you adding them, or through the API — and the messages go out one at a time from there, on their clock rather than yours."
        />
      ) : (
        <div className="space-y-4">
          {(campaigns ?? []).map((campaign) => {
            const sequence = stepsByCampaign.get(campaign.id) ?? [];
            const tally = counts.get(campaign.id) ?? { active: 0, completed: 0, exited: 0 };
            const settings: DripSettings = {
              trigger: campaign.trigger_type,
              triggerKeywords: campaign.trigger_keywords ?? [],
              exitOnKeyword: campaign.exit_on_keyword,
              exitKeywords: campaign.exit_keywords ?? [],
              exitOnReply: campaign.exit_on_reply,
              skipMissedSteps: campaign.skip_missed_steps,
              timeZone: campaign.time_zone,
            };

            return (
              <Card key={campaign.id}>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-semibold">{campaign.name}</h3>
                      <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
                      <span className="text-[11px] text-white/40">
                        joins by {campaign.trigger_type}
                      </span>
                    </div>
                    {campaign.description && (
                      <p className="text-xs text-white/45 mt-1 leading-relaxed max-w-2xl">
                        {campaign.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <EnrolButton id={campaign.id} />
                    <EditDripButton
                      draft={{
                        id: campaign.id,
                        name: campaign.name,
                        description: campaign.description ?? "",
                        connectionId: campaign.connection_id ?? "",
                        settings,
                        steps: sequence,
                      }}
                      templates={templateChoices}
                      numbers={numbers}
                    />
                    <DripStatusButton id={campaign.id} status={campaign.status} />
                    <DeleteDripButton id={campaign.id} name={campaign.name} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-[12px] text-white/50 mb-3">
                  <span>
                    <span className="text-white/80 font-semibold">{tally.active}</span> in it now
                  </span>
                  <span>
                    <span className="text-white/80 font-semibold">{tally.completed}</span> finished
                  </span>
                  <span>
                    <span className="text-white/80 font-semibold">{tally.exited}</span> left
                  </span>
                  {settings.trigger === "keyword" && settings.triggerKeywords.length > 0 && (
                    <span>
                      joins on{" "}
                      <span className="text-white/75">{settings.triggerKeywords.join(", ")}</span>
                    </span>
                  )}
                </div>

                {/* The sequence itself, read left to right. Somebody
                    deciding whether to switch this on needs to see what it
                    will actually send, not just that it has four steps. */}
                <div className="flex flex-wrap items-center gap-2">
                  {sequence.length === 0 ? (
                    <span className="text-xs text-white/35">No steps yet.</span>
                  ) : (
                    sequence.map((step, index) => (
                      <span key={step.stepIndex} className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[12px]">
                          <span className="w-4 h-4 rounded-full bg-accent/15 text-accent-ink text-[10px] font-bold flex items-center justify-center">
                            {step.stepIndex}
                          </span>
                          {step.templateId
                            ? (templateName.get(step.templateId) ?? "template removed")
                            : "no template"}
                        </span>
                        {index < sequence.length - 1 && (
                          <span className="text-[11px] text-white/30">{describeWait(step)}</span>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
