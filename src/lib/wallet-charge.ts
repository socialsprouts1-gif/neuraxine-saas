import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { costOf, readRates, walletInUse, type WalletRates } from "@/lib/wallet";

// Taking the price of a message off a workspace's balance.
//
// One function, called from one place — recordOutboundTemplate, which
// every template send already goes through. Charging from each of the four
// senders instead would be four chances to charge twice, four chances to
// charge nothing, and no single place to read to find out which.
//
// Nothing in here is allowed to throw or to delay a send. The message is
// already with the customer by the time this runs; a billing failure must
// never turn a delivered message into a reported error, and must never be
// retried in a way that sends it again.

type Client = SupabaseClient<Database>;

const SETTING = "wallet_rates";

/**
 * The rates, cached for a minute.
 *
 * This is on the path of every message a campaign sends, and a query per
 * message for a row that changes about twice a year is a query per message
 * too many. A minute is short enough that changing a price takes effect
 * while somebody is still looking at the screen they changed it on.
 */
let cached: { rates: WalletRates; at: number } | null = null;
const TTL_MS = 60_000;

export function forgetCachedRates(): void {
  cached = null;
}

async function loadRates(supabase: Client): Promise<WalletRates> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rates;

  const { data } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", SETTING)
    .maybeSingle();

  const rates = readRates(data?.value);
  cached = { rates, at: Date.now() };
  return rates;
}

export interface ChargeInput {
  orgId: string;
  /** marketing | utility | authentication | service. */
  category: string;
  /**
   * What makes a repeat harmless.
   *
   * The WhatsApp message id, which is unique per message and which a
   * retried batch carries unchanged — so the unique index on the ledger
   * refuses the second charge rather than taking it.
   */
  reference: string | null;
  description: string;
}

export interface ChargeResult {
  charged: boolean;
  cost: number;
  /** The balance afterwards, when the move went through. */
  balance?: number;
  reason?: string;
}

/**
 * Charges one message to a workspace's wallet.
 *
 * Returns rather than throws, and says what it did. The caller logs it and
 * carries on either way — see the note at the top about why a billing
 * failure must not become a send failure.
 */
export async function chargeForTemplate(
  supabase: Client,
  input: ChargeInput
): Promise<ChargeResult> {
  try {
    const rates = await loadRates(supabase);

    // Nothing is priced, so there is nothing to charge and no reason to
    // write a row saying so. A statement full of ₹0.00 lines is a
    // statement nobody can find a real charge in.
    if (!walletInUse(rates)) return { charged: false, cost: 0, reason: "No rates are set" };

    const cost = costOf(input.category, rates);
    if (cost <= 0) return { charged: false, cost: 0, reason: "This category is free" };

    const { data, error } = await supabase.rpc("wallet_move", {
      p_org_id: input.orgId,
      p_kind: "debit",
      p_amount_micros: cost,
      p_description: input.description.slice(0, 200),
      p_reference: input.reference,
      // Never refused here. By the time this runs the message has been
      // delivered — refusing the charge would mean giving it away rather
      // than stopping it. Stopping happens before the send, in canSpend.
      p_allow_negative: true,
    });

    if (error) {
      console.error("Could not charge the wallet", error.message);
      return { charged: false, cost, reason: error.message };
    }

    return { charged: true, cost, balance: typeof data === "number" ? data : undefined };
  } catch (error) {
    console.error("Could not charge the wallet", error);
    return { charged: false, cost: 0, reason: "Unknown failure" };
  }
}

/**
 * The balance and the rates, for a check made *before* a send.
 *
 * The only place a send is ever actually stopped. Reading it here rather
 * than inside the charge keeps the two directions apart: this one can
 * refuse, and the charge afterwards never can.
 */
export async function walletStatus(
  supabase: Client,
  orgId: string
): Promise<{ balance: number; rates: WalletRates }> {
  const [rates, { data }] = await Promise.all([
    loadRates(supabase),
    supabase
      .from("organizations")
      .select("wallet_balance_micros")
      .eq("id", orgId)
      .maybeSingle(),
  ]);

  return { balance: Number(data?.wallet_balance_micros ?? 0), rates };
}
