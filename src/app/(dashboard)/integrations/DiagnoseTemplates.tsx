"use client";

import { useState, useTransition } from "react";
import { Stethoscope, Loader2 } from "lucide-react";
import { diagnoseTemplates } from "../actions";

/**
 * Runs the template call for real and shows Meta's whole answer.
 *
 * An operator should never be shown raw JSON — except here. The reason a
 * template is refused lives in fields the friendly wording deliberately
 * hides, and every round of guessing at it has cost a person an afternoon.
 */
export default function DiagnoseTemplates({ id }: { id: string }) {
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setReport(null);
            const data = new FormData();
            data.set("id", id);
            const result = await diagnoseTemplates(data);
            if (result.ok) setReport(result.report ?? "No output.");
            else setError(result.error ?? "Could not run the check.");
          })
        }
        className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70 transition-colors"
      >
        {pending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Stethoscope className="w-3.5 h-3.5" />
        )}
        {pending ? "Asking Meta…" : "Why won't templates create?"}
      </button>

      {error && <p className="text-xs text-[#F87171] mt-2">{error}</p>}

      {report && (
        <div className="mt-3">
          <p className="text-[11px] text-white/40 mb-1.5">
            Meta&apos;s own answer, verbatim. Send this over and it names the cause.
          </p>
          <pre className="text-[11px] leading-relaxed bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words text-white/70">
            {report}
          </pre>
        </div>
      )}
    </div>
  );
}
