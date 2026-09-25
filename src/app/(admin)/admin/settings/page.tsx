import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { savePlatformSetting } from "../actions";
import ActionForm, { Field, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, EmptyState } from "@/components/ui/primitives";
import FeatureGrid from "../FeatureGrid";
import { saveDefaultFeatures, saveKilledFeatures } from "../actions";
import { resolveFeatures, killedKeys, featureDef } from "@/lib/features";
import { formatDate } from "@/types/admin";
import PlatformGateway from "./PlatformGateway";
import PaymentCheck from "./PaymentCheck";
import KnownSettings from "./KnownSettings";
import EmailCheck from "./EmailCheck";

export default async function AdminSettingsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data: settings, error } = await supabase
    .from("platform_settings")
    .select("*")
    .order("key");

  const defaults = settings?.find((row) => row.key === "feature_defaults");
  const killed = settings?.find((row) => row.key === "feature_kill");
  const withdrawn = killedKeys(killed?.value)
    .map((key) => featureDef(key)?.label ?? key)
    .sort();

  // Everything that now has a form of its own is dropped from the raw
  // list: two editors for one value is how they end up disagreeing, and
  // the JSON one is the one that can corrupt it.
  const HAS_A_FORM = new Set([
    "billing",
    "branding",
    "signups",
    "feature_defaults",
    "feature_kill",
    "platform_payment_org",
  ]);
  const advanced = (settings ?? []).filter((row) => !HAS_A_FORM.has(row.key));

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Platform settings"
        subtitle="Global configuration stored in the database, editable without a redeploy."
      />

      {/* The feature defaults get a real editor rather than the raw JSON
          box below, because a typo here silently hides a screen from every
          workspace created afterwards. */}
      <Card className="mb-6">
        <h2 className="font-semibold mb-1">What a new workspace starts with</h2>
        <FeatureGrid
          action={saveDefaultFeatures}
          enabled={resolveFeatures({ platform: defaults?.value })}
          note="The weakest layer, and deliberately so: it is a starting point, not a rule. A plan states every feature explicitly, so any workspace on one — including every trial — overrides this completely, and a single workspace can be given its own exception on its Access screen. To take a feature away from everybody regardless, use the card below."
          submitLabel="Save defaults"
        />
      </Card>

      {/* The control that was missing, and the reason somebody unticked
          Meetings above and kept finding it on another workspace's
          sidebar. That was the default being overridden by a plan, which
          is correct behaviour and no use at all when a half-finished
          screen has to be withdrawn today. */}
      <Card className="mb-6 border-[#F87171]/20">
        <h2 className="font-semibold mb-1">Switched off everywhere</h2>

        {/* The state, read back from what is stored, so a save can be
            confirmed at a glance. Two cards on one page both showing a
            grid with Meetings unticked are otherwise indistinguishable —
            and the whole problem was saving the one that could not win. */}
        <p className="text-xs mb-3">
          {withdrawn.length > 0 ? (
            <span className="text-[#F87171]">
              Currently withdrawn from every workspace: {withdrawn.join(", ")}.
            </span>
          ) : (
            <span className="text-white/40">
              Nothing is switched off platform-wide right now. Every workspace gets whatever its
              plan and its own exceptions allow.
            </span>
          )}
        </p>

        <FeatureGrid
          action={saveKilledFeatures}
          enabled={resolveFeatures({ disabled: killed?.value })}
          note="Unticking something here removes it from every workspace immediately — existing ones included — over the top of any plan and any per-workspace exception. This is how you withdraw a screen that is not ready. Nothing here can grant a feature: a ticked box only means this card is not the thing taking it away."
          submitLabel="Save platform switches"
        />
      </Card>

      <EmailCheck />

      <KnownSettings />

      <PaymentCheck />
      <PlatformGateway />

      <div className="space-y-6">
        {error ? (
          <EmptyState title="Couldn't load settings" description={error.message} />
        ) : advanced.length > 0 ? (
          advanced.map((s) => (
            <Card key={s.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <h2 className="font-semibold font-mono text-sm">{s.key}</h2>
                <span className="text-[11px] text-white/35">
                  updated {formatDate(s.updated_at)}
                </span>
              </div>
              {s.description && <p className="text-sm text-white/50 mb-4">{s.description}</p>}
              <ActionForm action={savePlatformSetting} submitLabel="Save">
                <input type="hidden" name="key" value={s.key} />
                <TextareaField
                  label="Value (JSON)"
                  name="value"
                  rows={4}
                  placeholder={JSON.stringify(s.value, null, 2)}
                />
                <p className="text-[11px] text-white/35 mt-2">
                  Current: <code className="text-white/60">{JSON.stringify(s.value)}</code>
                </p>
              </ActionForm>
            </Card>
          ))
        ) : (
          <EmptyState
            title="Nothing else to configure"
            description="Every setting this deployment uses has a form above. Anything added by hand will appear here."
          />
        )}

        <Card>
          <h2 className="font-semibold mb-1">Add a setting</h2>
          <p className="text-sm text-white/50 mb-5">
            Values are stored as JSON, so a setting can hold a whole object.
          </p>
          <ActionForm action={savePlatformSetting} submitLabel="Create setting" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Key" name="key" required placeholder="feature_flags" />
              <TextareaField
                label="Value (JSON)"
                name="value"
                rows={3}
                required
                placeholder='{"new_inbox": true}'
              />
            </div>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="font-semibold mb-2">Granting admin access</h2>
          <p className="text-sm text-white/50 mb-4">
            Platform admin is deliberately not grantable from this UI — an account with
            access cannot mint more. Add the row directly in the SQL editor:
          </p>
          <pre className="bg-[var(--surface-1)] border border-white/10 rounded-xl p-4 overflow-x-auto text-xs">
            <code className="text-white/80">{`insert into platform_admins (user_id)
select id from auth.users where email = 'you@example.com';`}</code>
          </pre>
        </Card>
      </div>
    </div>
  );
}
