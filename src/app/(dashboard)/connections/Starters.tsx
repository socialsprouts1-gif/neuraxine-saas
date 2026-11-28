"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { addEventStarters } from "../event-actions";
import type { EventStarter } from "@/lib/event-starters";

// Ready-made rules, by trade.
//
// They also fix a chicken and egg. The rules need event names, and the
// event names have to match what the other system sends — software
// nobody has written yet. Naming them here means a restaurant's panel can
// be built to send order.placed because this says that is the name.

export default function Starters({ starters }: { starters: EventStarter[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(starters[0]?.key ?? null);

  const add = async (key: string) => {
    setBusy(key);
    const body = new FormData();
    body.set("starter", key);
    const result = await addEventStarters(body).catch(() => ({
      ok: false as const,
      error: "Those could not be added.",
    }));
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error ?? "That did not work.");
      return;
    }
    toast.success(result.message ?? "Added.");
    router.refresh();
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/3 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
          <Sparkles className="w-4.5 h-4.5 text-accent-ink" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">Start from a ready-made set</h2>
          <p className="text-xs text-white/50 mt-0.5 leading-relaxed max-w-2xl">
            Each one names the events too — so whoever builds your panel knows exactly what to
            send, rather than inventing names you then have to match.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {starters.map((starter) => {
          const showing = open === starter.key;
          return (
            <div
              key={starter.key}
              className="rounded-2xl border border-white/10 bg-white/4 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpen(showing ? null : starter.key)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <ChevronDown
                  className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${
                    showing ? "rotate-180" : ""
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{starter.industry}</span>
                  <span className="block text-[11px] text-white/45 leading-snug">
                    {starter.rules.length} rules · {starter.description}
                  </span>
                </span>
              </button>

              {showing && (
                <div className="px-4 pb-4 space-y-2">
                  {starter.rules.map((rule) => (
                    <div
                      key={rule.name}
                      className="rounded-xl bg-white/5 border border-white/8 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-medium">{rule.name}</span>
                        <code className="text-[11px] font-mono text-accent-ink">{rule.event}</code>
                      </div>
                      <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
                        <span className="text-white/35">When: </span>
                        {rule.when}
                      </p>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        <span className="text-white/35">Sends: </span>
                        {rule.says}
                      </p>
                    </div>
                  ))}

                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => add(starter.key)}
                    className="btn-primary text-xs mt-1 disabled:opacity-50"
                  >
                    {busy === starter.key ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Add these {starter.rules.length} rules
                  </button>
                  <p className="text-[11px] text-white/40 leading-relaxed">
                    Added as drafts. Each still needs you to choose what it sends before it can be
                    switched on.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
