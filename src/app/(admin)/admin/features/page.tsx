import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader, Card } from "@/components/ui/primitives";
import FeatureGrid from "../FeatureGrid";
import { saveDefaultFeatures, saveKilledFeatures } from "../actions";
import { resolveFeatures, killedKeys, featureDef } from "@/lib/features";

// Which screens exist, for whom.
//
// Two grids that look identical and do opposite things, which is exactly
// why they belong on a screen of their own rather than stacked among seven
// other cards. The bug that produced this layout was somebody unticking
// Meetings on the first grid, saving, and finding it still on a
// workspace's sidebar — because a plan overrides the default and only the
// second grid can take something away regardless.

export const dynamic = "force-dynamic";

export default async function AdminFeaturesPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", ["feature_defaults", "feature_kill"]);

  const defaults = settings?.find((row) => row.key === "feature_defaults");
  const killed = settings?.find((row) => row.key === "feature_kill");
  const withdrawn = killedKeys(killed?.value)
    .map((key) => featureDef(key)?.label ?? key)
    .sort();

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Features"
        subtitle="What a new workspace starts with, and what is withdrawn from everybody."
      />

      {/* A real editor rather than the raw JSON box, because a typo here
          silently hides a screen from every workspace created afterwards. */}
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
            confirmed at a glance. Two grids on one page both showing
            Meetings unticked are otherwise indistinguishable — and the
            whole problem was saving the one that could not win. */}
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
    </div>
  );
}
