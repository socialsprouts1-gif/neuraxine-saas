"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { removeTemplate, syncTemplates } from "@/app/(dashboard)/campaign-actions";
import TemplateBuilder, { type TemplateTarget } from "./TemplateBuilder";
import { specFromRow, type StoredTemplate } from "@/lib/template-spec";

/**
 * The two things this screen does besides list: submit a new template, and
 * pull Meta's verdict on the ones already submitted.
 *
 * Sync exists because approval is asynchronous and Meta never calls back —
 * without it a template stays "pending" on screen hours after it went live.
 */
export function TemplateToolbar({ numbers = [] }: { numbers?: TemplateTarget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sync = () =>
    startTransition(async () => {
      const result = await syncTemplates();
      setNote(result.ok ? (result.message ?? "Synced.") : (result.error ?? "Sync failed."));
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {note && <span className="text-xs text-white/50 mr-1 max-w-xs">{note}</span>}
        <button type="button" onClick={sync} disabled={pending} className="btn-secondary text-sm">
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Sync with Meta
        </button>
        <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" />
          Create template
        </button>
      </div>

      {open && <TemplateBuilder numbers={numbers} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Deleting removes the template at Meta too, so it is confirmed rather than
 * one click — the name cannot be reused for 30 days afterwards.
 */
export function DeleteTemplateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

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
              await removeTemplate(data);
              router.refresh();
            })
          }
          className="text-[11px] px-2 py-1 rounded-lg bg-[#F87171]/12 text-[#F87171] border border-[#F87171]/25"
        >
          {pending ? "Deleting…" : "Delete"}
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
      aria-label={`Delete ${name}`}
      className="p-1.5 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8 transition-colors"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}


/**
 * Reopens a saved template in the builder.
 *
 * Every part of a template is stored separately for this reason, but until
 * now nothing mounted the builder with them: a template Meta refused could
 * only be deleted and retyped, which is the worst moment to lose the work.
 *
 * Rendered twice per row — around the name, because that is what people try
 * to click, and as a pencil beside delete, because a name that opens an
 * editor is not discoverable on its own.
 */
export function EditTemplateButton({
  template,
  liveAtMeta,
  variant,
  numbers = [],
}: {
  template: StoredTemplate;
  liveAtMeta: boolean;
  variant: "name" | "icon";
  numbers?: TemplateTarget[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "name" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-left group"
          title={`Open ${template.name}`}
        >
          <code className="text-accent2-ink text-xs group-hover:underline underline-offset-2">
            {template.name}
          </code>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${template.name}`}
          className="p-1.5 rounded-lg text-white/30 hover:text-accent-ink hover:bg-white/8 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}

      {open && (
        <TemplateBuilder
          initial={specFromRow(template)}
          numbers={numbers}
          liveAtMeta={liveAtMeta}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
