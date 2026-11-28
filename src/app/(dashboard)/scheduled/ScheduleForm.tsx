"use client";

import { useState } from "react";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { variableCount } from "@/lib/template-variables";
import type { ActionResult } from "@/app/(dashboard)/actions";

// Scheduling a message, with or without a template.
//
// A client component because the number of variable boxes depends on
// which template is chosen, and a template with three placeholders sent
// with two values is refused by Meta with an error the business reads as
// "WhatsApp is broken". The boxes follow the choice, so the count cannot
// be wrong.

export interface ScheduleTemplate {
  name: string;
  language: string;
  bodyText: string;
}

export interface ScheduleContact {
  id: string;
  label: string;
}

export interface ScheduleConnection {
  id: string;
  label: string;
}

export default function ScheduleForm({
  action,
  contacts,
  connections,
  templates,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  contacts: ScheduleContact[];
  connections: ScheduleConnection[];
  templates: ScheduleTemplate[];
}) {
  const [useTemplate, setUseTemplate] = useState(false);
  const [templateName, setTemplateName] = useState(templates[0]?.name ?? "");

  const chosen = templates.find((template) => template.name === templateName) ?? null;
  const needed = chosen ? variableCount(chosen.bodyText) : 0;

  return (
    <>
      <p className="text-xs text-white/45 mb-5 leading-relaxed">
        {useTemplate ? (
          <>
            A template goes out whatever the time — that is what templates are for. Meta has
            already approved the wording, so only the values in it can change.
          </>
        ) : (
          <>
            A plain message only reaches someone who wrote to you within 24 hours of the send
            time — WhatsApp&apos;s rule, not ours. Sending days later needs a template.
          </>
        )}
      </p>

      {/* The choice, above everything, because it changes what the rest of
          the form means. */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 mb-5">
        <button
          type="button"
          onClick={() => setUseTemplate(false)}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            !useTemplate ? "bg-white/12 text-white" : "text-white/50 hover:text-white/75"
          }`}
        >
          Plain message
        </button>
        <button
          type="button"
          onClick={() => setUseTemplate(true)}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            useTemplate ? "bg-white/12 text-white" : "text-white/50 hover:text-white/75"
          }`}
        >
          Approved template
        </button>
      </div>

      <ActionForm action={action} submitLabel="Schedule it" resetOnSuccess>
        <SelectField
          label="Contact"
          name="contact_id"
          options={[
            { value: "", label: "Type a number instead" },
            ...contacts.map((contact) => ({ value: contact.id, label: contact.label })),
          ]}
        />

        <Field
          label="Or a number"
          name="wa_id"
          placeholder="919876543210"
          hint="Country code first, no + and no spaces. Ignored when a contact is picked above."
        />

        {connections.length > 1 && (
          <>
            <SelectField
              label="Send from"
              name="connection_id"
              options={connections.map((connection) => ({
                value: connection.id,
                label: connection.label,
              }))}
            />
            <p className="text-[12px] text-white/35 -mt-2 leading-relaxed">
              Send from the number the customer already knows. One arriving from a number they
              have never written to reads as a stranger.
            </p>
          </>
        )}

        <Field
          label="Send at"
          name="send_at"
          type="datetime-local"
          required
          hint="At least a minute from now. To send straight away, use the inbox."
        />

        {useTemplate ? (
          templates.length === 0 ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200/90 leading-relaxed">
              No approved templates on this workspace yet. Create one under Templates and wait
              for Meta to approve it — usually minutes, sometimes a day.
            </div>
          ) : (
            <>
              <SelectField
                label="Template"
                name="template_name"
                value={templateName}
                onChange={(value) => setTemplateName(value)}
                options={templates.map((template) => ({
                  value: template.name,
                  label: `${template.name} · ${template.language}`,
                }))}
              />

              {chosen && (
                <div className="rounded-xl border border-white/10 bg-white/4 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-white/35 mb-1.5">
                    Approved wording
                  </p>
                  <p className="text-[13px] text-white/75 whitespace-pre-wrap leading-relaxed">
                    {chosen.bodyText || "This template has no body text."}
                  </p>
                </div>
              )}

              {/* One box per placeholder. Generated from the template
                  rather than typed as a list, because a template with
                  three placeholders given two values is refused by Meta
                  at send time — hours after anybody could fix it. */}
              {Array.from({ length: needed }, (_, index) => (
                <Field
                  key={index}
                  label={`Value for {{${index + 1}}}`}
                  name={`var_${index + 1}`}
                  required
                  placeholder={index === 0 ? "Priya" : ""}
                />
              ))}

              {needed === 0 && chosen && (
                <p className="text-[12px] text-white/35 leading-relaxed">
                  This template has no variables, so it sends exactly as written above.
                </p>
              )}
            </>
          )
        ) : (
          <TextareaField
            label="Message"
            name="body"
            required
            rows={5}
            placeholder="Just following up on the quote I sent — happy to go through it whenever suits."
          />
        )}
      </ActionForm>
    </>
  );
}
