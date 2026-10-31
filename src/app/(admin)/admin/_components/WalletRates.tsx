import { createAdminClient } from "@/lib/supabase/admin";
import { saveWalletRates } from "../actions";
import ActionForm, { Field, SelectField } from "@/components/ui/ActionForm";
import { Card } from "@/components/ui/primitives";
import {
  CATEGORIES,
  MICROS,
  RATES_CHECKED_ON,
  SUGGESTED_RATES,
  formatRate,
  readRates,
  walletInUse,
} from "@/lib/wallet";

/** Micros back into the plain number somebody types into a box. */
function inRupees(micros: number): string {
  return String(micros / MICROS);
}

/**
 * What a message costs the workspace that sends it.
 *
 * Filled in with Meta's own published India rates, at cost, so switching
 * the wallet on charges what the messages actually cost rather than a
 * number somebody made up. There is no margin in them — anybody who wants
 * one adds it here, knowingly.
 *
 * Typed in rupees, not micros. The wallet stores ₹0.8631 as 863,100 and
 * nobody should have to know that to set a price.
 *
 * All four at zero switches the wallet off entirely: no charges, no
 * balance on anybody's screen, no statement. That is the default, so a
 * deployment that never configures this never shows a customer a wallet
 * it does not use.
 */
export default async function WalletRates() {
  const admin = createAdminClient();

  const { data: setting } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "wallet_rates")
    .maybeSingle();

  const rates = readRates(setting?.value);

  return (
    <Card className="mb-6">
      <h2 className="font-semibold mb-1">Message pricing</h2>
      <p className="text-sm text-white/50 mb-5 leading-relaxed">
        What each template message takes off a workspace&rsquo;s wallet, in{" "}
        <span className="text-white/75">{rates.currency}</span>. Four decimal places, because{" "}
        <span className="text-white/75">0.8631</span> is the actual price and 0.86 is not. Leave
        everything at zero and the wallet is switched off: no charges, no balance, no statement on
        anybody&rsquo;s screen.
      </p>

      {!walletInUse(rates) && (
        <p className="text-sm text-[#FACC15]/85 mb-4 leading-relaxed">
          The wallet is currently off — customers see nothing about it, and nothing is charged.
          The boxes below are filled in with Meta&rsquo;s own India rates, at cost with nothing
          added, so pressing Save switches it on and charges what the messages really cost. Add a
          margin by changing the numbers.
        </p>
      )}

      <ActionForm action={saveWalletRates} submitLabel="Save pricing">
        <Field
          label="Currency"
          name="currency"
          defaultValue={rates.currency}
          hint="An ISO code such as INR or USD. Balances already added are not converted."
        />

        {CATEGORIES.map((category) => {
          const current =
            category.key === "marketing"
              ? rates.marketing
              : category.key === "utility"
                ? rates.utility
                : category.key === "authentication"
                  ? rates.authentication
                  : rates.service;

          // The suggestion only fills an unconfigured form. Once a price is
          // set, that price is what the box shows — a form that silently
          // reverts somebody's number to a default is one they stop
          // trusting after the first time it does it.
          const shown = walletInUse(rates) ? current : SUGGESTED_RATES[category.key];

          return (
            <Field
              key={category.key}
              label={`${category.label} — per message (${rates.currency})`}
              name={category.key}
              type="number"
              defaultValue={inRupees(shown)}
              hint={`${category.hint}${
                SUGGESTED_RATES[category.key] > 0
                  ? ` Meta charges ${formatRate(SUGGESTED_RATES[category.key], rates.currency)}.`
                  : ""
              }`}
            />
          );
        })}

        <Field
          label={`Warn below (${rates.currency})`}
          name="low_balance"
          type="number"
          defaultValue={inRupees(rates.lowBalance)}
          hint="The dashboard starts saying the balance is low under this."
        />

        <SelectField
          label="Stop sending when the wallet is empty?"
          name="block_when_empty"
          defaultValue={rates.blockWhenEmpty ? "on" : "off"}
          options={[
            { value: "off", label: "No — keep sending and let the balance go negative" },
            { value: "on", label: "Yes — pause sending until it is topped up" },
          ]}
        />

        <p className="text-xs text-white/40 leading-relaxed">
          Meta&rsquo;s figures above exclude GST — India treats its charges as imported digital
          services, so 18% goes on top of the real invoice, and ₹0.8631 is ₹1.0185 by the time it
          is paid. They also exclude the volume tiers, and service messages are free for the first
          1,000 a month per number. Checked against Meta&rsquo;s India rate card on{" "}
          {new Date(RATES_CHECKED_ON).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          ; they change, so look at your own invoice before you rely on them.
        </p>

        <p className="text-xs text-white/40 leading-relaxed">
          &ldquo;No&rdquo; is the safer default and the one to leave alone unless you mean it. A
          wallet that stops sending the moment a rate is mistyped is every customer&rsquo;s
          campaign stopping at once, and the first you hear of it is the support queue.
        </p>
      </ActionForm>
    </Card>
  );
}
