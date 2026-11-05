import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto";
import { requireFeature } from "@/lib/org";
import { instagramAllowance } from "@/lib/entitlement";
import { Card } from "@/components/ui/primitives";
import { InstagramGlyph } from "@/components/landing/BrandGlyphs";
import { instagramEnv, scopedIdFor } from "@/lib/instagram-api";
import { redirectUri, SCOPES } from "@/lib/instagram";
import { formatDate, formatDateTime } from "@/types/admin";
import { CheckCircle2, Mail, MousePointerClick, Send, UserPlus } from "lucide-react";
import Accounts, { type AccountRow } from "./Accounts";
import Automations from "./Automations";
import type { AutomationRow } from "./AutomationEditor";

// Instagram, as a screen somebody can use.
//
// The hard-won lesson of the first version: the setup values — callback
// URL, verify token, scopes, redirect URI — are needed once, by one
// person, on one day. Leaving them at the top of the page made every
// visit after that one feel like reading a manual. They are at the
// bottom now, folded away, and the page opens on the thing the page is
// for.

export const dynamic = "force-dynamic";

// Three separate subscriptions, and missing one fails quietly.
//
// messaging_postbacks is the one everybody misses: it is not part of
// `messages`, so without it a button tap is never delivered and a follow
// gate asks, gets tapped, and goes silent forever.
const WEBHOOK_FIELDS = [
  { name: "comments", why: "someone comments on a post" },
  { name: "messages", why: "someone sends a direct message" },
  { name: "messaging_postbacks", why: "someone taps a button — needed for the follow gate" },
];

const OUTCOMES: Record<string, { label: string; tone: string }> = {
  matching: { label: "working on it", tone: "text-white/40" },
  no_rule: { label: "no automation matched", tone: "text-white/40" },
  sent: { label: "answered", tone: "text-accent-ink" },
  sent_with_errors: { label: "partly sent", tone: "text-[#FACC15]" },
  failed: { label: "failed", tone: "text-[#F87171]" },
  // The diagnostic outcomes. They exist because a gate that goes quiet
  // used to leave nothing behind, and the only way to find out why was
  // to photograph a phone.
  not_following_yet: { label: "not following yet", tone: "text-[#FACC15]" },
  tap_unreadable: { label: "tap not understood", tone: "text-[#F87171]" },
  tap_no_automation: { label: "automation deleted", tone: "text-[#F87171]" },
  tap_switched_off: { label: "automation is off", tone: "text-[#FACC15]" },
  tap_not_stored: { label: "could not record the tap", tone: "text-[#F87171]" },
  nothing_to_do: { label: "nothing to act on", tone: "text-white/40" },
};

