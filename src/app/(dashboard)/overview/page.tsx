import Link from "next/link";
import { ArrowRight, Send, Inbox as InboxIcon, Users, Bot } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { Card, Badge } from "@/components/ui/primitives";
import { formatDateTime } from "@/types/admin";

const DAYS = 14;

function startOfDay(offsetDays: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offsetDays);
  return date;
}

export default async function DashboardPage() {
  const { orgId, orgName } = await requireOrg();
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
                  className={`text-[11px] px-2 py-0.5 rounded-md ${
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
            <div className="flex items-center gap-4 text-[11px]">
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
                    <span className="text-[9px] text-white/25 truncate">
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
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${
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
