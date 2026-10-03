import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Bot,
  CalendarCheck,
  Inbox as InboxIcon,
  Lock,
  Send,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { featureDef } from "@/lib/features";
import { Card, Badge } from "@/components/ui/primitives";
import { formatDateTime } from "@/types/admin";
import { upcoming, whenDue, answerRate, topAnswers } from "@/lib/dashboard-insights";

const DAYS = 14;

/** How each kind of upcoming thing is drawn. */
const UPCOMING_LOOK = {
  reminder: { icon: Bell, accent: "#FACC15", label: "Reminder" },
  scheduled: { icon: Send, accent: "#00FF87", label: "Scheduled message" },
  appointment: { icon: CalendarCheck, accent: "#00D4FF", label: "Appointment" },
} as const;

function startOfDay(offsetDays: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offsetDays);
  return date;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ off?: string }>;
}) {
  const { orgId, orgName } = await requireOrg();

  // Where requireFeature() sends somebody who opened a page their workspace
  // does not have. Saying which one beats a silent bounce to the dashboard,
  // which reads as the link being broken.
  const { off } = await searchParams;
  const blocked = off ? featureDef(off) : undefined;
  const supabase = await createClient();

  const windowStart = startOfDay(DAYS - 1).toISOString();
  const priorStart = startOfDay(DAYS * 2 - 1).toISOString();

  const [
    { data: recentMessages },
    { data: priorMessages },
    { count: contactCount },
    { data: conversations },
    { data: bots },
    { data: runs },
    { data: connections },
    { data: assistants },
    { data: reminderRows },
    { data: scheduledRows },
    { data: meetingRows },
    { data: runWindow },
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("direction, created_at")
      .eq("org_id", orgId)
      .gte("created_at", windowStart)
      .limit(5000),
    supabase
      .from("messages")
      .select("direction")
      .eq("org_id", orgId)
      .gte("created_at", priorStart)
      .lt("created_at", windowStart)
      .limit(5000),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("conversations").select("status, bot_enabled").eq("org_id", orgId).limit(2000),
    supabase.from("chatbot_flows").select("id, name, is_active").eq("org_id", orgId),
    supabase
      .from("bot_runs")
      .select("id, outcome, matched_kind, matched_label, inbound_text, error, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("waba_connections").select("id, status").eq("org_id", orgId),
    supabase.from("ai_assistants").select("id").eq("org_id", orgId).eq("is_active", true),
    // What is about to happen. Three tables, one list on screen — the
    // question somebody opening this page has is "what is coming", not
    // which feature happens to own it.
    supabase
      .from("reminders")
      .select("id, title, remind_at")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .gte("remind_at", new Date().toISOString())
      .order("remind_at")
      .limit(8),
    supabase
      .from("scheduled_messages")
      .select("id, body, send_at, wa_id")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .gte("send_at", new Date().toISOString())
      .order("send_at")
      .limit(8),
    supabase
      .from("meetings")
      .select("id, title, starts_at, location")
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(8),
    // A fortnight of runs, for the answer rate and the answers doing the
    // work. Separate from the six shown in the activity list, which are
    // the newest rather than a sample worth dividing.
    supabase
      .from("bot_runs")
      .select("outcome, matched_kind, matched_label")
      .eq("org_id", orgId)
      .gte("created_at", windowStart)
      .limit(2000),
  ]);

  const messages = recentMessages ?? [];
  const sent = messages.filter((m) => m.direction === "outbound").length;
  const received = messages.filter((m) => m.direction === "inbound").length;
  const priorSent = (priorMessages ?? []).filter((m) => m.direction === "outbound").length;
  const priorReceived = (priorMessages ?? []).filter((m) => m.direction === "inbound").length;

  // A percentage against a zero baseline is meaningless, so it is shown only
  // once there is something to compare against.
  const delta = (now: number, before: number): string | undefined =>
    before === 0 ? undefined : `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)}%`;

  const convos = conversations ?? [];
  const open = convos.filter((c) => c.status === "open").length;
  const needsHuman = convos.filter((c) => c.status === "pending" || !c.bot_enabled).length;

  // Merged and sorted here rather than on screen, so the three kinds
  // cannot disagree about what "next" means.
  const soon = upcoming([
    ...(reminderRows ?? []).map((row) => ({
      id: `reminder-${row.id}`,
      kind: "reminder" as const,
      title: row.title,
      at: row.remind_at,
    })),
    ...(scheduledRows ?? []).map((row) => ({
      id: `scheduled-${row.id}`,
      kind: "scheduled" as const,
      title: row.body.slice(0, 70),
      at: row.send_at,
      who: row.wa_id,
    })),
    ...(meetingRows ?? []).map((row) => ({
      id: `meeting-${row.id}`,
      kind: "appointment" as const,
      title: row.title ?? "Appointment",
      at: row.starts_at,
      who: row.location,
    })),
  ]);

  const answers = answerRate(runWindow ?? []);
  const best = topAnswers(runWindow ?? []);

  const activeBots = (bots ?? []).filter((b) => b.is_active).length;
  const connected = (connections ?? []).some((c) => c.status === "active");

  // Daily buckets for the activity chart. Built here rather than in SQL so
  // days with no messages still appear — a gap in a bar chart reads as an
  // outage, an empty column reads as a quiet day.
  const buckets = Array.from({ length: DAYS }, (_, i) => {
    const day = startOfDay(DAYS - 1 - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const inRange = messages.filter((m) => {
      const at = new Date(m.created_at);
      return at >= day && at < next;
    });
    return {
      day,
      sent: inRange.filter((m) => m.direction === "outbound").length,
      received: inRange.filter((m) => m.direction === "inbound").length,
    };
  });
  const peak = Math.max(1, ...buckets.map((b) => b.sent + b.received));

  const setup = [
    { done: connected, label: "Connect a WhatsApp number", href: "/integrations" },
    { done: (bots ?? []).length > 0, label: "Build a chatbot flow", href: "/chatbot" },
    { done: activeBots > 0, label: "Activate a bot", href: "/chatbot" },
    { done: (assistants ?? []).length > 0, label: "Add an AI assistant", href: "/ai-assistant" },
    { done: (contactCount ?? 0) > 0, label: "Receive your first message", href: "/inbox" },
  ];
  const remaining = setup.filter((s) => !s.done);

  return (
    <div className="p-6 md:p-8">
      {blocked && (
        <div className="flex items-start gap-2.5 mb-5 rounded-xl border border-white/12 bg-white/4 px-4 py-3">
          <Lock className="w-4 h-4 text-white/40 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-white/60 leading-relaxed">
            <span className="text-white/80 font-medium">{blocked.label}</span> is not part of your
            plan, so that page is off for this workspace. Ask us about it and we can switch it on.
          </p>
        </div>
      )}

      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/10 via-[var(--surface-1)] to-accent2/8 p-6 md:p-8 mb-6">
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Welcome back, {orgName}</h1>
            <p className="text-sm text-white/55 max-w-xl leading-relaxed">
              {connected ? (
                <>
                  Your WhatsApp number is connected. {activeBots} bot
                  {activeBots === 1 ? "" : "s"} active, {open} open conversation
                  {open === 1 ? "" : "s"}, {needsHuman} waiting on a human.
                </>
              ) : (
                <>
                  No WhatsApp number connected yet — that is the one thing standing between this
                  and a working inbox.
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Link href="/inbox" className="btn-secondary text-sm">
              Open inbox
            </Link>
            <Link href={connected ? "/chatbot" : "/integrations"} className="btn-primary text-sm">
              {connected ? "Build a bot" : "Connect WhatsApp"}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Send, label: "Messages sent", value: sent, delta: delta(sent, priorSent), accent: "#00FF87" },
          { icon: InboxIcon, label: "Messages received", value: received, delta: delta(received, priorReceived), accent: "#00D4FF" },
          { icon: Users, label: "Contacts", value: contactCount ?? 0, accent: "#A855F7" },
          { icon: Bot, label: "Active bots", value: activeBots, accent: "#FACC15" },
        ].map(({ icon: Icon, label, value, delta: change, accent }) => (
          <Card key={label}>
            <div className="flex items-start justify-between mb-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: `${accent}14`, border: `1px solid ${accent}2A` }}
              >
                <Icon className="w-4 h-4" style={{ color: accent }} />
              </div>
              {change && (
                <span
                  className={`text-[12px] px-2 py-0.5 rounded-md ${
                    change.startsWith("-") ? "text-red-400 bg-red-400/10" : "text-accent-ink bg-accent/10"
                  }`}
                >
                  {change}
                </span>
              )}
            </div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-white/45 mt-0.5">{label}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 items-start mb-6">
        {/* Activity chart */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="font-semibold">Message activity</h2>
              <p className="text-xs text-white/40 mt-0.5">Sent and received over the last {DAYS} days</p>
            </div>
            <div className="flex items-center gap-4 text-[12px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent" /> Sent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent2" /> Received
              </span>
            </div>
          </div>

          {sent + received === 0 ? (
            <div className="h-44 grid place-items-center text-sm text-white/35">
              No messages yet. The chart fills in once your number starts receiving.
            </div>
          ) : (
            <div className="flex items-end gap-1.5 h-44">
              {buckets.map((bucket, index) => {
                const total = bucket.sent + bucket.received;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                    <div
                      className="w-full flex flex-col justify-end rounded-t-md overflow-hidden"
                      style={{ height: `${Math.max(2, (total / peak) * 100)}%` }}
                      title={`${bucket.sent} sent · ${bucket.received} received`}
                    >
                      <div className="bg-accent2/70" style={{ flexGrow: bucket.received || 0 }} />
                      <div className="bg-accent/70" style={{ flexGrow: bucket.sent || 0 }} />
                    </div>
                    <span className="text-[11px] text-white/25 truncate">
                      {bucket.day.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Setup checklist — more useful than a placeholder while empty */}
        <Card>
          <h2 className="font-semibold mb-1">
            {remaining.length === 0 ? "You're set up" : "Finish setting up"}
          </h2>
          <p className="text-xs text-white/40 mb-5">
            {remaining.length === 0
              ? "Everything's connected. From here it's building flows."
              : `${setup.length - remaining.length} of ${setup.length} done.`}
          </p>
          <div className="space-y-2">
            {setup.map((step) => (
              <Link
                key={step.label}
                href={step.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/8 hover:border-white/20 hover:bg-white/3 transition-colors"
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[11px] flex-shrink-0 ${
                    step.done ? "bg-accent text-[#050508]" : "border border-white/20"
                  }`}
                >
                  {step.done ? "✓" : ""}
                </span>
                <span className={`text-sm ${step.done ? "text-white/40 line-through" : "text-white/75"}`}>
                  {step.label}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Conversation split */}
        <Card>
          <h2 className="font-semibold mb-1">Conversations</h2>
          <p className="text-xs text-white/40 mb-5">Where every thread currently sits</p>
          {convos.length === 0 ? (
            <p className="text-sm text-white/35">No conversations yet.</p>
          ) : (
            <div className="space-y-3">
              {(["open", "pending", "resolved", "closed"] as const).map((status) => {
                const count = convos.filter((c) => c.status === status).length;
                const percent = Math.round((count / convos.length) * 100);
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-white/65 capitalize">{status}</span>
                      <span className="text-white/40">
                        {count} · {percent}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Coming up.
            ------------------------------------------------------------
            Reminders, scheduled messages and appointments in one list.
            The dashboard showed none of the three, which meant the one
            question somebody opens it with — what is about to happen —
            was the one it could not answer. */}
        <Card>
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-semibold">Coming up</h2>
            <Link href="/reminders" className="text-sm text-accent-ink hover:underline">
              Reminders
            </Link>
          </div>
          <p className="text-sm text-white/40 mb-5">
            Reminders, scheduled messages and appointments, soonest first
          </p>

          {soon.length === 0 ? (
            <p className="text-sm text-white/40 leading-relaxed">
              Nothing scheduled. Reminders and scheduled messages both show up here once you
              set one.
            </p>
          ) : (
            <div className="space-y-3">
              {soon.map((entry) => {
                const look = UPCOMING_LOOK[entry.kind];
                const Icon = look.icon;
                return (
                  <div key={entry.id} className="flex items-start gap-3">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${look.accent}14`, border: `1px solid ${look.accent}2A` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: look.accent }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{entry.title}</div>
                      <div className="text-[12px] text-white/35 mt-0.5">
                        {look.label}
                        {entry.who ? ` · ${entry.who}` : ""}
                      </div>
                    </div>
                    <span className="text-[12px] text-white/45 flex-shrink-0 mt-0.5">
                      {whenDue(entry.at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-6 items-start mb-6">
        {/* How much the automation is carrying.
            ------------------------------------------------------------
            One number worth acting on: a low rate is a list of answers
            that do not exist yet, and failures are counted apart because
            a miss and a break need different fixes. */}
        <Card>
          <h2 className="font-semibold mb-1">Answered automatically</h2>
          <p className="text-sm text-white/40 mb-5">Of everything the automation looked at, {DAYS} days</p>

          {answers.rate === null ? (
            <p className="text-sm text-white/40 leading-relaxed">
              No inbound messages yet, so there is nothing to measure. This fills in as soon as
              customers start writing.
            </p>
          ) : (
            <>
              <div className="text-3xl font-bold">{Math.round(answers.rate * 100)}%</div>
              <div
                className="mt-4 h-2 rounded-full overflow-hidden"
                style={{ background: "color-mix(in oklab, var(--color-white) 10%, transparent)" }}
                role="img"
                aria-label={`${answers.answered} of ${answers.total} answered`}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${answers.rate * 100}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-3 mt-5">
                {[
                  { label: "Answered", value: answers.answered, tint: "var(--accent)" },
                  { label: "Nothing matched", value: answers.unanswered, tint: "rgba(255,255,255,.45)" },
                  { label: "Failed", value: answers.failed, tint: "#F87171" },
                ].map((cell) => (
                  <div key={cell.label}>
                    <div className="text-lg font-bold" style={{ color: cell.tint }}>
                      {cell.value}
                    </div>
                    <div className="text-[12px] text-white/35 leading-tight mt-0.5">
                      {cell.label}
                    </div>
                  </div>
                ))}
              </div>

              {answers.unanswered > 0 && (
                <p className="text-[12px] text-white/35 mt-5 leading-relaxed">
                  Every &ldquo;nothing matched&rdquo; is a question with no answer written yet.{" "}
                  <Link href="/faq-bot" className="text-accent-ink hover:underline">
                    Add one to the FAQ bot
                  </Link>
                  .
                </p>
              )}
            </>
          )}
        </Card>

        {/* Which answers are doing the work */}
        <Card>
          <h2 className="font-semibold mb-1">Answers doing the work</h2>
          <p className="text-sm text-white/40 mb-5">
            Most used over {DAYS} days — the busiest one is the one worth making better
          </p>

          {best.length === 0 ? (
            <p className="text-sm text-white/40 leading-relaxed">
              Nothing has answered yet. Once a bot or an FAQ replies, the ones carrying the most
              traffic show up here.
            </p>
          ) : (
            <div className="space-y-3.5">
              {best.map((entry) => (
                <div key={`${entry.kind}:${entry.label}`}>
                  <div className="flex items-baseline justify-between gap-3 mb-1.5">
                    <span className="text-sm truncate">{entry.label}</span>
                    <span className="text-sm text-white/45 flex-shrink-0 tabular-nums">
                      {entry.count}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "color-mix(in oklab, var(--color-white) 10%, transparent)" }}
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(entry.count / best[0].count) * 100}%` }}
                    />
                  </div>
                  <div className="text-[12px] text-white/30 mt-1">{entry.kind}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 items-start mb-6">
        {/* Recent bot activity */}
        <Card>
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="font-semibold">Recent bot activity</h2>
            <Link href="/automations" className="text-xs text-accent-ink hover:underline">
              View all
            </Link>
          </div>
          <p className="text-xs text-white/40 mb-5">What the automation decided, most recent first</p>

          {(runs ?? []).length === 0 ? (
            <p className="text-sm text-white/35">
              Nothing yet. Activity appears as soon as a message arrives on your number.
            </p>
          ) : (
            <div className="space-y-2.5">
              {(runs ?? []).map((run) => (
                <div key={run.id} className="flex items-start gap-3 text-xs">
                  <Badge
                    tone={
                      run.outcome === "failed"
                        ? "red"
                        : run.outcome === "replied"
                          ? "green"
                          : run.outcome === "handoff"
                            ? "purple"
                            : "grey"
                    }
                  >
                    {run.outcome}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-white/70 truncate">{run.inbound_text || "—"}</div>
                    <div className="text-white/35 mt-0.5 truncate">
                      {run.error ?? run.matched_label ?? run.matched_kind} ·{" "}
                      {formatDateTime(run.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
