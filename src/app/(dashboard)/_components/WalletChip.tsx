import Link from "next/link";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { balanceState, formatMoney, readRates } from "@/lib/wallet";

/**
 * The balance, in the bar above every page.
 *
 * Here rather than only on the wallet screen because the number matters
 * at the moment somebody is about to send four thousand messages, and
 * that moment is never spent looking at the wallet. A balance you have to
 * go and check is one you find out about from a campaign that stopped.
 *
 * Renders nothing at all when the wallet is off, which is the default —
 * a workspace that is not charged for messages should not be shown a
 * balance of zero and left wondering what it means.
 */
interface ChipData {
  balance: number;
  currency: string;
  state: ReturnType<typeof balanceState>;
}

/**
 * The balance and what it means, or null when there is nothing to show.
 *
 * Separated from the markup because the lint rule is right: JSX built
 * inside a try/catch is not actually covered by it — React renders later,
 * and the catch has gone by then. So the fallible part is the part that
 * loads, and the markup sits outside it.
 */
async function load(orgId: string): Promise<ChipData | null> {
  try {
    const admin = createAdminClient();

    const [{ data: setting }, { data: org }] = await Promise.all([
      admin.from("platform_settings").select("value").eq("key", "wallet_rates").maybeSingle(),
      (await createClient())
        .from("organizations")
        .select("wallet_balance_micros, wallet_currency")
        .eq("id", orgId)
        .maybeSingle(),
    ]);

    const rates = readRates(setting?.value);
    const balance = Number(org?.wallet_balance_micros ?? 0);
    const state = balanceState(balance, rates);

    if (state === "off") return null;

    return { balance, currency: org?.wallet_currency ?? "INR", state };
  } catch {
    // The wallet needs a database update that may not have been run. A bar
    // that fails to render takes every page with it, so this shows nothing
    // rather than breaking the whole app.
    return null;
  }
}

export default async function WalletChip({ orgId }: { orgId: string }) {
  const data = await load(orgId);
  if (!data) return null;

  const tone =
    data.state === "healthy"
      ? "border-white/12 text-white/70 hover:text-white hover:border-white/25"
      : data.state === "low"
        ? "border-[#FACC15]/35 text-[#FACC15] hover:border-[#FACC15]/60"
        : "border-[#F87171]/35 text-[#F87171] hover:border-[#F87171]/60";

  return (
    <Link
      href="/wallet"
      title={
        data.state === "healthy"
          ? "Message wallet"
          : "Your message wallet is running out — top it up before your next campaign."
      }
      className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[13px] font-semibold tabular-nums transition-colors ${tone}`}
    >
      <Wallet className="w-3.5 h-3.5" />
      {formatMoney(data.balance, data.currency)}
    </Link>
  );
}
