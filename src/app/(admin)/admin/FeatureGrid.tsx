"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { FEATURES, FEATURE_GROUPS, togglableKeys } from "@/lib/features";
import type { ActionResult } from "@/app/(dashboard)/actions";

/**
 * The on/off grid, shared by the three places that set feature access.
 *
 * Every togglable feature is always rendered, ticked or not, and the form
 * posts the complete new state rather than a diff. An unticked checkbox
 * sends nothing at all over a form post, so "off" can only be expressed by
 * the server reading what is absent from a list it already knows.
 */
export default function FeatureGrid({
  action,
  hiddenFields,
  enabled,
  planKeys,
  note,
  submitLabel = "Save features",
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  /** org_id, plan_id — whatever this particular form is about. */
  hiddenFields?: Record<string, string>;
  /** Which keys start ticked. */
  enabled: Record<string, boolean>;
  /**
   * What the plan gives, when this grid is setting an override on top of
   * one. Anything differing from it is marked, so it is obvious which
   * boxes are a deliberate exception rather than the tier's own shape.
   */
  planKeys?: Record<string, boolean>;
  note?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(togglableKeys().filter((key) => enabled[key] !== false))
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const all = togglableKeys();
  const setAll = (on: boolean) => setPicked(on ? new Set(all) : new Set());

  return (
    <div className="space-y-5">
      {note && <p className="text-xs text-white/45 leading-relaxed max-w-2xl">{note}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setAll(true)}
          className="text-xs text-white/50 hover:text-white transition-colors"
        >
          Turn everything on
        </button>
        <span className="text-white/15">·</span>
        <button
          type="button"
          onClick={() => setAll(false)}
          className="text-xs text-white/50 hover:text-white transition-colors"
        >
          Turn everything off
        </button>
        <span className="text-xs text-white/30 ml-auto">
          {picked.size} of {all.length} on
        </span>
      </div>

      <div className="space-y-5">
        {FEATURE_GROUPS.map((group) => {
          const inGroup = FEATURES.filter((feature) => feature.group === group);
          if (inGroup.length === 0) return null;

          return (
            <div key={group}>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
                {group}
              </div>
              <div className="grid sm:grid-cols-2 gap-1.5">
                {inGroup.map((feature) => {
                  if (feature.locked) {
                    return (
                      <div
                        key={feature.key}
                        className="flex items-start gap-3 p-3 rounded-xl border border-white/8 bg-white/2 opacity-60"
                      >
                        <Lock className="w-3.5 h-3.5 text-white/30 mt-0.5 flex-shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{feature.label}</span>
                          <span className="block text-[11px] text-white/35 leading-relaxed mt-0.5">
                            Always on — the product does not work without it.
                          </span>
                        </span>
                      </div>
                    );
                  }

                  const on = picked.has(feature.key);
                  // Marked only when a plan is the thing being overridden.
                  const differs = planKeys !== undefined && on !== (planKeys[feature.key] !== false);

                  return (
                    <label
                      key={feature.key}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        on
                          ? "border-accent/35 bg-accent/8"
                          : "border-white/10 bg-white/3 hover:border-white/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="features"
                        value={feature.key}
                        checked={on}
                        onChange={() => toggle(feature.key)}
                        className="mt-0.5 accent-[var(--accent)]"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium">{feature.label}</span>
                          {differs && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#A855F7]/15 text-[#C084FC]">
                              override
                            </span>
                          )}
                        </span>
                        <span className="block text-[11px] text-white/40 leading-relaxed mt-0.5">
                          {feature.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const data = new FormData();
              for (const [key, value] of Object.entries(hiddenFields ?? {})) data.set(key, value);
              for (const key of picked) data.append("features", key);
              const result = await action(data);
              setMessage({
                ok: result.ok,
                text: result.ok ? (result.message ?? "Saved.") : (result.error ?? "Could not save."),
              });
              if (result.ok) router.refresh();
            })
          }
          className="btn-primary text-sm disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitLabel}
        </button>
        {message && (
          <span
            className={`text-xs ${message.ok ? "text-accent-ink" : "text-[#F87171]"}`}
            role="status"
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
