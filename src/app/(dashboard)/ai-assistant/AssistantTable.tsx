"use client";

import { useState, useTransition } from "react";
import NumberPicker, { type NumberOption } from "../numbers/NumberPicker";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { createAiAssistant, deleteAiAssistant } from "../portal-actions";
import { providerById } from "@/lib/ai-providers";

export interface AssistantRow {
  connection_id: string | null;
  id: string;
  name: string;
  role: string;
  provider: string;
  model: string;
  is_active: boolean;
}

export default function AssistantTable({
  assistants,
  numbers,
}: {
  assistants: AssistantRow[];
  numbers: NumberOption[];
}) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="btn-primary text-sm mb-5"
      >
        <Plus className="w-4 h-4" />
        Create AI Assistant
      </button>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[40rem]">
            <thead>
              <tr className="text-left text-sm font-semibold bg-accent/8 border-b border-accent/15">
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Model</th>
                {/* Only earns a column once the workspace has a choice. */}
                {numbers.length > 1 && <th className="px-5 py-4">Number</th>}
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assistants.map((assistant) => (
                <AssistantRowView key={assistant.id} assistant={assistant} numbers={numbers} />
              ))}
            </tbody>
          </table>
        </div>

        {assistants.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm text-white/50">
              No AI assistants yet. Create one to answer anything your chatbots, FAQ entries and
              automations didn&apos;t match.
            </p>
          </div>
        )}
      </div>

      {creating && <CreateDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function AssistantRowView({
  assistant,
  numbers,
}: {
  assistant: AssistantRow;
  numbers: NumberOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const remove = () =>
    startTransition(async () => {
      const data = new FormData();
      data.set("id", assistant.id);
      await deleteAiAssistant(data);
      router.refresh();
    });

  return (
    <tr className="border-b border-white/5 last:border-0 hover:bg-white/2 transition-colors">
      <td className="px-5 py-3.5">
        <Link
          href={`/ai-assistant/${assistant.id}`}
          className="font-medium hover:text-accent-ink transition-colors"
        >
          {assistant.name}
        </Link>
        {!assistant.is_active && (
          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md bg-white/8 text-white/45">
            paused
          </span>
        )}
      </td>

      <td className="px-5 py-3.5 text-white/60">{assistant.role || "—"}</td>

      <td className="px-5 py-3.5">
        <code className="text-xs text-accent2-ink">{assistant.model}</code>
        <span className="text-[11px] text-white/35 ml-2">
          {providerById(assistant.provider)?.name ?? assistant.provider}
        </span>
      </td>

      {numbers.length > 1 && (
        <td className="px-5 py-3.5">
          <NumberPicker
            kind="assistant"
            id={assistant.id}
            value={assistant.connection_id}
            options={numbers}
            compact
          />
        </td>
      )}

      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-1.5">
          {confirming ? (
            <>
              <span className="text-[11px] text-white/50 mr-1">Delete this assistant?</span>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-[11px] px-2.5 py-1.5 rounded-lg border border-white/12 text-white/60 hover:bg-white/6 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <Link
                href={`/ai-assistant/${assistant.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 text-xs text-white/70 hover:text-white hover:border-white/25 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Link>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label={`Delete ${assistant.name}`}
                className="p-2 rounded-lg text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * Name only. Everything else — provider, key, prompt, knowledge — is edited
 * on the next screen, where there is room to explain what each one does.
 */
function CreateDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    if (!name.trim()) return;
    setError(null);
    const data = new FormData();
    data.set("name", name);
    startTransition(async () => {
      const result = await createAiAssistant(data);
      if (!result.ok || !result.id) {
        setError(result.error ?? "Could not create the assistant.");
        return;
      }
      router.push(`/ai-assistant/${result.id}`);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 md:p-8 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Create AI Assistant"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="glass-card w-full max-w-md p-6 my-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold">Create AI Assistant</h3>
            <p className="text-xs text-white/45 mt-1.5 leading-relaxed">
              Give your AI assistant a name. You choose the provider, paste a key, write the
              instructions and add knowledge on the next screen.
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
          <span className="block text-xs font-medium text-white/70 mb-1.5">Assistant name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") create();
            }}
            autoFocus
            disabled={pending}
            placeholder="Support Sam"
            className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all disabled:opacity-60"
          />
        </label>

        {error && (
          <p className="text-sm text-red-400 mt-3" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 mt-6">
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
            onClick={create}
            disabled={pending || !name.trim()}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {pending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
