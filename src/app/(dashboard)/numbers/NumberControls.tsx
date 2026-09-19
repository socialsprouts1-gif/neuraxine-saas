"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Power, RefreshCw, Star } from "lucide-react";
import {
  refreshAllNumbers,
  refreshNumber,
  registerNumber,
  renameNumber,
  setDefaultNumber,
} from "./number-actions";

export function RefreshAllButton() {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      {note && <span className="text-xs text-white/50 max-w-xs">{note}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await refreshAllNumbers();
            setNote(result.message ?? result.error ?? null);
            router.refresh();
          })
        }
        className="btn-secondary text-sm"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Check with Meta
      </button>
    </div>
  );
}

export function MakeDefaultButton({ id, isDefault }: { id: string; isDefault: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  if (isDefault) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent-ink">
        <Star className="w-3.5 h-3.5 fill-current" />
        Default
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setDefaultNumber(id);
            if (!result.ok) setProblem(result.error ?? "Could not change the default.");
            router.refresh();
          })
        }
        className="text-[11px] text-white/45 hover:text-accent-ink transition-colors"
      >
        Make default
      </button>
      {problem && <span className="text-[11px] text-[#F87171]">{problem}</span>}
    </span>
  );
}

export function CheckNumberButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Check this number with Meta"
      onClick={() =>
        startTransition(async () => {
          await refreshNumber(id);
          router.refresh();
        })
      }
      className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors"
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

/** Naming a number is what makes a picker readable once you have three. */
export function NumberLabel({ id, label }: { id: string; label: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label ?? "");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      await renameNumber(id, value);
      setEditing(false);
      router.refresh();
    });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1.5 text-left"
      >
        <span className={label ? "font-medium" : "text-white/35 italic"}>
          {label || "Add a name"}
        </span>
        <Pencil className="w-3 h-3 text-white/0 group-hover:text-white/40 transition-colors" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") setEditing(false);
        }}
        placeholder="Support"
        maxLength={40}
        className="bg-white/5 border border-white/12 rounded-lg px-2.5 py-1 text-sm w-36 focus:outline-none focus:border-accent/50"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        aria-label="Save name"
        className="p-1 rounded-lg text-accent-ink hover:bg-white/8"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
}


/**
 * Registering a number for the Cloud API.
 *
 * Shown when Meta has told us the number is not connected. Without it the
 * only fix lives in Meta's dashboard, and the person looking at a number
 * that quietly reaches nobody has no way to act from here.
 */
export function RegisterNumberButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg bg-accent/12 text-accent-ink border border-accent/25 hover:bg-accent/20 transition-colors"
      >
        <Power className="w-3 h-3" />
        Register number
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6-digit PIN"
          inputMode="numeric"
          className="bg-white/5 border border-white/12 rounded-lg px-2.5 py-1 text-sm w-28 tabular-nums focus:outline-none focus:border-accent/50"
        />
        <button
          type="button"
          disabled={pending || pin.length !== 6}
          onClick={() =>
            startTransition(async () => {
              const result = await registerNumber(id, pin);
              setNote(result.ok ? (result.message ?? "Registered.") : (result.error ?? "Failed."));
              if (result.ok) setOpen(false);
              router.refresh();
            })
          }
          className="text-[11px] px-2 py-1 rounded-lg bg-accent/12 text-accent-ink border border-accent/25 disabled:opacity-40"
        >
          {pending ? "Registering…" : "Register"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] px-1.5 py-1 text-white/45 hover:text-white"
        >
          Cancel
        </button>
      </div>
      <p className="text-[10px] text-white/35 max-w-[14rem] text-right leading-relaxed">
        Meta → WhatsApp → Two-step verification. Not your login password.
      </p>
      {note && <p className="text-[11px] text-[#F87171] max-w-[16rem] text-right">{note}</p>}
    </div>
  );
}
