"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Phone } from "lucide-react";
import { setAutomationNumber, type Pinnable } from "./number-actions";

export interface NumberOption {
  id: string;
  label: string;
}

/**
 * "Which number does this run on?"
 *
 * Hidden entirely when the workspace has one number — a picker with a
 * single option is a question with one answer, and the screens this sits
 * on are meant to stay quiet.
 */
export default function NumberPicker({
  kind,
  id,
  value,
  options,
  compact = false,
}: {
  kind: Pinnable;
  id: string;
  value: string | null;
  options: NumberOption[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  if (options.length < 2) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      {!compact && <Phone className="w-3.5 h-3.5 text-white/35 shrink-0" />}
      <select
        value={value ?? ""}
        disabled={pending}
        aria-label="WhatsApp number"
        onChange={(event) =>
          startTransition(async () => {
            const result = await setAutomationNumber(kind, id, event.target.value || null);
            setProblem(result.ok ? null : (result.error ?? "Could not set the number."));
            router.refresh();
          })
        }
        className={`bg-white/5 border border-white/12 rounded-lg text-white focus:outline-none focus:border-accent/50 ${
          compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"
        }`}
      >
        <option value="" className="bg-[var(--surface-3)]">
          Any number
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id} className="bg-[var(--surface-3)]">
            {option.label}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="w-3 h-3 animate-spin text-white/40" />}
      {problem && <span className="text-[11px] text-[#F87171]">{problem}</span>}
    </span>
  );
}
