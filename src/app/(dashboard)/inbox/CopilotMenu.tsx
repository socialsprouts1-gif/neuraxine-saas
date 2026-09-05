"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { runCopilot, type CopilotAction } from "./actions";

const ACTIONS: Array<{ label: string; build: (draft: string) => CopilotAction }> = [
  { label: "Suggest reply", build: () => ({ kind: "suggest" }) },
  { label: "Make shorter", build: (draft) => ({ kind: "rewrite", style: "shorter", draft }) },
  {
    label: "Make professional",
    build: (draft) => ({ kind: "rewrite", style: "professional", draft }),
  },
  { label: "Make friendly", build: (draft) => ({ kind: "rewrite", style: "friendly", draft }) },
  { label: "Sales reply", build: (draft) => ({ kind: "rewrite", style: "sales", draft }) },
];

const LANGUAGES = ["English", "Hindi", "Marathi", "Spanish", "Arabic"];

/**
 * The ✨ AI button. Everything it produces lands in the composer for a person
 * to read and press Send on — nothing here reaches the customer on its own.
 */
export default function CopilotMenu({
  conversationId,
  draft,
  onInsert,
}: {
  conversationId: string;
  /** What is currently typed, for the rewrite actions. */
  draft: string;
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<CopilotAction | null>(null);
  const [translating, setTranslating] = useState(false);

  const run = (action: CopilotAction) => {
    setError(null);
    setLast(action);
    startTransition(async () => {
      const response = await runCopilot(conversationId, action);
      if (!response.ok || !response.text) {
        setError(response.error ?? "The copilot could not answer.");
        setResult(null);
        return;
      }
      setResult(response.text);
    });
  };

  const close = () => {
    setOpen(false);
    setResult(null);
    setError(null);
    setTranslating(false);
  };

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        title="AI copilot"
        aria-label="AI copilot"
        className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
          open
            ? "bg-accent/15 text-accent-ink border border-accent/30"
            : "text-white/55 hover:text-white hover:bg-white/8 border border-transparent"
        }`}
      >
        <Sparkles className="w-4 h-4" />
        AI
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 z-30 w-80 rounded-xl border border-white/12 bg-[var(--surface-1)] shadow-2xl">
          {result ? (
            <div className="p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-accent-ink">AI suggestion</span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="p-1 rounded-lg text-white/40 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-sm whitespace-pre-wrap leading-relaxed bg-white/4 border border-white/8 rounded-lg p-3 max-h-56 overflow-y-auto">
                {result}
              </p>

              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    onInsert(result);
                    close();
                  }}
                  className="btn-primary text-xs py-2 px-3.5 flex-1 justify-center"
                >
                  <Check className="w-3.5 h-3.5" />
                  Insert reply
                </button>
                <button
                  type="button"
                  disabled={pending || !last}
                  onClick={() => last && run(last)}
                  className="btn-secondary text-xs py-2 px-3.5 disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Regenerate
                </button>
              </div>

              <p className="text-[10px] text-white/35 mt-2.5 leading-relaxed">
                Read it before you send. AI can be wrong about anything specific to your business.
              </p>
            </div>
          ) : translating ? (
            <div className="p-1.5">
              <div className="px-2.5 py-1.5 text-xs font-semibold text-white/50">Translate to</div>
              {LANGUAGES.map((language) => (
                <button
                  key={language}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run({ kind: "translate", target: language, text: draft })
                  }
                  className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/6 transition-colors disabled:opacity-50"
                >
                  {language}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setTranslating(false)}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-white/45 hover:text-white/70"
              >
                Back
              </button>
            </div>
          ) : (
            <div className="p-1.5">
              {ACTIONS.map((action) => {
                // The rewrites need something to rewrite.
                const needsDraft = action.label !== "Suggest reply";
                const disabled = pending || (needsDraft && !draft.trim());
                return (
                  <button
                    key={action.label}
                    type="button"
                    disabled={disabled}
                    onClick={() => run(action.build(draft))}
                    title={
                      needsDraft && !draft.trim() ? "Type a draft first" : undefined
                    }
                    className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/6 transition-colors disabled:opacity-35"
                  >
                    {action.label}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={pending || !draft.trim()}
                onClick={() => setTranslating(true)}
                title={!draft.trim() ? "Type or paste something to translate" : undefined}
                className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/6 transition-colors disabled:opacity-35"
              >
                Translate…
              </button>

              {pending && (
                <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-white/45">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Thinking…
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 px-3 pb-3" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
