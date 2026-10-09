"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Badge } from "@/components/ui/primitives";
import { deleteEmailTemplate, saveEmailTemplate } from "../actions";
import { VARIABLES, templateProblem } from "@/lib/email-compose";
import type { ActionResult } from "@/app/(dashboard)/actions";

// Writing an email, without writing HTML.
//
// The editor is four fields on purpose. A rich text box would let an
// operator paste styled markup out of a word processor, and what arrives
// in Outlook after that has been nested inside the table scaffolding the
// shell needs is not a slightly-off paragraph — it is a broken message.
// So: a subject, some paragraphs, and at most one button. The banner, the
// spacing, the footer and the unsubscribe are built around it.
//
// The problem is shown while typing rather than on submit. Half a button —
// a label with no link — is the kind of mistake that sends perfectly well
// and arrives missing the one thing the message was asking for.

export interface TemplateRow {
  id: string;
  name: string;
  subject: string;
  body: string;
  action_label: string | null;
  action_path: string | null;
  overrides_kind: string | null;
}

const EMPTY: TemplateRow = {
  id: "",
  name: "",
  subject: "",
  body: "",
  action_label: null,
  action_path: null,
  overrides_kind: null,
};

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs font-medium text-white/70 mb-1.5">{children}</span>;
}

const FIELD =
  "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-colors disabled:opacity-60";

export default function TemplateEditor({
  template,
  /** Set when this editor writes the wording of an automatic message. */
  overridesKind,
  defaultName,
  trigger,
  onResult,
}: {
  template?: TemplateRow;
  overridesKind?: string;
  /**
   * Fills in the name when writing the wording of an automatic message.
   *
   * Nobody opening "Rewrite" beside Trial follow-up wants to be asked
   * what to call it — the name is only ever shown back to them, and an
   * empty required field is the Save button greyed out for no reason
   * anybody would guess.
   */
  defaultName?: string;
  trigger: "new" | "edit" | "write";
  onResult?: (result: ActionResult) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateRow>(
    template ?? (defaultName ? { ...EMPTY, name: defaultName } : EMPTY)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = templateProblem({
    name: draft.name,
    subject: draft.subject,
    body: draft.body,
    actionLabel: draft.action_label,
    actionPath: draft.action_path,
  });

  const set = (patch: Partial<TemplateRow>) => setDraft((old) => ({ ...old, ...patch }));

  const save = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);

    const data = new FormData();
    if (draft.id) data.set("id", draft.id);
    data.set("name", draft.name);
    data.set("subject", draft.subject);
    data.set("body", draft.body);
    data.set("action_label", draft.action_label ?? "");
    data.set("action_path", draft.action_path ?? "");
    data.set("overrides_kind", overridesKind ?? draft.overrides_kind ?? "");

    const result = await saveEmailTemplate(data).catch(() => ({
      ok: false as const,
      error: "That could not be saved just now.",
    }));
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? "That could not be saved.");
      return;
    }
    setOpen(false);
    onResult?.(result);
    router.refresh();
  };

  const remove = async () => {
    if (!draft.id) return;
    if (
      !window.confirm(
        overridesKind
          ? "Delete this wording? The message goes back to what is built into the product."
          : `Delete "${draft.name}"?`
      )
    ) {
      return;
    }
    setBusy(true);
    const data = new FormData();
    data.set("id", draft.id);
    const result = await deleteEmailTemplate(data).catch(() => ({
      ok: false as const,
      error: "That could not be deleted just now.",
    }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "That could not be deleted.");
      return;
    }
    setOpen(false);
    onResult?.(result);
    router.refresh();
  };

  const button =
    trigger === "new" ? (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm">
        <Plus className="w-4 h-4" />
        New template
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-quiet btn-compact text-xs"
      >
        <Pencil className="w-3.5 h-3.5" />
        {trigger === "write" ? "Rewrite" : "Edit"}
      </button>
    );

  return (
    <>
      {button}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          overridesKind
            ? "Your wording for this message"
            : draft.id
              ? "Edit template"
              : "New template"
        }
        description={
          overridesKind
            ? "Replaces what the product says. Delete it and the built-in wording comes back — nothing is overwritten."
            : "The subject, the words, and at most one button. Everything around it — the banner, the footer, the unsubscribe — is added for you."
        }
        size="lg"
        dismissable={!busy}
        footer={
          <>
            {draft.id && (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="btn-danger btn-compact text-xs mr-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="btn-quiet text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || Boolean(problem)}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <Label>Name — only you see this</Label>
            <input
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              disabled={busy}
              placeholder="October offer"
              className={FIELD}
            />
          </label>

          <label className="block">
            <Label>Subject line</Label>
            <input
              value={draft.subject}
              onChange={(event) => set({ subject: event.target.value })}
              disabled={busy}
              placeholder="A month on us, if you come back this week"
              className={FIELD}
            />
          </label>

          <label className="block">
            <Label>Message — a blank line starts a new paragraph</Label>
            <textarea
              value={draft.body}
              onChange={(event) => set({ body: event.target.value })}
              disabled={busy}
              rows={10}
              placeholder={"Hi {{workspace}},\n\nWhat you want to say.\n\nAnything else."}
              className={`${FIELD} font-mono text-[13px] leading-relaxed`}
            />
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <Label>Button label — optional</Label>
              <input
                value={draft.action_label ?? ""}
                onChange={(event) => set({ action_label: event.target.value })}
                disabled={busy}
                placeholder="See plans"
                className={FIELD}
              />
            </label>
            <label className="block">
              <Label>Button goes to</Label>
              <input
                value={draft.action_path ?? ""}
                onChange={(event) => set({ action_path: event.target.value })}
                disabled={busy}
                placeholder="/billing"
                className={FIELD}
              />
            </label>
          </div>

          {/* The list is here rather than in a help page because the one
              moment somebody needs to know what they can type is while
              they are typing it. */}
          <div>
            <Label>What you can drop in</Label>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((variable) => (
                <span
                  key={variable.key}
                  title={variable.means}
                  className="px-2 py-0.5 rounded-lg border border-white/10 bg-white/4 font-mono text-[11.5px] text-white/55 cursor-help"
                >
                  {`{{${variable.key}}}`}
                </span>
              ))}
            </div>
            <p className="text-[12px] text-white/30 mt-2 leading-relaxed">
              Anything else in double braces arrives blank, so it is refused before you can save
              it.
            </p>
          </div>

          {problem && (
            <div className="flex items-start gap-2.5">
              <Badge tone="amber">not ready</Badge>
              <p className="text-xs text-white/60 leading-relaxed">{problem}</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
