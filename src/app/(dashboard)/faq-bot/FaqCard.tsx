"use client";

import { useState } from "react";
import { Pencil, Phone, X } from "lucide-react";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { Card, Badge } from "@/components/ui/primitives";
import { saveFaqEntry, deleteFaqEntry, toggleFaqEntry } from "../portal-actions";
import type { FaqEntry } from "@/types/portal";

export interface FaqNumber {
  id: string;
  label: string;
}

/**
 * One answer, readable at a glance and editable in place.
 *
 * Editing was the missing half of this screen. An answer with a typo in
 * it, or a price that had changed, could be deleted and retyped and
 * nothing else — which throws away the keywords, and the keywords are
 * the part that took the thought.
 */
export default function FaqCard({
  entry,
  numbers,
}: {
  entry: FaqEntry & { connection_id?: string | null };
  numbers: FaqNumber[];
}) {
  const [editing, setEditing] = useState(false);

  const onNumber = entry.connection_id
    ? (numbers.find((number) => number.id === entry.connection_id)?.label ?? "a number that is gone")
    : null;

  if (editing) {
    return (
      <Card className="border-accent/30">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold text-sm">Editing this answer</h3>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="btn-quiet btn-compact"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
        </div>

        <ActionForm action={saveFaqEntry} submitLabel="Save changes">
          <input type="hidden" name="id" value={entry.id} />
          <div className="space-y-4">
            <Field label="Question" name="question" required defaultValue={entry.question} />
            <TextareaField label="Answer" name="answer" rows={4} required defaultValue={entry.answer} />
            <Field
              label="Keywords"
              name="keywords"
              defaultValue={entry.keywords.join(", ")}
              hint="Comma separated. These decide when this answer is used."
            />
            <Field label="Category" name="category" defaultValue={entry.category ?? ""} />
            {numbers.length > 1 && (
              <SelectField
                label="Answer on"
                name="connection_id"
                defaultValue={entry.connection_id ?? ""}
                options={[
                  { value: "", label: "Every number" },
                  ...numbers.map((number) => ({ value: number.id, label: number.label })),
                ]}
              />
            )}
          </div>
        </ActionForm>
      </Card>
    );
  }

  return (
    <Card className={entry.is_active ? "" : "opacity-60"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h3 className="font-semibold text-sm">{entry.question}</h3>
            {entry.category && <Badge tone="blue">{entry.category}</Badge>}
            {entry.hit_count > 0 && <Badge tone="green">{entry.hit_count} answered</Badge>}
            {!entry.is_active && <Badge tone="grey">paused</Badge>}
          </div>

          <p className="text-sm text-white/55 whitespace-pre-wrap">{entry.answer}</p>

          {/* Which number this answers on. A workspace running two
              businesses needs to see this without opening the editor —
              it is the difference between the right shop's hours and the
              wrong one's. */}
          {numbers.length > 1 && (
            <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-white/40">
              <Phone className="w-3 h-3" />
              {onNumber ? `Only on ${onNumber}` : "Every number"}
            </div>
          )}

          {entry.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {entry.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/45"
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          <button type="button" onClick={() => setEditing(true)} className="btn-primary btn-compact">
            <Pencil className="w-3 h-3" />
            Edit
          </button>

          <ActionForm
            action={toggleFaqEntry}
            submitLabel={entry.is_active ? "Pause" : "Resume"}
            variant="quiet"
            compact
          >
            <input type="hidden" name="id" value={entry.id} />
            <input type="hidden" name="is_active" value={entry.is_active ? "0" : "1"} />
          </ActionForm>

          <ActionForm action={deleteFaqEntry} submitLabel="Delete" variant="danger" compact>
            <input type="hidden" name="id" value={entry.id} />
          </ActionForm>
        </div>
      </div>
    </Card>
  );
}
