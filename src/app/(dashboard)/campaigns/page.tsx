import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { listActiveConnections, optionLabel } from "@/lib/connections";
import {
  PageHeader,
  StatCard,
  Badge,
  Table,
  Td,
  EmptyState,
  statusTone,
} from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";
import { NewCampaignButton, CampaignRowActions, SendQueuedButton } from "./CampaignToolbar";
import type { TemplateOption } from "./CampaignBuilder";

export default async function CampaignsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const numbers = (await listActiveConnections(supabase, orgId)).map((connection) => ({
    id: connection.id,
    label: optionLabel(connection),
  }));

  const [{ data: campaigns, error }, { data: templates }, { data: contacts }, { data: groups }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select(
          "id, name, status, scheduled_at, created_at, completed_at, is_drip, audience, last_error, message_templates(name)"
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("message_templates")
        .select("id, name, language, category, body_text, header_text, footer_text")
        .eq("org_id", orgId)
        .eq("status", "approved")
        .order("name"),
      // Tags live on the contact rows, so the list of them is derived here
      // rather than kept as a second table that can fall out of step.
      supabase.from("contacts").select("tags").eq("org_id", orgId).limit(2000),
      supabase.from("contact_groups").select("id, name").eq("org_id", orgId).order("name"),
    ]);

  const rows = campaigns ?? [];

  const { data: progress } = rows.length
    ? await supabase
        .from("campaign_progress")
        .select("campaign_id, total, sent, failed, pending")
        .in(
          "campaign_id",
          rows.map((row) => row.id)
        )
    : { data: [] };

  const byCampaign = new Map((progress ?? []).map((entry) => [entry.campaign_id, entry]));

  const tags = [
    ...new Set((contacts ?? []).flatMap((contact) => contact.tags ?? []).filter(Boolean)),
  ].sort();

  const options: TemplateOption[] = (templates ?? []) as TemplateOption[];

  const live = rows.filter((row) => row.status === "running" || row.status === "scheduled").length;
  const totalSent = (progress ?? []).reduce((sum, entry) => sum + Number(entry.sent), 0);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Campaigns"
        subtitle="Send an approved template to a list of people, once or as a drip."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SendQueuedButton />
            <NewCampaignButton
              templates={options}
              tags={tags}
              groups={groups ?? []}
              numbers={numbers}
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Campaigns" value={rows.length} />
        <StatCard label="Live" value={live} hint="Running or scheduled" />
        <StatCard label="Messages sent" value={totalSent.toLocaleString()} />
        <StatCard label="Approved templates" value={options.length} />
      </div>

      {error ? (
        <EmptyState
          title="Couldn't load campaigns"
          description={`${error.message}. If this mentions a missing relation, run supabase/setup.sql again.`}
        />
      ) : rows.length > 0 ? (
        <Table head={["Campaign", "Template", "Audience", "Progress", "Status", "Created", ""]}>
          {rows.map((campaign) => {
            const template = campaign.message_templates as { name: string } | null;
            const counts = byCampaign.get(campaign.id);
            const total = Number(counts?.total ?? 0);
            const sent = Number(counts?.sent ?? 0);
            const failed = Number(counts?.failed ?? 0);

            return (
              <tr key={campaign.id} className="hover:bg-white/3 transition-colors align-top">
                <Td>
                  <span className="font-medium">{campaign.name ?? "Untitled"}</span>
                  {campaign.is_drip && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-white/35">
                      drip
                    </span>
                  )}
                  {campaign.last_error && (
                    <div className="text-[11px] text-[#F87171] mt-1 max-w-xs">
                      {campaign.last_error}
                    </div>
                  )}
                </Td>
                <Td className="text-xs">
                  {template ? (
                    <code className="text-accent2-ink">{template.name}</code>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </Td>
                <Td className="text-xs text-white/55">{describeAudience(campaign.audience)}</Td>
                <Td>
                  <ProgressBar sent={sent} failed={failed} total={total} />
                </Td>
                <Td>
                  <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
                </Td>
                <Td className="text-white/40 text-xs whitespace-nowrap">
                  {formatDate(campaign.scheduled_at ?? campaign.created_at)}
                </Td>
                <Td className="text-right">
                  <CampaignRowActions id={campaign.id} status={campaign.status} />
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <EmptyState
          title="No campaigns yet"
          description="Pick an approved template, choose who gets it, and send now or on a schedule."
        />
      )}

      <p className="text-xs text-white/35 mt-4 max-w-2xl leading-relaxed">
        Recipients are queued rather than sent inline, so a large run survives a closed tab.
        Press <span className="text-white/60">Send queued now</span> to send a batch
        immediately, or point a scheduler at{" "}
        <code className="text-white/50">/api/cron/dispatch-campaigns</code> to drain the queue
        on its own — see the README.
      </p>
    </div>
  );
}

/** A three-part bar: delivered, failed, still queued. */
function ProgressBar({ sent, failed, total }: { sent: number; failed: number; total: number }) {
  if (total === 0) return <span className="text-white/30 text-xs">—</span>;

  const percent = (value: number) => `${(value / total) * 100}%`;

  return (
    <div className="min-w-[7rem]">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/8">
        <div className="bg-accent" style={{ width: percent(sent) }} />
        <div className="bg-[#F87171]" style={{ width: percent(failed) }} />
      </div>
      <div className="text-[11px] text-white/45 mt-1.5 tabular-nums">
        {sent.toLocaleString()} / {total.toLocaleString()}
        {failed > 0 && <span className="text-[#F87171]"> · {failed} failed</span>}
      </div>
    </div>
  );
}

function describeAudience(audience: unknown): string {
  const value = audience as { kind?: string; value?: string; waIds?: string[] } | null;
  switch (value?.kind) {
    case "tag":
      return `Tag: ${value.value}`;
    case "group":
      return "Contact group";
    case "numbers":
      return `${value.waIds?.length ?? 0} imported numbers`;
    case "all":
      return "All contacts";
    default:
      return "—";
  }
}
