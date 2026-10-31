import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { HeroHeader, Card, Badge, EmptyState, StatCard, type Tone } from "@/components/ui/primitives";
import { InstagramGlyph } from "@/components/landing/BrandGlyphs";
import { instagramEnv } from "@/lib/instagram-api";
import { redirectUri, SCOPES } from "@/lib/instagram";
import { formatDate, formatDateTime } from "@/types/admin";
import { CheckCircle2 } from "lucide-react";
import Automations from "./Automations";
import type { AutomationRow } from "./AutomationEditor";
import { Send, MousePointerClick, UserPlus, Mail } from "lucide-react";

// Instagram: the account, and what it is allowed to do.
//
// Deliberately shows the setup values rather than hiding them behind a
// "contact support". The person who has to paste the redirect URI into
// the Meta dashboard is the same person looking at this screen, and
// making them ask for it is a day of waiting for a string.

export const dynamic = "force-dynamic";

// The webhook writes these; the screen has to say them in English.
const OUTCOME_LABEL: Record<string, string> = {
  matching: "in progress",
  no_rule: "no rule matched",
  sent: "answered",
  sent_with_errors: "partly sent",
  failed: "failed",
};

const OUTCOME_TONE: Record<string, Tone> = {
  matching: "grey",
  no_rule: "grey",
  sent: "green",
  sent_with_errors: "amber",
  failed: "red",
};

