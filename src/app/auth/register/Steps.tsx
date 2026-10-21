"use client";

import { Check } from "lucide-react";

// The three steps, and which one you are on.
//
// Worth the space it takes: the form asks for a WhatsApp number and then
// stops to send a code to it, and somebody who cannot see that there is a
// third step assumes the second one is the end and closes the tab.
//
// No connecting line between the three. At the width of this card it costs
// the labels more room than it buys in clarity, and a truncated label says
// less than no label.

export const STEPS = [
  { key: "personal", label: "Personal", hint: "Name, email" },
  { key: "verify", label: "Verification", hint: "Your number" },
  { key: "security", label: "Security", hint: "A password" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

export function stepIndex(step: StepKey): number {
  return STEPS.findIndex((entry) => entry.key === step);
}

export default function Steps({ current }: { current: StepKey }) {
  const active = stepIndex(current);

  return (
    <ol className="flex items-center gap-2 mb-7">
      {STEPS.map((step, index) => {
        const done = index < active;
        const here = index === active;

        return (
          <li
            key={step.key}
            className={`flex items-center gap-2 min-w-0 ${here ? "flex-1" : "sm:flex-1"}`}
          >
            <span
              className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-[12px] font-bold border transition-all ${
                done
                  ? "bg-accent/20 border-accent/40 text-accent-ink"
                  : here
                    ? "bg-accent text-[#0B0714] border-transparent"
                    : "bg-white/5 border-white/12 text-white/40"
              }`}
              aria-hidden
            >
              {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : index + 1}
            </span>

            {/* On a phone there is room for one of these labels, not three
                — three gives "Verificati…" above "Your numb…", which says
                less than the circles alone. So only the step you are on is
                named, and the other two are dots. */}
            <span className={`min-w-0 ${here ? "" : "hidden sm:block"}`}>
              <span
                className={`block text-[12.5px] font-semibold truncate ${
                  here ? "text-white" : done ? "text-white/70" : "text-white/40"
                }`}
              >
                {step.label}
              </span>
              <span className="block text-[11px] text-white/35 truncate">{step.hint}</span>
            </span>

          </li>
        );
      })}
    </ol>
  );
}
