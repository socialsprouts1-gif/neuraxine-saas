"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/app/(dashboard)/actions";

/** How much attention the button asks for. */
export type ActionVariant = "primary" | "quiet" | "danger";

const VARIANT_CLASS: Record<ActionVariant, string> = {
  primary: "btn-primary",
  quiet: "btn-quiet",
  danger: "btn-danger",
};

// Wraps a server action so every form in the app reports success and failure
// the same way, instead of each screen re-implementing pending state.
export default function ActionForm({
  action,
  children,
  submitLabel,
  className = "",
  resetOnSuccess = false,
  compact = false,
  variant = "primary",
  onResult,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  compact?: boolean;
  /**
   * "quiet" for the buttons beside the one that matters. Defaults to
   * primary so every existing form keeps the look it had.
   */
  variant?: ActionVariant;
  /**
   * Hands the outcome to the caller instead of printing it here.
   *
   * A row of these each printed its own message, and since a form is as
   * wide as its widest child, one long sentence stretched that form
   * across the card and shoved the next button half a screen away. A
   * caller that takes the result can show it once, in one place, and the
   * buttons stay in a row.
   */
  onResult?: (result: ActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setResult(null);

    startTransition(async () => {
      const res = await action(data);
      if (onResult) onResult(res);
      else setResult(res);
      if (res.ok && resetOnSuccess) form.reset();
    });
  };

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}

      {result?.error && (
        <p className="text-sm text-red-400 mt-3" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && result.message && (
        <p className="text-sm text-accent-ink mt-3" role="status">
          {result.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`${VARIANT_CLASS[variant]} justify-center disabled:opacity-60 ${
          compact ? "btn-compact" : "mt-4"
        }`}
      >
        {pending && <Loader2 className={compact ? "w-3.5 h-3.5 animate-spin" : "w-4 h-4 animate-spin"} />}
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}

export function Field({
  label,
  name,
  type = "text",
  placeholder,
  required = false,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all"
      />
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[var(--surface-3)]">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextareaField({
  label,
  name,
  placeholder,
  required = false,
  rows = 3,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <textarea
        name={name}
        rows={rows}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all resize-y"
      />
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </label>
  );
}
