"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2, Pause, Play, Plus, Trash2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import {
  deleteEventAutomation,
  saveEventAutomation,
  toggleEventAutomation,
} from "../event-actions";
import { MATCH_OPERATORS } from "@/lib/events";

// The rules: when this happens, send that.

export interface RuleRow {
  id: string;
  name: string;
  event_name: string;
  is_active: boolean;
  match_field: string | null;
  match_operator: string | null;
  match_value: string | null;
  action: string;
  template_id: string | null;
  template_language: string;
  variables: string[];
  campaign_id: string | null;
  tag: string | null;
  connection_id: string | null;
}

interface Choice {
  id: string;
  name: string;
  language?: string;
  status?: string;
}

export default function RuleList({
  rules,
  templates,
  campaigns,
  numbers,
  suggestions,
}: {
  rules: RuleRow[];
  templates: Choice[];
  campaigns: Choice[];
  numbers: { id: string; label: string }[];
  suggestions: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(id);
    const result = await action().catch(() => ({
      ok: false,
      error: "That did not go through.",
      message: undefined,
    }));
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? "That did not work.");
      return;
    }
    toast.success(result.message ?? "Done.");
    router.refresh();
  };

  const templateName = new Map(templates.map((row) => [row.id, row.name]));
  const campaignName = new Map(campaigns.map((row) => [row.id, row.name]));

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold">When this happens, send that</h2>
            <p className="text-xs text-white/45 mt-0.5">
              Each rule watches for one event and does one thing.
            </p>
          </div>
          <button type="button" onClick={() => setEditing("new")} className="btn-primary text-xs">
            <Plus className="w-3.5 h-3.5" />
            New rule
          </button>
        </div>

        {rules.length === 0 ? (
          <EmptyState
            title="No rules yet"
            description="Add one, or take a ready-made set for your trade from below."
          />
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => {
              // What this rule is still missing, said on the row rather
              // than discovered in the log at midnight. A rule from a
              // ready-made set arrives with nothing chosen, and until
              // this was here the only sign was a red line under an
              // event hours later.
              const missing =
                rule.action === "send_template" && !rule.template_id
                  ? "needs a message"
                  : rule.action === "start_sequence" && !rule.campaign_id
                    ? "needs a sequence"
                    : rule.action === "add_tag" && !(rule.tag ?? "").trim()
                      ? "needs a tag"
                      : null;

              return (
              <div
                key={rule.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3 rounded-xl border ${
                  missing
                    ? "border-[#C0A063]/30 bg-[#C0A063]/5"
                    : "border-white/8 bg-white/3"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{rule.name}</span>
                    <Badge tone={rule.is_active ? "green" : "grey"}>
                      {rule.is_active ? "listening" : "paused"}
                    </Badge>
                    {missing && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#C0A063]/15 text-[#C0A063]">
                        <AlertTriangle className="w-3 h-3" />
                        {missing}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
                    on <code className="text-accent-ink font-mono">{rule.event_name}</code>
                    {rule.match_field && rule.match_operator && (
                      <>
                        {" "}
                        where <span className="text-white/65">{rule.match_field}</span>{" "}
                        {MATCH_OPERATORS.find((o) => o.key === rule.match_operator)?.label ??
                          rule.match_operator}{" "}
                        <span className="text-white/65">{rule.match_value}</span>
                      </>
                    )}
                    {" → "}
                    {rule.action === "send_template"
                      ? `send ${templateName.get(rule.template_id ?? "") ?? "a template"}`
                      : rule.action === "start_sequence"
                        ? `start ${campaignName.get(rule.campaign_id ?? "") ?? "a sequence"}`
                        : `tag as ${rule.tag}`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={busy === rule.id}
                    onClick={() => setEditing(rule)}
                    className="text-xs font-medium text-accent-ink hover:underline px-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy === rule.id}
                    onClick={() => {
                      const body = new FormData();
                      body.set("id", rule.id);
                      body.set("is_active", String(rule.is_active));
                      return run(rule.id, () => toggleEventAutomation(body));
                    }}
                    className="btn-quiet text-xs py-1.5 px-2.5 disabled:opacity-50"
                  >
                    {busy === rule.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : rule.is_active ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busy === rule.id}
                    onClick={() => {
                      if (!confirm(`Delete “${rule.name}”?`)) return;
                      const body = new FormData();
                      body.set("id", rule.id);
                      return run(rule.id, () => deleteEventAutomation(body));
                    }}
                    className="btn-quiet text-xs py-1.5 px-2.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </Card>

      {editing && (
        <RuleEditor
          rule={editing === "new" ? null : editing}
          templates={templates}
          campaigns={campaigns}
          numbers={numbers}
          suggestions={suggestions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function RuleEditor({
  rule,
  templates,
  campaigns,
  numbers,
  suggestions,
  onClose,
  onSaved,
}: {
  rule: RuleRow | null;
  templates: Choice[];
  campaigns: Choice[];
  numbers: { id: string; label: string }[];
  suggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(rule?.action ?? "send_template");
  const [hasCondition, setHasCondition] = useState(Boolean(rule?.match_field));

  const field =
    "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";
  const label = "block text-xs font-medium text-white/70 mb-1.5";

  const save = async (formData: FormData) => {
    setBusy(true);
    const result = await saveEventAutomation(formData).catch(() => ({
      ok: false as const,
      error: "That could not be saved.",
    }));
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error ?? "That could not be saved.");
      return;
    }
    toast.success(result.message ?? "Saved.");
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? "Edit rule" : "New rule"}
      description="One event in, one thing out."
      size="lg"
      dismissable={!busy}
    >
      <form action={save} className="space-y-4">
        {rule && <input type="hidden" name="id" value={rule.id} />}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Name it</label>
            <input
              name="name"
              className={field}
              defaultValue={rule?.name ?? ""}
              placeholder="Bill paid — send the receipt"
              required
            />
          </div>
          <div>
            <label className={label}>Listens for</label>
            <input
              name="event_name"
              className={field}
              defaultValue={rule?.event_name ?? ""}
              placeholder="bill.paid"
              list="rule-event-names"
              spellCheck={false}
              required
            />
            <datalist id="rule-event-names">
              {suggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>
        </div>

        {/* --- optional condition --------------------------------- */}
        <div className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-3">
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={hasCondition}
              onChange={(e) => setHasCondition(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-white/80">Only when something is true</span>
          </label>

          {hasCondition ? (
            <div className="grid sm:grid-cols-3 gap-2">
              <input
                name="match_field"
                className={field}
                defaultValue={rule?.match_field ?? ""}
                placeholder="data.total"
              />
              <select
                name="match_operator"
                className={field}
                defaultValue={rule?.match_operator ?? "gt"}
              >
                {MATCH_OPERATORS.map((operator) => (
                  <option key={operator.key} value={operator.key}>
                    {operator.label}
                  </option>
                ))}
              </select>
              <input
                name="match_value"
                className={field}
                defaultValue={rule?.match_value ?? ""}
                placeholder="2000"
              />
            </div>
          ) : (
            <p className="text-[11px] text-white/40 leading-relaxed">
              Off means it runs every time that event arrives, which is what most rules want.
            </p>
          )}
        </div>

        {/* --- what it does --------------------------------------- */}
        <div>
          <label className={label}>Then</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "send_template", label: "Send a message" },
              { key: "start_sequence", label: "Start a sequence" },
              { key: "add_tag", label: "Add a tag" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setAction(option.key)}
                className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                  action === option.key
                    ? "border-accent/50 bg-accent/10 text-accent-ink"
                    : "border-white/12 bg-white/4 text-white/60 hover:border-white/25"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="action" value={action} />
        </div>

        {action === "send_template" && (
          <div className="space-y-3">
            <div>
              <label className={label}>Which message</label>
              <select name="template_id" className={field} defaultValue={rule?.template_id ?? ""}>
                <option value="">Choose a template…</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.language})
                  </option>
                ))}
              </select>
              {templates.length === 0 && (
                <p className="text-[11px] text-[#C0A063]/85 mt-1.5 leading-relaxed">
                  No approved templates yet. The person being messaged has not written to you, so
                  WhatsApp only allows an approved template.
                </p>
              )}
            </div>

            <div>
              <label className={label}>Fill the blanks, one per line</label>
              <textarea
                name="variables"
                className={`${field} font-mono text-xs min-h-[80px]`}
                defaultValue={(rule?.variables ?? []).join("\n")}
                placeholder={"{{data.customer_name}}\n{{data.total}}"}
                spellCheck={false}
              />
              <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
                In order, one per blank. Anything from the event works — this is how the message
                says the customer&rsquo;s own name, which a broadcast can never do.
              </p>
            </div>

            <div>
              <label className={label}>Send from</label>
              <select name="connection_id" className={field} defaultValue={rule?.connection_id ?? ""}>
                <option value="">Default number</option>
                {numbers.map((number) => (
                  <option key={number.id} value={number.id}>
                    {number.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {action === "start_sequence" && (
          <div>
            <label className={label}>Which sequence</label>
            <select name="campaign_id" className={field} defaultValue={rule?.campaign_id ?? ""}>
              <option value="">Choose a sequence…</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} {campaign.status !== "active" ? `(${campaign.status})` : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
              Use this for anything with a delay — thank you now, review tomorrow, offer next
              month. Somebody who comes back starts it again.
            </p>
          </div>
        )}

        {action === "add_tag" && (
          <div>
            <label className={label}>Tag to add</label>
            <input name="tag" className={field} defaultValue={rule?.tag ?? ""} placeholder="regular" />
          </div>
        )}

        <label className="flex items-center gap-2.5 text-sm cursor-pointer pt-1">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={rule?.is_active ?? false}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-white/80">Listening</span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-white/8">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary text-sm">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn-primary text-sm disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