export default async function InstagramPage() {
  const { orgId } = await requireFeature("instagram");
  const supabase = await createClient();

  const env = instagramEnv();
  const configured = !("error" in env);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://neurachat.in";
  const verifyTokenSet = Boolean(process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN);

  const { data: connections, error } = await supabase
    .from("instagram_connections")
    .select("id, username, account_name, status, token_expires_at, created_at, last_error")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const needsMigration = error?.code === "42P01";
  const accounts = connections ?? [];

  // Rules and the log are fetched together: a rule with a tally of zero
  // next to a log full of "no rule matched" is the whole diagnosis, and
  // splitting them across two screens hides it.
  const [{ data: ruleRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from("instagram_comment_rules")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("instagram_comment_events")
      .select("id, from_username, comment_text, outcome, error, kind, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const rules: AutomationRow[] = ((ruleRows ?? []) as AutomationRow[]).map((row) => ({
    ...row,
    keywords: row.keywords ?? [],
    buttons: Array.isArray(row.buttons) ? row.buttons : [],
  }));
  const events = eventRows ?? [];

  // Summed here rather than in the database. The rows are already on
  // the page, and a second round trip to total twelve numbers is
  // latency bought for nothing.
  const total = (field: keyof AutomationRow) =>
    rules.reduce((sum, rule) => sum + (Number(rule[field]) || 0), 0);

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        eyebrow="Channel"
        title="Instagram"
        subtitle="Answer direct messages with the same bots and assistant that answer WhatsApp, and turn comments into conversations."
        stats={[
          { label: accounts.length === 1 ? "Account" : "Accounts", value: accounts.length },
          { label: "Connected", value: accounts.filter((a) => a.status === "active").length },
        ]}
      />

      {needsMigration && (
        <Card className="mb-6 border-[#FACC15]/25">
          <h2 className="font-semibold mb-1">The tables are not there yet</h2>
          <p className="text-sm text-white/55 leading-relaxed">
            Run <code className="text-white/75">supabase/updates/run-me-latest.sql</code> in the
            Supabase SQL editor, then reload this page.
          </p>
        </Card>
      )}

      {/* --- what to put in Meta ---------------------------------------- */}
      {!configured && (
        <Card className="mb-6 border-[#FACC15]/25">
          <div className="flex items-start gap-3">
            <InstagramGlyph className="w-5 h-5 text-[#FACC15] flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="font-semibold mb-1">Set this up in your Meta app first</h2>
              <p className="text-sm text-white/55 leading-relaxed mb-4">
                {"error" in env ? env.error : ""} Everything below comes from{" "}
                <span className="text-white/75">App Dashboard → Instagram → API setup with
                Instagram business login</span>.
              </p>

              <ol className="space-y-3 text-sm text-white/70 leading-relaxed list-decimal pl-5 mb-4">
                <li>
                  Switch the Instagram account you want to automate to a{" "}
                  <span className="text-white/90">Professional</span> account. A personal account
                  has no API access at all.
                </li>
                <li>
                  In your Meta app, open <span className="text-white/90">Instagram</span> and
                  choose <span className="text-white/90">API setup with Instagram business
                  login</span>. Not the Facebook Login option — that one needs a Facebook Page.
                </li>
                <li>
                  Paste this as an <span className="text-white/90">OAuth redirect URI</span>. Meta
                  compares the whole string, so one stray slash is a refused sign-in:
                  <code className="block mt-1.5 px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-white/10 text-[12.5px] text-accent-ink break-all">
                    {redirectUri(appUrl)}
                  </code>
                </li>
                <li>
                  Copy the <span className="text-white/90">Instagram App ID</span> and{" "}
                  <span className="text-white/90">Instagram App Secret</span> from that same page —
                  they are not the same as your Meta app id — and set them in Vercel as{" "}
                  <code className="text-white/75">INSTAGRAM_APP_ID</code> and{" "}
                  <code className="text-white/75">INSTAGRAM_APP_SECRET</code>, then redeploy.
                </li>
                <li>
                  Submit these three permissions for App Review:
                  <span className="block mt-1.5 flex flex-wrap gap-1.5">
                    {SCOPES.map((scope) => (
                      <code
                        key={scope}
                        className="px-2 py-0.5 rounded-lg border border-white/10 bg-white/4 text-[11.5px] text-white/60"
                      >
                        {scope}
                      </code>
                    ))}
                  </span>
                </li>
              </ol>

              <p className="text-[12px] text-white/35 leading-relaxed">
                Until review passes, the connection works for Instagram accounts added as testers
                on the app — which is enough to build and demonstrate it.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* --- the webhook ------------------------------------------------ */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Webhook</h2>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          Under <span className="text-white/75">Instagram → API setup → Configure webhooks</span>.
          One URL covers every customer — Instagram subscribes the app, not each account.
        </p>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-white/70 mb-1.5">Callback URL</div>
            <code className="block px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-white/10 text-[12.5px] text-accent-ink break-all">
              {`${appUrl.replace(/\/+$/, "")}/api/webhooks/instagram`}
            </code>
          </div>

          <div>
            <div className="text-xs font-medium text-white/70 mb-1.5">Verify token</div>
            <p className="text-[12.5px] text-white/50 leading-relaxed">
              {verifyTokenSet ? (
                <>
                  Already set on this deployment as{" "}
                  <code className="text-white/70">INSTAGRAM_WEBHOOK_VERIFY_TOKEN</code>. Paste the
                  same value into Meta — they have to match exactly or the handshake is refused.
                </>
              ) : (
                <>
                  Make one up — any random string will do. Set it in Vercel as{" "}
                  <code className="text-white/70">INSTAGRAM_WEBHOOK_VERIFY_TOKEN</code>, redeploy,
                  then paste the same value into Meta. It is only there to prove the subscription
                  request came from you.
                </>
              )}
            </p>
          </div>

          <div>
            <div className="text-xs font-medium text-white/70 mb-1.5">Subscribe to these fields</div>
            <div className="flex flex-wrap gap-1.5">
              {["comments", "messages"].map((field) => (
                <code
                  key={field}
                  className="px-2 py-0.5 rounded-lg border border-white/10 bg-white/4 text-[11.5px] text-white/60"
                >
                  {field}
                </code>
              ))}
            </div>
            <p className="text-[12px] text-white/35 mt-2 leading-relaxed">
              Meta only delivers webhooks when the app mode is <span className="text-white/60">Live</span>.
              In Development mode the handshake succeeds and nothing ever arrives, which looks
              exactly like a broken endpoint.
            </p>
          </div>
        </div>
      </Card>

      {/* --- the accounts ----------------------------------------------- */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h2 className="font-semibold">Connected accounts</h2>
          {configured && (
            <Link href="/api/instagram/connect" className="btn-primary text-sm">
              <InstagramGlyph className="w-4 h-4" />
              Connect Instagram
            </Link>
          )}
        </div>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          A connected account answers through the same chatbots, FAQ and AI assistant as your
          WhatsApp numbers — nothing is configured twice.
        </p>

        {accounts.length === 0 ? (
          <EmptyState
            title="No Instagram account connected"
            description={
              configured
                ? "Connect one and its direct messages start arriving in your inbox."
                : "Finish the Meta setup above, then the connect button appears here."
            }
          />
        ) : (
          <div className="divide-y divide-white/6">
            {accounts.map((account) => (
              <div key={account.id} className="flex flex-wrap items-center gap-3 py-3.5 first:pt-0">
                <InstagramGlyph className="w-5 h-5 text-white/35 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {account.username ? `@${account.username}` : (account.account_name ?? "Instagram account")}
                  </div>
                  <div className="text-[12px] text-white/40">
                    Connected {formatDate(account.created_at)}
                    {account.token_expires_at
                      ? ` · access renews by ${formatDate(account.token_expires_at)}`
                      : ""}
                  </div>
                  {account.last_error && (
                    <div className="text-[12px] text-[#F87171] mt-1">{account.last_error}</div>
                  )}
                </div>
                <Badge tone={account.status === "active" ? "green" : "red"}>
                  {account.status === "active" ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> connected
                    </span>
                  ) : (
                    account.status
                  )}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* --- what the automations have done ------------------------------ */}
      {rules.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6">
          <StatCard label="DMs sent" value={total("sent_count")} icon={Send} />
          <StatCard
            label="Button clicks"
            value={total("button_click_count")}
            icon={MousePointerClick}
          />
          <StatCard
            label="Followers gained"
            value={total("follower_gain_count")}
            icon={UserPlus}
            hint="Through a follow gate"
          />
          <StatCard label="Emails collected" value={total("email_count")} icon={Mail} />
        </div>
      )}

      {/* --- the automations --------------------------------------------- */}
      <Card className="mt-6">
        <Automations rules={rules} accountId={accounts[0]?.id ?? null} appUrl={appUrl} />
      </Card>

      {/* --- what actually happened ------------------------------------- */}
      {events.length > 0 && (
        <Card className="mt-6">
          <h2 className="font-semibold mb-1">Recent comments</h2>
          <p className="text-sm text-white/50 mb-5 leading-relaxed">
            Every comment the webhook delivered, and what came of it. A run of{" "}
            <span className="text-white/70">no rule matched</span> means the words in the rule and
            the words people actually use are not the same.
          </p>

          <div className="divide-y divide-white/6">
            {events.map((event) => (
              <div key={event.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">
                    <span className="text-white/75">
                      {event.from_username ? `@${event.from_username}` : "Someone"}
                    </span>
                    {event.comment_text ? (
                      <span className="text-white/45"> — {event.comment_text}</span>
                    ) : null}
                  </div>
                  <div className="text-[12px] text-white/35 mt-0.5">
                    {formatDateTime(event.created_at)}
                  </div>
                  {event.error && (
                    <div className="text-[12px] text-[#F87171] mt-1 leading-relaxed">
                      {event.error}
                    </div>
                  )}
                </div>
                <Badge tone={OUTCOME_TONE[event.outcome] ?? "grey"}>
                  {OUTCOME_LABEL[event.outcome] ?? event.outcome}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
