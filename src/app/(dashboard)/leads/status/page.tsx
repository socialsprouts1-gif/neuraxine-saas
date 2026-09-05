import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { HeroHeader, EmptyState, StatCard } from "@/components/ui/primitives";
import { LEAD_STAGES, type LeadStage } from "@/types/portal";

const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  demo: "Demo",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

const STAGE_HELP: Record<LeadStage, string> = {
  new: "Messaged for the first time. Nobody has answered yet.",
  contacted: "Someone — a person or a bot — has replied.",
  qualified: "They have a real need and it is worth pursuing.",
  demo: "A demo or a call is booked or done.",
  proposal: "Pricing has been sent and you are waiting on them.",
  won: "They bought.",
  lost: "They said no, went quiet, or were never a fit.",
};

// Where the pipeline actually is, and where it leaks. The stages themselves
// are fixed by the database check constraint, so this reports on them rather
// than pretending they can be renamed here.
export default async function LeadStatusPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, wa_id, name, lead_stage, lead_score, deal_value, updated_at")
    .eq("org_id", orgId)
    .limit(2000);

  const all = contacts ?? [];
  const total = all.length;

  const byStage = LEAD_STAGES.map((stage) => {
    const rows = all.filter((contact) => (contact.lead_stage ?? "new") === stage);
    return {
      stage,
      count: rows.length,
      value: rows.reduce((sum, contact) => sum + (contact.deal_value ?? 0), 0),
      scored: rows.filter((contact) => contact.lead_score !== null).length,
    };
  });

  const won = byStage.find((entry) => entry.stage === "won")?.count ?? 0;
  const lost = byStage.find((entry) => entry.stage === "lost")?.count ?? 0;
  const closed = won + lost;
  // Of the leads that reached a decision, how many said yes. Counting open
  // leads as losses would make every healthy pipeline look like a failure.
  const winRate = closed > 0 ? Math.round((won / closed) * 100) : null;
  const openValue = byStage
    .filter((entry) => entry.stage !== "won" && entry.stage !== "lost")
    .reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Lead status"
        subtitle="Where every lead sits, and where the pipeline is leaking."
      />

      {error ? (
        <EmptyState
          title="Couldn't load leads"
          description={`${error.message}. If this mentions a missing column, run the latest migration in supabase/setup.sql.`}
        />
      ) : total === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Every contact who messages your WhatsApp number appears here, starting at New."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total leads" value={total} />
            <StatCard label="Won" value={won} hint={closed > 0 ? `of ${closed} decided` : undefined} />
            <StatCard
              label="Win rate"
              value={winRate === null ? "—" : `${winRate}%`}
              hint="Of leads that reached a decision"
            />
            <StatCard
              label="Open pipeline"
              value={openValue > 0 ? `₹${openValue.toLocaleString("en-IN")}` : "—"}
              hint="Deal value not yet won or lost"
            />
          </div>

          <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Pipeline by stage</h2>
              <Link href="/leads/board" className="text-xs text-accent-ink hover:underline">
                Open the board
              </Link>
            </div>

            <div className="divide-y divide-white/5">
              {byStage.map((entry) => {
                const share = total > 0 ? (entry.count / total) * 100 : 0;
                return (
                  <div key={entry.stage} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-sm font-medium">{STAGE_LABEL[entry.stage]}</span>
                      <span className="text-xs text-white/35">{STAGE_HELP[entry.stage]}</span>
                      <span className="ml-auto text-sm font-semibold tabular-nums">
                        {entry.count}
                      </span>
                      {entry.value > 0 && (
                        <span className="text-xs text-accent-ink tabular-nums w-28 text-right">
                          ₹{entry.value.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 rounded-full bg-white/6 mt-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          entry.stage === "won"
                            ? "bg-accent"
                            : entry.stage === "lost"
                              ? "bg-white/20"
                              : "bg-accent2"
                        }`}
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-white/35 mt-4 leading-relaxed max-w-2xl">
            Stages are fixed so the board, the inbox and this page always agree on what they
            mean. A lead moves stage from its card on the board, or from the customer panel in
            the inbox — both write the same field.
          </p>
        </>
      )}
    </div>
  );
}
