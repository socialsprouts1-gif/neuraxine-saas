import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { listActiveConnections, optionLabel } from "@/lib/connections";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui/primitives";
import { Plug, Radio, Clock } from "lucide-react";
import LocalTime from "@/components/ui/LocalTime";
import { describeOutcome } from "@/lib/events";
import { EVENT_STARTERS, knownEventNames } from "@/lib/event-starters";
import RuleList from "./RuleList";
import Starters from "./Starters";
import TestEvent from "./TestEvent";
import Hookup from "./Hookup";
import StaffLinks from "./StaffLinks";

// Connecting another system.
//
// A restaurant's orders live in the restaurant's own panel; a clinic's
// bookings live in the clinic's. This screen is how that software tells
// this one what happened, and what this one does about it.
//
// Laid out in the order somebody actually does it: get the key, send a
// test, see it land in the log, then write the rule. The log is the
// middle of the page rather than a tab, because "did my event arrive" is
// the question every integration gets stuck on and an answer behind a
// click is an answer nobody finds.

export const dynamic = "force-dynamic";

/**
 * The start of the last 24 hours.
 *
 * Outside the component because the clock is not a render input — and
 * the count it feeds comes from the database rather than from the 25
 * rows on screen, which would have under-reported every busy day.
 */
function dayAgo(): string {
  return new Date(Date.now() - 86_400_000).toISOString();
}

export default async function ConnectionsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const since = dayAgo();

  const [
    { data: rules },
    { data: events, error: eventsError },
    { data: templates },
    { data: campaigns },
    { data: keys },
    { count: todayCount },
    { data: staffLinks },
  ] = await Promise.all([
    supabase
      .from("event_automations")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("events")
      .select("id, name, wa_id, data, source, outcome, matched, error, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("message_templates")
      .select("id, name, language, status, body_text, header_format, header_text, components_json")
      .eq("org_id", orgId)
      .eq("status", "approved")
      .order("name"),
    supabase
      .from("drip_campaigns")
      .select("id, name, status")
      .eq("org_id", orgId)
      .order("name"),
    supabase
      .from("api_keys")
      .select("id, name, key_prefix, last_used_at, revoked_at")
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("created_at", since),
    supabase
      .from("staff_links")
      .select("id, name, token, uses, last_used_at")
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const numbers = (await listActiveConnections(supabase, orgId)).map((connection) => ({
    id: connection.id,
    label: optionLabel(connection),
  }));

  const ruleRows = rules ?? [];
  const live = ruleRows.filter((rule) => rule.is_active).length;
  const eventRows = events ?? [];
  const hasKey = (keys ?? []).length > 0;

  // The names already in use here, plus the ones the ready-made sets
  // know about — so the builder can suggest rather than demand recall.
  const suggestions = [
    ...new Set([...knownEventNames(), ...ruleRows.map((rule) => rule.event_name)]),
  ].sort();

  return (
    <div className="p-6 md:p-8 space-y-6">
      <PageHeader
        title="Connections"
        subtitle="Let your own system — a till, a booking panel, a CRM — tell this one what happened, and decide what it sends."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2.5">
            <Plug className="w-4 h-4 text-accent-ink" />
            <p className="text-xs text-white/45">API keys</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-1">{(keys ?? []).length}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-accent-ink" />
            <p className="text-xs text-white/45">Rules listening</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-1">
            {live}
            <span className="text-sm text-white/35 font-normal"> of {ruleRows.length}</span>
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-accent-ink" />
            <p className="text-xs text-white/45">Events today</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums mt-1">{todayCount ?? 0}</p>
        </Card>
      </div>

      {/* First, because it is the answer for almost everybody reading
          this page. The API box below is for the business that already
          has software of its own. */}
      <StaffLinks links={staffLinks ?? []} liveRules={live} />

      <Hookup hasKey={hasKey} />

      {/* --- the log ------------------------------------------------- */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold">What has arrived</h2>
            <p className="text-xs text-white/45 mt-0.5">
              Every event, whether or not a rule was listening. The last 25.
            </p>
          </div>
          <TestEvent suggestions={suggestions} />
        </div>

        {eventsError ? (
          <EmptyState
            title="Couldn't load the log"
            description={`${eventsError.message} — if this mentions a missing table, run supabase/updates/run-me-latest.sql.`}
          />
        ) : eventRows.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="Send a test event with the button above, or point your own system at the address in the box below. Anything that arrives shows here within seconds."
          />
        ) : (
          <div className="space-y-1.5">
            {eventRows.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 rounded-xl border border-white/8 bg-white/3"
              >
                <code className="text-[12px] text-white/85 font-mono">{row.name}</code>

                {row.source === "test" && (
                  <Badge tone="grey">test</Badge>
                )}

                <span className="text-[11px] text-white/45">{row.wa_id || "no number"}</span>

                <span
                  className={`text-[11px] ${
                    row.outcome === "matched"
                      ? "text-accent-ink"
                      : row.outcome === "failed"
                        ? "text-[#C47A74]"
                        : "text-white/35"
                  }`}
                >
                  {describeOutcome(row.outcome, row.matched)}
                </span>

                {row.error && (
                  <span className="text-[11px] text-[#C47A74]/85 basis-full">{row.error}</span>
                )}

                <span className="text-[11px] text-white/30 ml-auto whitespace-nowrap">
                  <LocalTime iso={row.created_at} />
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* --- the rules ---------------------------------------------- */}
      <RuleList
        rules={ruleRows}
        templates={(templates ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          language: row.language,
        }))}
        campaigns={(campaigns ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
        }))}
        numbers={numbers}
        suggestions={suggestions}
      />

      {ruleRows.length === 0 && <Starters starters={EVENT_STARTERS} />}
    </div>
  );
}
