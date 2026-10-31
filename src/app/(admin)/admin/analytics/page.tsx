import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader, Card, Badge, Tile, EmptyState } from "@/components/ui/primitives";
import AreaChart from "@/components/ui/Chart";
import {
  daily,
  funnel,
  percent,
  rank,
  sourceOf,
  totals,
  type SiteEvent,
} from "@/lib/analytics";
import { loadBusiness, loadSiteEvents, money, windowOf } from "@/lib/analytics-server";
import { formatMoney } from "@/types/admin";
import { Bot, Eye, MousePointerClick, Users } from "lucide-react";

// One screen for "is this working".
//
// It joins two halves that had never been in the same place: what happens
// before somebody signs up, which was not recorded at all, and what they
// do afterwards, which was spread across six admin screens that each
// answered a different question.
//
// The order is the order the questions get asked. How many people came.
// How many of them got as far as an account. Where they came from and what
// they pressed. Then what the ones who stayed are actually doing, and what
// that is worth.

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

function Bars({ rows, empty }: { rows: { label: string; count: number; share: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-white/35">{empty}</p>;

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-sm truncate">{row.label}</span>
            <span className="text-sm text-white/45 flex-shrink-0 tabular-nums">{row.count}</span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "color-mix(in oklab, var(--color-white) 10%, transparent)" }}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
              style={{ width: `${Math.max(2, row.share * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requirePlatformAdmin();

  const asked = Number((await searchParams).days);
  const days = RANGES.includes(asked) ? asked : 30;
  const window = windowOf(days);

  const [site, business] = await Promise.all([loadSiteEvents(window), loadBusiness(window)]);
  const events: SiteEvent[] = site.events;

  const seen = totals(events);
  const steps = funnel(events, business.created);
  const buckets = daily(events, days);

  const bounceRate = seen.sessions === 0 ? null : seen.bounced / seen.sessions;
  const signedUp = steps[steps.length - 1].count;

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Analytics"
        subtitle={`Everything that happened in the last ${days} days — before the sign-up and after it.`}
        action={
          <div className="flex gap-1.5">
            {RANGES.map((range) => (
              <Link
                key={range}
                href={`/admin/analytics?days=${range}`}
                className={
                  range === days
                    ? "px-3 py-2 rounded-xl text-xs font-semibold border border-accent/30 bg-accent/10 text-accent-ink"
                    : "px-3 py-2 rounded-xl text-xs font-semibold border border-white/10 text-white/55 hover:text-white transition-colors"
                }
              >
                {range}d
              </Link>
            ))}
          </div>
        }
      />

      {!site.available && (
        <Card className="mb-6 border-[#FACC15]/25">
          <h2 className="font-semibold mb-1">Visitor tracking is not switched on yet</h2>
          <p className="text-sm text-white/55 leading-relaxed">
            Run <code className="text-white/75">supabase/updates/run-me-latest.sql</code> in the
            Supabase SQL editor to create the <code className="text-white/75">site_events</code>{" "}
            table. Everything below the funnel still works — that half comes from your own data,
            not from tracking.
          </p>
        </Card>
      )}

      {/* --- who came --------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Tile
          icon={Users}
          label="Visitors"
          value={seen.visitors}
          hint={`${seen.sessions} visit${seen.sessions === 1 ? "" : "s"}`}
          tint="#00B86B"
          spark={buckets.map((bucket) => bucket.visitors)}
        />
        <Tile
          icon={Eye}
          label="Pages opened"
          value={seen.views}
          hint={bounceRate === null ? undefined : `${percent(bounceRate)} left after one page`}
          tint="#00A9CC"
          spark={buckets.map((bucket) => bucket.views)}
        />
        <Tile
          icon={MousePointerClick}
          label="Signed up"
          value={signedUp}
          hint={steps[0].count === 0 ? undefined : `${percent(steps[3].ofStart)} of visitors`}
          tint="#A855F7"
        />
        <Tile
          icon={Bot}
          label="Paying"
          value={business.paying}
          hint={`${business.trialing} on a trial`}
          tint="#E0A106"
        />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 items-start mb-6">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="font-semibold">Traffic</h2>
              <p className="text-xs text-white/40 mt-0.5">
                {seen.visitors} visitor{seen.visitors === 1 ? "" : "s"} over {days} days
              </p>
            </div>
            <div className="flex items-center gap-4 text-[12px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#00B86B" }} />{" "}
                Visitors
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#00A9CC" }} />{" "}
                Pages
              </span>
            </div>
          </div>
          <AreaChart
            labels={buckets.map((bucket) => `${bucket.day.getDate()}`)}
            series={[
              { label: "Visitors", color: "#00B86B", values: buckets.map((b) => b.visitors) },
              { label: "Pages", color: "#00A9CC", values: buckets.map((b) => b.views) },
            ]}
            unit="hits"
            empty={
              site.available
                ? "Nobody has visited yet — or the site has not been deployed since tracking was added."
                : "Run the migration and this fills in from the next visitor."
            }
          />
        </Card>

        {/* --- the funnel ----------------------------------------------- */}
        <Card>
          <h2 className="font-semibold mb-1">From visit to account</h2>
          <p className="text-xs text-white/40 mb-5">
            Counted in people, not clicks — one person reloading is one person
          </p>

          <div className="space-y-4">
            {steps.map((step, index) => (
              <div key={step.label}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-sm">{step.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{step.count}</span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "color-mix(in oklab, var(--color-white) 10%, transparent)" }}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
                    style={{ width: `${Math.max(1, (step.ofStart ?? 0) * 100)}%` }}
                  />
                </div>
                {index > 0 && (
                  <div className="text-[12px] text-white/35 mt-1">
                    {percent(step.ofPrevious)} of the step above
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="text-[12px] text-white/30 mt-5 leading-relaxed">
            The last step comes from the workspaces actually created, not from a tracking event —
            a closed tab or a blocker can lose the event, and a funnel ending below the number of
            customers you have is one nobody would trust again.
          </p>
        </Card>
      </div>

      {/* --- where from, what pressed ----------------------------------- */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <h2 className="font-semibold mb-1">Where they came from</h2>
          <p className="text-xs text-white/40 mb-5">Campaign tag if there is one, else the referrer</p>
          <Bars
            rows={rank(events, (row) => sourceOf(row), { only: "view" })}
            empty="Nothing recorded yet."
          />
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">What they pressed</h2>
          <p className="text-xs text-white/40 mb-5">Every button carrying a track label</p>
          <Bars
            rows={rank(events, (row) => row.label, { only: "click" })}
            empty="No clicks recorded yet."
          />
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Pages</h2>
          <p className="text-xs text-white/40 mb-5">Most opened, by people rather than by hits</p>
          <Bars rows={rank(events, (row) => row.path, { only: "view" })} empty="Nothing yet." />
        </Card>
      </div>

      {/* --- the business ----------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Tile
          icon={Users}
          label="Workspaces"
          value={business.workspaces.length}
          hint={`${business.created} new in ${days} days`}
          tint="#00B86B"
        />
        <Tile
          icon={MousePointerClick}
          label="Template messages"
          value={business.templatesSent}
          hint="Charged sends, all time"
          tint="#00A9CC"
        />
        <Tile
          icon={Eye}
          label="Spent on sending"
          value={money(business.walletSpentMicros)}
          hint={`${money(business.walletToppedUpMicros)} topped up`}
          tint="#A855F7"
        />
        <Tile
          icon={Bot}
          label={`Paid in ${days} days`}
          value={formatMoney(business.revenueCents, business.revenueCurrency)}
          hint={business.pastDue > 0 ? `${business.pastDue} overdue` : undefined}
          tint="#E0A106"
        />
      </div>

      {/* --- per workspace ---------------------------------------------- */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-semibold">Every workspace</h2>
          <Link href="/admin/organizations" className="text-xs text-accent-ink hover:underline">
            Manage them
          </Link>
        </div>
        <p className="text-sm text-white/50 mb-5">
          Busiest first. Messages are the last {days} days; everything else is current.
          {business.messagesCapped && " Message counts are capped at 50,000 rows for this window."}
        </p>

        {business.workspaces.length === 0 ? (
          <EmptyState title="No workspaces yet" description="They appear here as people sign up." />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-6">
            <table className="w-full text-sm min-w-[52rem]">
              <thead>
                <tr className="border-b border-white/8 text-left text-[12px] font-semibold uppercase tracking-widest text-white/40">
                  <th className="px-4 sm:px-6 py-3">Workspace</th>
                  <th className="px-3 py-3">Plan</th>
                  <th className="px-3 py-3 text-right">Numbers</th>
                  <th className="px-3 py-3 text-right">Bots</th>
                  <th className="px-3 py-3 text-right">Assistants</th>
                  <th className="px-3 py-3 text-right">Sent</th>
                  <th className="px-3 py-3 text-right">Received</th>
                  <th className="px-4 sm:px-6 py-3 text-right">Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {business.workspaces.map((row) => (
                  <tr key={row.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-4 sm:px-6 py-3">
                      <Link
                        href={`/admin/organizations/${row.id}`}
                        className="font-medium hover:text-accent-ink transition-colors"
                      >
                        {row.name}
                      </Link>
                      {row.suspended && (
                        <span className="ml-2">
                          <Badge tone="red">suspended</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge
                        tone={
                          row.status === "active"
                            ? "green"
                            : row.status === "trialing"
                              ? "blue"
                              : row.status === "past_due"
                                ? "red"
                                : "grey"
                        }
                      >
                        {row.planName ?? row.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-white/70">{row.numbers}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-white/70">{row.bots}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-white/70">
                      {row.assistants}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-white/70">{row.sent}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-white/70">
                      {row.received}
                    </td>
                    <td className="px-4 sm:px-6 py-3 text-right tabular-nums">
                      <span className="text-white/70">{money(row.spentMicros)}</span>
                      <span className="block text-[11.5px] text-white/30">
                        {money(row.balanceMicros)} left
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {site.capped && (
        <p className="text-[12px] text-white/30 mt-4 leading-relaxed">
          Reading the most recent 20,000 events for this window. Beyond that the visitor numbers
          above under-count, which is said here rather than hidden.
        </p>
      )}

      <p className="text-[12px] text-white/30 mt-4 leading-relaxed max-w-2xl">
        No IP address, user-agent string, name, email or anything typed into a field is recorded.
        A visitor is a random value their own browser generates and keeps; clearing site data
        makes them a new visitor, which is the behaviour rather than a limitation.
      </p>
    </div>
  );
}
