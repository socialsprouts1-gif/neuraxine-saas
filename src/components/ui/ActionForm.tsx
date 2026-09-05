"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/app/(dashboard)/actions";

// Wraps a server action so every form in the app reports success and failure
// the same way, instead of each screen re-implementing pending state.
export default function ActionForm({
  action,
  children,
  submitLabel,
  className = "",
  resetOnSuccess = false,
  compact = false,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  compact?: boolean;
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
      setResult(res);
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
        className={`btn-primary justify-center disabled:opacity-60 ${compact ? "text-xs py-2 px-3.5" : "mt-4"}`}
      >
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
        {pending ? "Saving…" : submitLabel}
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
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <textarea
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all resize-y"
      />
    </label>
  );
}
