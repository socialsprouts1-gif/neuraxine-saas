"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, Badge } from "@/components/ui/primitives";
import FeatureGrid from "../FeatureGrid";
import { savePlanFeatures } from "../actions";
import { togglableKeys } from "@/lib/features";

/**
 * What one tier includes.
 *
 * Collapsed until opened: with six plans this would otherwise be six full
 * grids stacked down the page, and most visits are not about features.
 */
export default function PlanFeatureCard({
  plan,
  enabled,
}: {
  plan: { id: string; name: string; feature_keys: string[] };
  enabled: Record<string, boolean>;
}) {
  const [open, setOpen] = useState(false);
  const all = togglableKeys();
  const included = plan.feature_keys.length === 0 ? all.length : plan.feature_keys.length;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full flex items-center gap-3 text-left"
      >
        <ChevronDown
          className={`w-4 h-4 text-white/40 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span className="font-semibold">{plan.name}</span>
        {plan.feature_keys.length === 0 ? (
          <Badge tone="green">everything</Badge>
        ) : (
          <Badge tone="blue">
            {included} of {all.length}
          </Badge>
        )}
        <span className="ml-auto text-xs text-white/35">{open ? "Hide" : "Edit features"}</span>
      </button>

      {open && (
        <div className="mt-5 pt-5 border-t border-white/8">
          <FeatureGrid
            action={savePlanFeatures}
            hiddenFields={{ plan_id: plan.id }}
            enabled={enabled}
            note={`What somebody on ${plan.name} can use. Leave everything ticked and the tier is stored as unrestricted, so a feature added to the product later is included automatically rather than needing every plan edited.`}
            submitLabel={`Save ${plan.name}`}
          />
        </div>
      )}
    </Card>
  );
}
