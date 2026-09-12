"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";
import { generateFlowFromPrompt } from "../portal-actions";

// Describe the bot, get a wired flow. The examples are not decoration —
// people freeze at an empty box, and the shape of a good brief (trigger,
// branches, what happens at the end) is not obvious until you have seen one.
const EXAMPLES = [
  "A clinic booking bot. Greets on 'hi' or 'appointment', offers three buttons: book, reschedule, talk to reception. Booking asks for the service, the preferred day and the patient's name, then hands off to a human to confirm.",
  "A pizza shop ordering bot. Triggers on 'menu' or 'order'. Shows a list of pizzas, asks for size, asks for the delivery address, then confirms and hands off to the kitchen.",
  "A lead qualifier for a solar installer. Asks whether the property is owned or rented, roughly what the monthly bill is, and the city. If they rent, politely close. Otherwise hand off to sales.",
];

export default function BuildWithAi() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const build = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateFlowFromPrompt(brief);
      if (!result.ok || !result.id) {
        setError(result.error ?? "Could not build that bot.");
        return;
      }
      // Warnings are things the generator repaired. They belong on the
      // canvas next to the nodes they describe, so pass them along.
      const query = result.warnings?.length
        ? `?built=${encodeURIComponent(result.warnings.join("\n"))}`
        : "?built=1";
      router.push(`/chatbot/${result.id}${query}`);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-sm"
        title="Describe the bot in plain language and it gets built"
      >
        <Sparkles className="w-4 h-4" />
        Build with AI
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 md:p-8 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Build a chatbot with AI"
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="glass-card w-full max-w-2xl p-6 my-auto">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="w-4.5 h-4.5 text-accent-ink" />
                  Build with AI
                </h3>
                <p className="text-xs text-white/45 mt-1.5 leading-relaxed">
                  Describe the conversation you want. You get a real flow on the canvas — wired
                  buttons, questions, branches — saved as a draft for you to read before it goes
                  anywhere near a customer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                aria-label="Close"
                className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block">
              <span className="block text-xs font-medium text-white/70 mb-1.5">
                What should this bot do?
              </span>
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                rows={6}
                autoFocus
                disabled={pending}
                placeholder="Triggers on 'hi' or 'support'. Offers three buttons: track my order, returns, talk to a person. Track my order asks for the order number then hands off. Returns explains the 30-day policy and offers to start one."
                className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all resize-y leading-relaxed disabled:opacity-60"
              />
            </label>

            <div className="mt-3">
              <span className="block text-[11px] text-white/40 mb-2">
                Say what triggers it, what the branches are, and where each one ends. Or start
                from one of these:
              </span>
              <div className="space-y-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    disabled={pending}
                    onClick={() => setBrief(example)}
                    className="w-full text-left text-[11px] text-white/50 hover:text-white/80 leading-relaxed px-3 py-2 rounded-lg border border-white/8 bg-white/2 hover:border-white/20 transition-colors disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 mt-4" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-white/8">
              <span className="text-[11px] text-white/35 mr-auto">
                Runs on your own AI key if you have one saved, otherwise the platform&apos;s.
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
                {pending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {pending ? "Building…" : "Build it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
