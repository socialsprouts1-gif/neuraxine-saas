import { createAdminClient } from "@/lib/supabase/admin";
import { saveTrialDays, saveBranding, saveSignups, saveSignupRole } from "../actions";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { Card } from "@/components/ui/primitives";
import { readTrialDays } from "@/lib/trial";
import { ORG_ROLES, readSignupRole } from "@/lib/member-role";

/**
 * The settings that had to be typed as JSON, as ordinary controls.
 *
 * Every one of these was a textarea holding something like
 * {"trial_days": 14}. That asks a person who does not write software to
 * edit a data format, where a missing brace or a stray comma is rejected
 * by the parser with no hint about which character was wrong — and where
 * getting it wrong silently changes what every new customer is given.
 *
 * The raw editor stays on the page for anything not listed here, because
 * a setting nobody has built a form for still has to be reachable.
 */
export default async function KnownSettings() {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", ["billing", "branding", "signups"]);

  const byKey = new Map((rows ?? []).map((row) => [row.key, row.value as Record<string, unknown>]));

  const billing = byKey.get("billing") ?? {};
  const branding = byKey.get("branding") ?? {};
  const signups = byKey.get("signups") ?? {};

  const trialDays = readTrialDays(billing);
  const signupsEnabled = signups.enabled !== false;
  const onboardingFee = signups.require_onboarding_fee === true;
  const signupRole = readSignupRole(signups);

  return (
    <>
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Free trial</h2>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          How many days a brand-new workspace gets before it has to pay. Existing workspaces keep
          the trial they were given — changing this must never shorten one somebody is already
          part-way through.
        </p>
        <ActionForm action={saveTrialDays} submitLabel="Save">
          <Field
            label="Trial length (days)"
            name="trial_days"
            type="number"
            required
            defaultValue={String(trialDays)}
            hint="Between 0 and 90. Zero means no trial at all."
          />
        </ActionForm>
      </Card>

      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Product name and support</h2>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          Used in emails and wherever the product names itself to a customer. The logo and the
          name in the sidebar are set under Landing page → Brand.
        </p>
        <ActionForm action={saveBranding} submitLabel="Save">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Product name"
              name="product_name"
              required
              defaultValue={String(branding.product_name ?? "Neura Chat")}
            />
            <Field
              label="Support email"
              name="support_email"
              type="email"
              required
              defaultValue={String(branding.support_email ?? "")}
              hint="Where replies to your emails go."
            />
          </div>
        </ActionForm>
      </Card>

      <Card className="mb-6">
        <h2 className="font-semibold mb-1">New signups</h2>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          Whether anyone can create a workspace from the public site.
        </p>
        <ActionForm action={saveSignups} submitLabel="Save">
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={signupsEnabled}
                className="accent-[var(--accent)] w-4 h-4 mt-0.5"
              />
              <span className="text-sm text-white/75">
                Allow new signups
                <span className="block text-[11px] text-white/40">
                  Off closes registration. People who already have a workspace are unaffected.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="require_onboarding_fee"
                defaultChecked={onboardingFee}
                className="accent-[var(--accent)] w-4 h-4 mt-0.5"
              />
              <span className="text-sm text-white/75">
                Charge an onboarding fee
                <span className="block text-[11px] text-white/40">
                  Requires payment before a new workspace is usable.
                </span>
              </span>
            </label>
          </div>
        </ActionForm>
      </Card>

      <Card className="mb-6">
        <h2 className="font-semibold mb-1">Role for a new workspace</h2>
        <p className="text-sm text-white/50 mb-5 leading-relaxed">
          What the person who signs up is made in the workspace their signup creates. This is
          about who administers that one workspace — it is not what they can reach in the
          product. That is decided by their plan and by the feature switches on{" "}
          <span className="text-white/70">Organizations → Access</span>.
        </p>
        <ActionForm action={saveSignupRole} submitLabel="Save">
          <label className="block text-xs text-white/50 mb-1.5">Role on signup</label>
          <select
            name="default_role"
            defaultValue={signupRole}
            className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-[#A855F7]/50"
          >
            {ORG_ROLES.map((value) => (
              <option key={value} value={value} className="bg-[var(--surface-3)]">
                {value}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
            Owner is the default and the safe one. Only an owner or an admin may connect a
            WhatsApp number, open billing or add an integration, so a workspace whose only
            member is a plain <span className="text-white/60">member</span> cannot be set up by
            the person who just signed up for it — they would have to ask you first, part-way
            into their trial. Pick <span className="text-white/60">member</span> only if you
            intend to promote every new customer by hand.
          </p>
        </ActionForm>
      </Card>
    </>
  );
}
