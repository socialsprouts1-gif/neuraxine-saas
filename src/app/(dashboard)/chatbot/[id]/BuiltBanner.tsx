"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";

// Shown once, when the canvas opens on a bot that was just generated. The
// warnings are repairs the generator had to make — an unwired button or a
// missing trigger is invisible on a canvas until a customer hits it.
export default function BuiltBanner({ warnings }: { warnings: string[] }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="mx-4 mt-3 rounded-xl border border-accent/25 bg-accent/8 px-4 py-3 flex items-start gap-3">
      <Sparkles className="w-4 h-4 text-accent-ink flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-accent-ink">
          Built. Read it through before you set it live.
        </div>
        <p className="text-xs text-white/55 mt-1 leading-relaxed">
          It is saved as a draft, so nothing is being sent yet. Check the wording, the keywords on
          the trigger, and that every button leads somewhere.
        </p>
        {warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {warnings.map((warning) => (
              <li key={warning} className="text-xs text-[#FACC15] leading-relaxed">
                • {warning}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Dismiss"
        className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
