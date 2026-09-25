"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import type { ActionResult } from "@/app/(dashboard)/actions";

// The pieces every card on the assistant editor shares. Kept beside the
// editor rather than in ui/primitives because they are shaped by this
// screen's save-per-card layout, not by the app in general.

export function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="glass-card p-6">
      <div className="flex items-start gap-3 mb-5">
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 grid place-items-center flex-shrink-0 text-accent-ink">
            {icon}
          </div>
        )}
        <div>
          <h2 className="font-semibold leading-tight">{title}</h2>
          {description && <p className="text-xs text-white/45 mt-1">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * A form whose submit button sits at the bottom right and reports its own
 * result. Each card saves independently, so a failure on one doesn't throw
 * away what was typed into the others.
 */
export function SaveForm({
  action,
  children,
  label = "Save changes",
  hint,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  label?: string;
  hint?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setResult(null);
    startTransition(async () => setResult(await action(data)));
  };

  return (
    <form onSubmit={onSubmit}>
      {children}

      <div className="flex flex-wrap items-center justify-end gap-3 mt-6 pt-5 border-t border-white/8">
        {result?.error && (
          <p className="text-sm text-red-400 mr-auto" role="alert">
            {result.error}
          </p>
        )}
        {result?.ok && (
          <p className="text-sm text-accent-ink mr-auto inline-flex items-center gap-1.5" role="status">
            <Check className="w-3.5 h-3.5" />
            {result.message ?? "Saved."}
          </p>
        )}
        {!result && hint && <p className="text-xs text-white/35 mr-auto">{hint}</p>}

        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? "Saving…" : label}
        </button>
      </div>
    </form>
  );
}

export function TextInput({
  label,
  name,
  hint,
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <input
        name={name}
        {...props}
        className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all"
      />
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  name,
  hint,
  ...props
}: {
  label: string;
  name: string;
  hint?: string;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <textarea
        name={name}
        {...props}
        className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all resize-y leading-relaxed"
      />
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  name,
  options,
  hint,
  ...props
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  hint?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      <select
        name={name}
        {...props}
        className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--surface-3)]">
            {option.label}
          </option>
        ))}
      </select>
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </label>
  );
}

/**
 * A switch that also writes its state into the form. An unchecked checkbox
 * submits nothing at all, so the hidden input carries "true"/"false" and
 * the server reads a value either way.
 */
export function Toggle({
  name,
  checked,
  onChange,
  label,
  description,
}: {
  name: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && (
          <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <input type="hidden" name={name} value={String(checked)} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${
          checked ? "bg-accent" : "bg-white/12"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

/** A range input that shows its value and submits it. */
export function SliderRow({
  name,
  value,
  onChange,
  label,
  min,
  max,
  step,
  format,
  scale,
}: {
  name: string;
  value: number;
  onChange: (next: number) => void;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  /** Small captions under the track, e.g. precise → creative. */
  scale?: [string, string];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-medium text-white/70">{label}</span>
        <span className="text-xs font-semibold text-accent-ink tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--accent)] cursor-pointer"
      />
      {scale && (
        <div className="flex justify-between text-[10px] text-white/30 mt-1">
          <span>{scale[0]}</span>
          <span>{scale[1]}</span>
        </div>
      )}
    </div>
  );
}