export default async function InstagramPage({
  searchParams,
}: {
  searchParams: Promise<{ failed?: string }>;
}) {
  const { failed } = await searchParams;
  const { orgId, isPlatformAdmin } = await requireFeature("instagram");
  const supabase = await createClient();

  const env = instagramEnv();
  const configured = !("error" in env);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://neurachat.in";
  const verifyTokenSet = Boolean(process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN);

  const { data: connections, error } = await supabase
    .from("instagram_connections")
    .select("id, username, account_name, profile_picture_url, ig_user_id, status, created_at, token_expires_at, last_error, ig_scoped_id, access_token_encrypted")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const needsMigration = error?.code === "42P01";
  const accounts = connections ?? [];
  const live = accounts.find((account) => account.status === "active") ?? null;

  // How many more, if any. A platform admin is never held to a plan:
  // locking the operator out of their own tool to enforce a price is
  // the sort of thing only discovered at an awkward moment.
  const allowance = await instagramAllowance(supabase, orgId, isPlatformAdmin);

  // Dates formatted here so the accounts list can stay a client
  // component without the date code following it into the bundle.
  const formattedDates = Object.fromEntries(
    accounts.map((account) => [
      account.id,
      {
        connected: formatDate(account.created_at),
        renews: account.token_expires_at ? formatDate(account.token_expires_at) : null,
      },
    ])
  );

  // Heal a connection made before the second id was stored.
  //
  // One call to Instagram, once, rather than asking somebody to
  // reconnect an account that looks connected — which is a thing nobody
  // would do unprompted, because nothing on the screen looks wrong.
  await backfillScopedIds(accounts);

  const [{ data: ruleRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from("instagram_comment_rules")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("instagram_comment_events")
      .select("id, from_username, comment_text, outcome, error, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const rules: AutomationRow[] = ((ruleRows ?? []) as AutomationRow[]).map((row) => ({
    ...row,
    keywords: row.keywords ?? [],
    buttons: Array.isArray(row.buttons) ? row.buttons : [],
  }));
  const events = eventRows ?? [];

  // Summed here rather than in the database. The rows are already on
  // the page, and a second round trip to total a handful of numbers is
  // latency bought for nothing.
  const total = (field: keyof AutomationRow) =>
    rules.reduce((sum, rule) => sum + (Number(rule[field]) || 0), 0);

  const stats = [
    { label: "Messages sent", value: total("sent_count"), icon: Send, tint: "#E4405F" },
    { label: "Button taps", value: total("button_click_count"), icon: MousePointerClick, tint: "#405DE6" },
    { label: "New followers", value: total("follower_gain_count"), icon: UserPlus, tint: "#833AB4" },
    { label: "Emails", value: total("email_count"), icon: Mail, tint: "#F77737" },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
      {/* --- who is connected -------------------------------------------- */}
      <div className="relative overflow-hidden rounded-3xl p-5 sm:p-7 mb-5 bg-gradient-to-br from-[#833AB4] via-[#E4405F] to-[#F77737]">
        <div className="absolute inset-0 bg-black/15" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#FFFFFF]/20 backdrop-blur grid place-items-center flex-shrink-0">
            <InstagramGlyph className="w-7 h-7 text-[#FFFFFF]" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-[#FFFFFF]">Instagram</h1>
            {live ? (
              <p className="text-[#FFFFFF]/85 text-sm mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Connected as @{live.username ?? live.account_name ?? "your account"}
              </p>
            ) : (
              <p className="text-[#FFFFFF]/85 text-sm mt-0.5">
                Answer comments and messages while you sleep.
              </p>
            )}
          </div>
          {!live && configured && allowance.ok && (
            <Link
              href="/api/instagram/connect"
              className="px-5 py-2.5 rounded-xl bg-[#FFFFFF] text-[#C13584] font-semibold text-sm hover:bg-[#FFFFFF]/90 transition-colors"
            >
              Connect Instagram
            </Link>
          )}
        </div>
      </div>

      {/* --- the connected accounts -------------------------------------- */}
      {accounts.length > 0 && (
        <Card className="mb-5">
          <Accounts
            accounts={accounts as AccountRow[]}
            limit={allowance.limit}
            canConnect={allowance.ok && configured}
            formatted={formattedDates}
          />
        </Card>
      )}

      {failed === "limit" && (
        <Card className="mb-5 border-[#FACC15]/35">
          <p className="text-sm text-white/70 leading-relaxed">
            Your plan covers{" "}
            {allowance.limit === 1
              ? "one Instagram account"
              : `${allowance.limit} Instagram accounts`}
            , and {allowance.used === 1 ? "one is" : `${allowance.used} are`} already connected.
            Disconnect one below, or{" "}
            <Link href="/billing" className="text-accent-ink underline underline-offset-2">
              move to a bigger plan
            </Link>
            .
          </p>
        </Card>
      )}

      {needsMigration && (
        <Card className="mb-5 border-[#FACC15]/35">
          <p className="text-sm text-white/70 leading-relaxed">
            One more step: run{" "}
            <code className="text-white">supabase/updates/run-me-latest.sql</code> in the Supabase
            SQL editor, then reload.
          </p>
        </Card>
      )}

      {/* --- what it has done -------------------------------------------- */}
      {rules.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-5">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl p-4 border border-white/8 bg-white/4 min-w-0"
            >
              <div
                className="w-8 h-8 rounded-xl grid place-items-center mb-2.5"
                style={{ background: `${stat.tint}22`, color: stat.tint }}
              >
                <stat.icon className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold tabular-nums leading-none">{stat.value}</div>
              <div className="text-[12px] text-white/40 mt-1.5">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* --- the automations ---------------------------------------------- */}
      <Card className="mb-5">
        <Automations rules={rules} accountId={live?.id ?? accounts[0]?.id ?? null} />
      </Card>

      {/* --- what actually happened --------------------------------------- */}
      {events.length > 0 && (
        <Card className="mb-5">
          <h2 className="text-lg font-semibold mb-4">Recent activity</h2>
          <div className="space-y-3">
            {events.map((event) => {
              const outcome = OUTCOMES[event.outcome] ?? {
                label: event.outcome,
                tone: "text-white/40",
              };
              return (
                <div key={event.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/6 grid place-items-center flex-shrink-0 text-[11px] font-semibold text-white/50">
                    {(event.from_username ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] truncate">
                      <span className="text-white/80">
                        {event.from_username ? `@${event.from_username}` : "Someone"}
                      </span>
                      {event.comment_text && (
                        <span className="text-white/40"> — {event.comment_text}</span>
                      )}
                    </div>
                    <div className="text-[11.5px] text-white/30 mt-0.5">
                      {formatDateTime(event.created_at)}
                    </div>
                    {event.error && (
                      <div className="text-[11.5px] text-[#F87171] mt-1 leading-relaxed">
                        {event.error}
                      </div>
                    )}
                  </div>
                  <span className={`text-[12px] flex-shrink-0 ${outcome.tone}`}>
                    {outcome.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* --- the setup values, out of the way ------------------------------ */}
      <details className="group rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
        <summary className="px-5 py-4 cursor-pointer text-sm font-medium text-white/55 hover:text-white transition-colors list-none flex items-center justify-between">
          <span>Setup details for Meta</span>
          <span className="text-white/30 text-xs group-open:hidden">show</span>
          <span className="text-white/30 text-xs hidden group-open:inline">hide</span>
        </summary>

        <div className="px-5 pb-5 space-y-5 border-t border-white/6 pt-5">
          <p className="text-[13px] text-white/45 leading-relaxed">
            You only need these once, in your Meta app, under{" "}
            <span className="text-white/70">Instagram → API setup with Instagram business
            login</span>.
          </p>

          <Value label="Webhook callback URL" value={`${appUrl.replace(/\/+$/, "")}/api/webhooks/instagram`} />
          <Value label="OAuth redirect URI" value={redirectUri(appUrl)} />

          <div>
            <div className="text-[12px] font-medium text-white/55 mb-1.5">Verify token</div>
            <p className="text-[12.5px] text-white/40 leading-relaxed">
              {verifyTokenSet
                ? "Already set on this deployment. Paste the same value into Meta — they have to match exactly."
                : "Set INSTAGRAM_WEBHOOK_VERIFY_TOKEN in Vercel, redeploy, then paste the same value into Meta."}
            </p>
          </div>

          <div>
            <div className="text-[12px] font-medium text-white/55 mb-2">
              Subscribe to all three
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WEBHOOK_FIELDS.map((field) => (
                <code
                  key={field.name}
                  className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-[11.5px] text-white/60"
                  title={field.why}
                >
                  {field.name}
                </code>
              ))}
            </div>
            <ul className="mt-2.5 space-y-1">
              {WEBHOOK_FIELDS.map((field) => (
                <li key={field.name} className="text-[12px] text-white/35 leading-relaxed">
                  <span className="text-white/55">{field.name}</span> — {field.why}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[12px] font-medium text-white/55 mb-2">Permissions to request</div>
            <div className="flex flex-wrap gap-1.5">
              {SCOPES.map((scope) => (
                <code
                  key={scope}
                  className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-[11.5px] text-white/60"
                >
                  {scope}
                </code>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[12px] font-medium text-white/55 mb-1.5">
              In the Instagram app, once
            </div>
            <p className="text-[12.5px] text-white/40 leading-relaxed">
              Instagram app → Settings and privacy → Messages and story replies → Connected tools →{" "}
              <span className="text-white/60">Allow access to messages</span>. Comments arrive
              without it; direct messages and button taps do not. On older versions it is under
              Settings → Privacy → Messages → Connected Tools.
            </p>
          </div>

          <p className="text-[12px] text-white/30 leading-relaxed">
            Meta only delivers webhooks when the app mode is Live. In Development mode the
            handshake succeeds and nothing ever arrives, which looks exactly like a broken endpoint.
          </p>

          {!configured && (
            <p className="text-[12.5px] text-[#FACC15] leading-relaxed">
              {"error" in env ? env.error : ""}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] font-medium text-white/55 mb-1.5">{label}</div>
      <code className="block px-3 py-2.5 rounded-xl bg-[var(--surface-2)] border border-white/8 text-[12px] text-accent-ink break-all">
        {value}
      </code>
    </div>
  );
}


/**
 * Fills in the app-scoped id for connections that predate it.
 *
 * Failures are ignored on purpose: this is a repair running on the way
 * to rendering a page, and a page that will not load because a repair
 * did not work is worse than the thing being repaired.
 */
async function backfillScopedIds(
  accounts: { id: string; status: string; ig_scoped_id: string | null; access_token_encrypted: string }[]
): Promise<void> {
  const missing = accounts.filter(
    (account) => account.status === "active" && !account.ig_scoped_id
  );
  if (missing.length === 0) return;

  const admin = createAdminClient();
  await Promise.all(
    missing.map(async (account) => {
      try {
        const scoped = await scopedIdFor(decryptToken(account.access_token_encrypted));
        if (!scoped) return;
        await admin
          .from("instagram_connections")
          .update({ ig_scoped_id: scoped })
          .eq("id", account.id);
      } catch (error) {
        console.error("Could not backfill an Instagram scoped id", error);
      }
    })
  );
}
