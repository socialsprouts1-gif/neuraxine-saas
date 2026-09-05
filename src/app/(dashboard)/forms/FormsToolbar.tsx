"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { createForm, deleteForm, syncAllForms } from "./flow-actions";
import { FLOW_CATEGORIES } from "@/lib/flow-json";

export function FormsToolbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {note && <span className="text-xs text-white/50 mr-1 max-w-xs">{note}</span>}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await syncAllForms();
              setNote(result.ok ? (result.message ?? "Synced.") : (result.error ?? "Sync failed."));
              router.refresh();
            })
          }
          className="btn-secondary text-sm"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Sync with Meta
        </button>
        <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          New form
        </button>
      </div>

      {open && <NewFormDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function NewFormDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("LEAD_GENERATION");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New form"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="glass-card w-full max-w-md p-6 space-y-4">
        <div>
          <h3 className="font-semibold">New form</h3>
          <p className="text-xs text-white/45 mt-1.5 leading-relaxed">
            Forms open inside the chat. The category tells WhatsApp what the form is for and
            cannot be changed once it is published.
          </p>
        </div>

        <div>
          <span className="block text-xs font-medium text-white/70 mb-1.5">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Book an appointment"
            className={input}
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-white/70 mb-1.5">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={input}
          >
            {FLOW_CATEGORIES.map((option) => (
              <option key={option} value={option} className="bg-[var(--surface-3)]">
                {option.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-[#F87171]">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                const data = new FormData();
                data.set("name", name);
                data.set("category", category);
                const result = await createForm(data);
                if (!result.ok || !result.id) {
                  setError(result.error ?? "Could not create the form.");
                  return;
                }
                router.push(`/forms/${result.id}`);
              })
            }
            className="btn-primary text-sm disabled:opacity-40"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteFormButton({ id, name, published }: { id: string; name: string; published: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const data = new FormData();
              data.set("id", id);
              await deleteForm(data);
              router.refresh();
            })
          }
          className="text-[11px] px-2 py-1 rounded-lg bg-[#F87171]/12 text-[#F87171] border border-[#F87171]/25"
        >
          {pending ? "Removing…" : published ? "Retire" : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-[11px] px-2 py-1 rounded-lg text-white/45 hover:text-white"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={`Remove ${name}`}
      className="p-1.5 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8 transition-colors"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

const input =
  "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";
