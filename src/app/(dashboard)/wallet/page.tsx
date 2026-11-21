import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState, HeroHeader, StatCard, Table, Td } from "@/components/ui/primitives";
import Link from "next/link";
import { ArrowRight, Wallet, TrendingDown, MessageSquare, Coins } from "lucide-react";
import {
  CATEGORIES,
  LEDGER_LABELS,
  balanceState,
  costOf,
  formatMoney,
  formatRate,
  isCredit,
  messagesLeft,
  readRates,
  signedAmount,
  summarise,
  walletInUse,
  type LedgerKind,
  type LedgerRow,
} from "@/lib/wallet";
import TopupButton from "./TopupButton";

// The message wallet.
//
// The statement is the point of the screen. A balance on its own invites
// the question it cannot answer — where did it go? — and a customer who
// cannot answer that assumes the worst about the number in front of it.

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const { orgId, orgName, user, isPlatformAdmin } = await requireOrg();
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: org, error: orgError }, { data: setting }, { data: ledger }] = await Promise.all([
    supabase
      .from("organizations")
      .select("wallet_balance_micros, wallet_currency")
      .eq("id", orgId)
      .maybeSingle(),
    // The rates are the platform's, not the workspace's, so they are read
    // with the admin client — a tenant cannot see platform_settings.
    admin.from("platform_settings").select("value").eq("key", "wallet_rates").maybeSingle(),
    supabase
      .from("wallet_ledger")
      .select("kind, amount_micros, balance_after_micros, description, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  // 42703 is an undefined column, 42P01 an undefined table: the database
  // update that adds the wallet has not been run. Worth naming, because
  // otherwise the page shows a balance of zero and reads as a wallet that
  // is simply empty — which is a very different thing from one that does
  // not exist yet.
  const needsMigration = orgError?.code === "42703" || orgError?.code === "42P01";

  const currency = org?.wallet_currency || "INR";
  const balance = Number(org?.wallet_balance_micros ?? 0);
  const rates = readRates(setting?.value);

  const rows: LedgerRow[] = (ledger ?? []).map((row) => ({
    kind: row.kind as LedgerKind,
    amountMicros: row.amount_micros,
    balanceAfterMicros: row.balance_after_micros,
    description: row.description,
    createdAt: row.created_at,
  }));

  const total = summarise(rows);
  const state = balanceState(balance, rates);
  const left = messagesLeft(balance, rates);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <HeroHeader
        eyebrow="Billing"
        title="WhatsApp Wallet"
        subtitle="What you have added, and what every message has taken off it. Meta charges per conversation; this is that bill, shown as it is spent rather than at the end of the month."
        scene="wallet"
      />

      {needsMigration ? (
        <Card>
          <h2 className="font-semibold mb-2">The wallet needs the latest database update</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            The tables it keeps the balance and the statement in do not exist yet. Run{" "}
            <span className="text-white/85 font-mono text-[13px]">
              supabase/updates/run-me-latest.sql
            </span>{" "}
            in the Supabase SQL editor — the whole file, it is safe to run more than once — and
            this page will have something to show.
          </p>
        </Card>
      ) : state === "off" ? (
        <Card>
          <h2 className="font-semibold mb-2">The wallet is switched off</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            Nothing is being charged. Messages you send are billed by Meta straight to your own
            WhatsApp account, on its own schedule, so there is nothing to top up here.
          </p>

          {/* Only platform staff can switch it on, so only they are told
              how. Telling a customer to go and set prices they cannot
              reach is worse than telling them nothing. */}
          {isPlatformAdmin && (
            <div className="mt-4 pt-4 border-t border-white/8">
              <p className="text-sm text-white/60 leading-relaxed mb-3">
                To start charging for messages, set a price per category under{" "}
                <span className="text-white/85">Admin → Message pricing</span>.
                Until at least one of them is above zero, nobody sees a wallet at all — including
                you.
              </p>
              <Link href="/admin/pricing" className="btn-primary text-sm">
                Set message pricing
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Wallet}
              label="Balance"
              value={formatMoney(balance, currency)}
              hint={
                left === null
                  ? undefined
                  : `about ${left.toLocaleString("en-IN")} more messages`
              }
            />
            <StatCard icon={Coins} label="Added" value={formatMoney(total.added, currency)} />
            <StatCard
              icon={TrendingDown}
              label="Spent"
              value={formatMoney(total.spent, currency)}
            />
            <StatCard
              icon={MessageSquare}
              label="Messages charged"
              value={total.messages.toLocaleString("en-IN")}
            />
          </div>

          {/* Said plainly and early, because the alternative is finding out
              when a campaign to four thousand people stops at six hundred. */}
          {(state === "empty" || state === "negative" || state === "low") && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p
                  className={`text-sm leading-relaxed ${
                    state === "low" ? "text-[#FACC15]/85" : "text-[#F87171]"
                  }`}
                >
                  {state === "low"
                    ? `Your balance is down to ${formatMoney(balance, currency)}. Top it up before your next campaign.`
                    : rates.blockWhenEmpty
                      ? "Your wallet is empty, and sending is paused until it is topped up."
                      : "Your wallet is empty. Messages are still going out and the balance is running negative."}
                </p>
                <TopupButton
                  currency={currency}
                  brandName={orgName}
                  email={user?.email ?? ""}
                />
              </div>
            </Card>
          )}

          <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start">
            <Card>
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="font-semibold">Statement</h2>
                {state === "healthy" && (
                  <TopupButton
                    currency={currency}
                    brandName={orgName}
                    email={user?.email ?? ""}
                  />
                )}
              </div>

              {rows.length === 0 ? (
                <EmptyState
                  title="Nothing on the statement yet"
                  description="Every message you send appears here with what it cost, and every top-up with what it added."
                />
              ) : (
                <Table head={["When", "What", "Amount", "Balance"]}>
                  {rows.map((row, index) => (
                    <tr key={`${row.createdAt}-${index}`} className="border-t border-white/6">
                      <Td className="text-white/45 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Td>
                      <Td>
                        <span className="block text-[13px]">{row.description}</span>
                        <span className="block text-[11px] text-white/35">
                          {LEDGER_LABELS[row.kind]}
                        </span>
                      </Td>
                      <Td
                        className={`whitespace-nowrap tabular-nums ${
                          isCredit(row.kind) ? "text-accent-ink" : "text-white/70"
                        }`}
                      >
                        {signedAmount(row, currency)}
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums text-white/45">
                        {formatMoney(row.balanceAfterMicros, currency)}
                      </Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>

            <Card>
              <h2 className="font-semibold mb-1">What a message costs</h2>
              <p className="text-xs text-white/45 mb-4 leading-relaxed">
                Charged when the message is accepted by WhatsApp, per message, per recipient.
              </p>

              <div className="space-y-2.5">
                {CATEGORIES.map((category) => {
                  const cost = costOf(category.key, rates);
                  return (
                    <div key={category.key} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{category.label}</span>
                        <span className="block text-[11px] text-white/35 leading-snug">
                          {category.hint}
                        </span>
                      </span>
                      <span className="text-[13px] font-semibold tabular-nums shrink-0">
                        {cost > 0 ? formatRate(cost, currency) : "Free"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {walletInUse(rates) && (
                <p className="text-[11px] text-white/35 mt-4 pt-4 border-t border-white/8 leading-relaxed">
                  Replies you send inside the 24-hour window after a customer messages you are not
                  template messages and are not charged here.
                </p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
