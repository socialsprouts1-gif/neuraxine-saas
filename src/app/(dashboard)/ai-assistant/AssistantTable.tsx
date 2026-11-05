"use client";

import { useState, useTransition } from "react";
import NumberPicker, { type NumberOption } from "../numbers/NumberPicker";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { createAiAssistant, deleteAiAssistant } from "../portal-actions";
import { providerById } from "@/lib/ai-providers";
import BrandLogo from "@/components/ui/BrandLogo";
import Modal from "@/components/ui/Modal";

/** The colour behind each provider's mark, for the ones with no solid tile. */
const PROVIDER_BRAND: Record<string, string> = {
  anthropic: "#D97757",
  openai: "#10A37F",
  google: "#4285F4",
  custom: "#8B5CF6",
};

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
              {/* Matches <Table> in primitives. These two screens had
                  their own header — solid accent wash, full-size bold
                  text — which made the column labels compete with the
                  rows they label, and made these the only two tables in
                  the app that look like this. */}
              <tr className="border-b border-white/8 text-left text-[12px] font-semibold uppercase tracking-widest text-white/40">
                <th className="px-5 py-3 whitespace-nowrap">Name</th>
                <th className="px-5 py-3 whitespace-nowrap">Role</th>
                <th className="px-5 py-3 whitespace-nowrap">Model</th>
                {/* Only earns a column once the workspace has a choice. */}
                {numbers.length > 1 && <th className="px-5 py-3 whitespace-nowrap">Number</th>}
                <th className="px-5 py-3 text-right whitespace-nowrap">Actions</th>
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
          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-md bg-white/8 text-white/45">
            paused
          </span>
        )}
      </td>

      <td className="px-5 py-3.5 text-white/60">{assistant.role || "—"}</td>

      {/* The mark, not just the name. A row that read "gpt-5-mini ·
          OpenAI" in grey looked like a setting; it is the thing actually
          answering your customers, and at a glance it should say so. */}
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <BrandLogo
            slug={assistant.provider}
            brand={PROVIDER_BRAND[assistant.provider] ?? "#8B5CF6"}
            size={26}
          />
          <div className="min-w-0">
            <code className="block text-xs text-accent2-ink truncate">{assistant.model}</code>
            <span className="text-[12px] text-white/35">
              {providerById(assistant.provider)?.name ?? assistant.provider}
            </span>
          </div>
        </div>
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
              <span className="text-[12px] text-white/50 mr-1">Delete this assistant?</span>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="text-[12px] px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-[12px] px-2.5 py-1.5 rounded-lg border border-white/12 text-white/60 hover:bg-white/6 transition-colors"
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
    /* The shared dialog rather than another hand-rolled `fixed inset-0`.
       That shape has bitten this codebase before — it has no Escape key,
       it does not lock the page behind it, and it is laid out against
       the nearest ancestor with a backdrop-filter rather than against
       the window, which is how a dialog ends up clipped inside a card.
       One implementation means one place where that is right. */
    <Modal
      open
      onClose={onClose}
      title="Create AI assistant"
      description="Give it a name. The provider, the key, the instructions and its knowledge are all on the next screen, where there is room to explain what each one does."
      size="sm"
      dismissable={!pending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn-quiet text-sm disabled:opacity-50"
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
        </>
      }
    >
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
    </Modal>
  );
}
