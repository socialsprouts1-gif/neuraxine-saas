"use client";

import { Check, ChevronRight } from "lucide-react";
import { stepNumber, type CheckItem, type StepKey } from "@/lib/agent-setup";

// What is done, what is not, and where to go and fix it.
//
// The step rail says where you are. This is the only thing on the screen
// that says what to do next, which is why every row is a button: a
// checklist that names a problem and then makes you go and find it is a
// checklist people read once.
//
// Nothing in here is decorative. Every item is something that changes how
// the agent behaves with a real customer — a list padded with "give it a
// description" teaches people to skim, and then the one item that matters
// is skimmed too.

export default function SetupChecklist({
  items,
  summary,
  onGo,
}: {
  items: CheckItem[];
  summary: { done: number; total: number; ready: boolean; next: CheckItem | null };
  onGo: (step: StepKey) => void;
}) {
  return (
    <aside className="glass-card p-5 xl:sticky xl:top-6">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold">Setup checklist</h2>
        <span className="text-[11px] text-white/40 tabular-nums">
          {summary.done}/{summary.total}
        </span>
      </div>

      <div className="h-1 rounded-full bg-white/8 overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${(summary.done / Math.max(summary.total, 1)) * 100}%` }}
        />
      </div>

      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onGo(item.step)}
              className="w-full flex items-start gap-2.5 text-left p-2 -mx-2 rounded-xl hover:bg-white/5 transition-colors group"
            >
              <span
                className={`mt-0.5 w-4 h-4 rounded-full grid place-items-center shrink-0 border ${
                  item.done
                    ? "bg-accent/20 border-accent/40 text-accent-ink"
                    : "border-white/20 text-transparent"
                }`}
                aria-hidden
              >
                <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[12.5px] font-medium leading-snug ${
                    item.done ? "text-white/55" : "text-white"
                  }`}
                >
                  {item.title}
                </span>
                {/* The reason, only while it is still outstanding. Once it
                    is done, why it mattered is noise. */}
                {!item.done && (
                  <span className="block text-[11px] text-white/40 leading-snug mt-0.5">
                    {item.why}
                  </span>
                )}
              </span>

              {!item.done && (
                <span className="inline-flex items-center gap-0.5 text-[10.5px] text-white/30 group-hover:text-accent-ink transition-colors shrink-0 mt-0.5">
                  {stepNumber(item.step)}
                  <ChevronRight className="w-3 h-3" />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-4 border-t border-white/8">
        {summary.ready ? (
          <p className="text-[12px] text-accent-ink leading-relaxed">
            All checks passed — your agent is ready to go live.
          </p>
        ) : (
          <p className="text-[12px] text-white/50 leading-relaxed">
            <span className="text-white/75">Next:</span> {summary.next?.title.toLowerCase()}.{" "}
            <button
              type="button"
              onClick={() => summary.next && onGo(summary.next.step)}
              className="text-accent-ink hover:underline"
            >
              Go to step {summary.next ? stepNumber(summary.next.step) : 1}
            </button>
          </p>
        )}
      </div>
    </aside>
  );
}
