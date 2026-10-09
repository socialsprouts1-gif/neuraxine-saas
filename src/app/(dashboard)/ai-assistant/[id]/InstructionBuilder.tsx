"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, Wand2, X } from "lucide-react";
import { generateAssistantInstructions } from "@/app/(dashboard)/portal-actions";

/**
 * Describe the job, get the system prompt. The empty prompt box is where
 * people stall, and what goes in it decides every reply the assistant sends.
 */
export default function InstructionBuilder({
  role,
  onClose,
  onBuilt,
}: {
  role: string;
  onClose: () => void;
  onBuilt: (prompt: string) => void;
}) {
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const build = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateAssistantInstructions(brief, role);
      if (!result.ok || !result.prompt) {
        setError(result.error ?? "Could not write the instructions.");
        return;
      }
      onBuilt(result.prompt);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 md:p-8 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Build instructions with AI"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="glass-card w-full max-w-2xl p-6 my-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-4.5 h-4.5 text-accent-ink" />
              Build the instructions
            </h3>
            <p className="text-xs text-white/45 mt-1.5 leading-relaxed">
              Describe the business and what this assistant should handle. You get a full prompt
              in the box, which you can then edit before saving.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-white/70 mb-1.5">
            What should this assistant do?
          </span>
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            rows={6}
            autoFocus
            disabled={pending}
            placeholder="We're a women's clothing boutique in Pune. Answer questions about sizing, fabric and what's in stock, help people find something for an occasion, and explain the 7-day exchange policy. Anything about a specific order or a refund goes to a human."
            className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all resize-y leading-relaxed disabled:opacity-60"
          />
        </label>

        <p className="text-[12px] text-white/35 mt-2 leading-relaxed">
          Say what the business is, what the assistant should answer, and what it must never
          decide on its own. Facts it will need but you don&apos;t give are written as
          placeholders for you to fill in.
        </p>

        {error && (
          <p className="text-sm text-red-400 mt-4" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-white/8">
          <span className="text-[12px] text-white/35 mr-auto">
            Runs on your own AI key if you have one saved, otherwise the platform&apos;s.
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/55 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={build}
            disabled={pending || brief.trim().length < 10}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {pending ? "Writing…" : "Write it"}
          </button>
        </div>
      </div>
    </div>
  );
}
