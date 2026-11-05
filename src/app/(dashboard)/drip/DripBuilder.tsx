"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  ArrowDown,
  Clock,
  Info,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { saveDrip } from "../drip-actions";
import { ModalShell } from "@/components/ui/Modal";
import {
  DEFAULT_SETTINGS,
  MAX_STEPS,
  TRIGGERS,
  WAIT_PRESETS,
  clockLabel,
  describeWait,
  minutesFrom,
  normaliseKeywords,
  sequenceProblem,
  settingsProblem,
  splitMinutes,
  type DripSettings,
  type DripStep,
  type TriggerType,
} from "@/lib/drip";

// The sequence builder.
//
// One screen rather than a wizard, because a drip is a list and the thing
// somebody needs to see while editing step four is steps one to three. A
// wizard hides exactly the context the decision needs.
//
// The wait sits under the template it follows and reads "then wait 2
// days", which is the sentence somebody says out loud when describing the
// sequence. Written the other way round — a delay above each message — it
// has to be read backwards to work out when anything actually goes.

export interface TemplateChoice {
  id: string;
  name: string;
  language: string;
  status: string;
  variables: number;
}

export interface NumberChoice {
  id: string;
  label: string;
}

export interface DripDraft {
  id?: string;
  name: string;
  description: string;
  connectionId: string;
  settings: DripSettings;
  steps: DripStep[];
}

const blankStep = (index: number): DripStep => ({
  stepIndex: index,
  templateId: null,
  variables: [],
  waitKind: "duration",
  waitMinutes: 24 * 60,
  sendAtMinutes: 600,
  sendAtDays: 1,
});

export const emptyDraft = (): DripDraft => ({
  name: "",
  description: "",
  connectionId: "",
  settings: { ...DEFAULT_SETTINGS },
  steps: [blankStep(1)],
});

export default function DripBuilder({
  draft: initial,
  templates,
  numbers,
  onClose,
}: {
  draft: DripDraft;
  templates: TemplateChoice[];
  numbers: NumberChoice[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<DripDraft>(initial);
  const [saving, setSaving] = useState(false);

  const steps = draft.steps;
  const problem = useMemo(
    () => sequenceProblem(steps) ?? settingsProblem(draft.settings),
    [steps, draft.settings]
  );

  const patch = (changes: Partial<DripDraft>) => setDraft((current) => ({ ...current, ...changes }));
  const patchSettings = (changes: Partial<DripSettings>) =>
    setDraft((current) => ({ ...current, settings: { ...current.settings, ...changes } }));

  const patchStep = (index: number, changes: Partial<DripStep>) =>
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, i) => (i === index ? { ...step, ...changes } : step)),
    }));

  const addStep = () =>
    setDraft((current) =>
      current.steps.length >= MAX_STEPS
        ? current
        : { ...current, steps: [...current.steps, blankStep(current.steps.length + 1)] }
    );

  const removeStep = (index: number) =>
    setDraft((current) => ({
      ...current,
      steps: current.steps
        .filter((_, i) => i !== index)
        .map((step, i) => ({ ...step, stepIndex: i + 1 })),
    }));

  const save = async (activate: boolean) => {
    setSaving(true);
    const result = await saveDrip({
      id: draft.id,
      name: draft.name,
      description: draft.description,
      connectionId: draft.connectionId || null,
      settings: draft.settings,
      steps: draft.steps,
      activate,
    }).catch(() => ({ ok: false, error: "That could not be saved just now.", message: undefined }));
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error ?? "That could not be saved.");
      return;
    }
    toast.success(result.message ?? "Saved.");
    onClose();
    router.refresh();
  };

  const field =
    "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";
  const label = "block text-xs font-medium text-white/70 mb-1.5";

  return (
    <ModalShell open onClose={onClose} label="Drip sequence" dismissable={!saving}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-5xl rounded-3xl border border-white/10 bg-[var(--app-bg)] shadow-2xl my-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <h2 className="font-semibold">
              {draft.id ? "Edit sequence" : "New drip sequence"}
            </h2>
            <p className="text-xs text-white/45 mt-0.5">
              A series of follow-ups, sent one at a time to each person who joins.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/8 text-white/50 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 p-6">
          {/* ------------------------------------------------ the sequence */}
          <div className="space-y-5 min-w-0">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>Name</label>
                <input
                  className={field}
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="New lead follow-up"
                />
              </div>
              <div>
                <label className={label}>Send from</label>
                <select
                  className={field}
                  value={draft.connectionId}
                  onChange={(e) => patch({ connectionId: e.target.value })}
                >
                  <option value="">Default number</option>
                  {numbers.map((number) => (
                    <option key={number.id} value={number.id}>
                      {number.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={label}>Brief description</label>
              <textarea
                className={`${field} min-h-[64px]`}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="What this sequence is for, so somebody else on the team knows before switching it on."
              />
            </div>

            {/* --- trigger -------------------------------------------- */}
            <div>
              <label className={label}>How people join</label>
              <div className="grid grid-cols-3 gap-2">
                {TRIGGERS.map((trigger) => (
                  <button
                    key={trigger.key}
                    type="button"
                    onClick={() => patchSettings({ trigger: trigger.key as TriggerType })}
                    className={`rounded-xl border px-3 py-3 text-left transition-all ${
                      draft.settings.trigger === trigger.key
                        ? "border-accent/50 bg-accent/10"
                        : "border-white/12 bg-white/4 hover:border-white/20"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{trigger.label}</span>
                    <span className="block text-[11px] text-white/45 mt-0.5 leading-snug">
                      {trigger.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {draft.settings.trigger === "keyword" && (
              <KeywordBox
                label="Join keywords"
                hint="Somebody who messages exactly one of these joins the sequence."
                values={draft.settings.triggerKeywords}
                onChange={(triggerKeywords) => patchSettings({ triggerKeywords })}
              />
            )}

            {/* --- exits ---------------------------------------------- */}
            <div className="rounded-2xl border border-white/10 bg-white/3 p-4 space-y-3">
              <h3 className="text-sm font-semibold">How people leave</h3>

              <Toggle
                checked={draft.settings.exitOnReply}
                onChange={(exitOnReply) => patchSettings({ exitOnReply })}
                title="Stop when they reply"
                hint="Any message at all takes them out. Right for a nurture sequence, wrong for a reminder."
              />

              <Toggle
                checked={draft.settings.exitOnKeyword}
                onChange={(exitOnKeyword) => patchSettings({ exitOnKeyword })}
                title="Stop on an exit keyword"
                hint="Only the exact words below take them out."
              />

              {draft.settings.exitOnKeyword && (
                <KeywordBox
                  label="Exit keywords"
                  hint="Contact sends any of these → taken out of the sequence."
                  values={draft.settings.exitKeywords}
                  onChange={(exitKeywords) => patchSettings({ exitKeywords })}
                />
              )}

              <Toggle
                checked={draft.settings.skipMissedSteps}
                onChange={(skipMissedSteps) => patchSettings({ skipMissedSteps })}
                title="Skip missed timed steps"
                hint="When somebody joins after a step's hour has passed: skip it, rather than sending it the next day."
              />
            </div>

            {/* --- steps ---------------------------------------------- */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Message sequence</h3>

              {steps.map((step, index) => {
                const isLast = index === steps.length - 1;
                const duration = splitMinutes(step.waitMinutes);

                return (
                  <div key={index} className="relative">
                    <div className="rounded-2xl border border-white/10 bg-white/4 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/60">
                          <span className="w-6 h-6 rounded-full bg-accent/15 text-accent-ink flex items-center justify-center text-[11px] font-bold">
                            {index + 1}
                          </span>
                          Step {index + 1}
                          {index === 0 && (
                            <span className="text-[11px] font-normal text-white/35">
                              — goes out the moment somebody joins
                            </span>
                          )}
                        </span>
                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStep(index)}
                            className="p-1.5 rounded-lg text-white/35 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            aria-label={`Remove step ${index + 1}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div>
                        <label className={label}>Template</label>
                        <select
                          className={field}
                          value={step.templateId ?? ""}
                          onChange={(e) =>
                            patchStep(index, {
                              templateId: e.target.value || null,
                              variables: [],
                            })
                          }
                        >
                          <option value="">
                            {templates.length ? "Select an approved template…" : "No approved templates yet"}
                          </option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} · {template.language}
                              {template.variables > 0 ? ` · ${template.variables} variable${template.variables === 1 ? "" : "s"}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      <StepVariables
                        step={step}
                        template={templates.find((t) => t.id === step.templateId)}
                        onChange={(variables) => patchStep(index, { variables })}
                      />

                      {/* The wait belongs to the step it follows, and is
                          never read on the last one because nothing
                          comes after it. */}
                      {!isLast && (
                        <div className="pt-1 border-t border-white/8">
                          <label className={label}>Then wait</label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            <button
                              type="button"
                              onClick={() => patchStep(index, { waitKind: "duration" })}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                step.waitKind === "duration"
                                  ? "bg-accent/15 text-accent-ink border border-accent/35"
                                  : "bg-white/5 border border-white/12 text-white/55"
                              }`}
                            >
                              Wait duration
                            </button>
                            <button
                              type="button"
                              onClick={() => patchStep(index, { waitKind: "time_of_day" })}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                step.waitKind === "time_of_day"
                                  ? "bg-accent/15 text-accent-ink border border-accent/35"
                                  : "bg-white/5 border border-white/12 text-white/55"
                              }`}
                            >
                              At a specific time
                            </button>
                          </div>

                          {step.waitKind === "duration" ? (
                            <div className="space-y-2">
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  className={`${field} w-24`}
                                  value={duration.value}
                                  onChange={(e) =>
                                    patchStep(index, {
                                      waitMinutes: minutesFrom(Number(e.target.value), duration.unit),
                                    })
                                  }
                                />
                                <select
                                  className={`${field} w-32`}
                                  value={duration.unit}
                                  onChange={(e) =>
                                    patchStep(index, {
                                      waitMinutes: minutesFrom(
                                        duration.value,
                                        e.target.value as "minutes" | "hours" | "days"
                                      ),
                                    })
                                  }
                                >
                                  <option value="minutes">minutes</option>
                                  <option value="hours">hours</option>
                                  <option value="days">days</option>
                                </select>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {WAIT_PRESETS.map((preset) => (
                                  <button
                                    key={preset.minutes}
                                    type="button"
                                    onClick={() => patchStep(index, { waitMinutes: preset.minutes })}
                                    className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-white/55 hover:border-accent/30 hover:text-white transition-colors"
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-end gap-2">
                              <div>
                                <span className="block text-[11px] text-white/45 mb-1">Days later</span>
                                <input
                                  type="number"
                                  min={0}
                                  className={`${field} w-24`}
                                  value={step.sendAtDays}
                                  onChange={(e) =>
                                    patchStep(index, { sendAtDays: Math.max(0, Number(e.target.value) || 0) })
                                  }
                                />
                              </div>
                              <div>
                                <span className="block text-[11px] text-white/45 mb-1">At</span>
                                <input
                                  type="time"
                                  className={`${field} w-32`}
                                  value={clockLabel(step.sendAtMinutes)}
                                  onChange={(e) => {
                                    const [h = "0", m = "0"] = e.target.value.split(":");
                                    patchStep(index, {
                                      sendAtMinutes: Number(h) * 60 + Number(m),
                                    });
                                  }}
                                />
                              </div>
                              <span className="text-[11px] text-white/40 pb-3">
                                {draft.settings.timeZone}
                              </span>
                            </div>
                          )}

                          <p className="text-[11px] text-white/40 mt-2 inline-flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {describeWait(step)}
                          </p>
                        </div>
                      )}
                    </div>

                    {!isLast && (
                      <div className="flex justify-center py-1">
                        <ArrowDown className="w-4 h-4 text-white/20" />
                      </div>
                    )}
                  </div>
                );
              })}

              {steps.length < MAX_STEPS && (
                <button
                  type="button"
                  onClick={addStep}
                  className="w-full py-3 rounded-2xl border border-dashed border-white/15 text-sm text-white/50 hover:border-accent/35 hover:text-white transition-colors inline-flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add a step
                </button>
              )}
            </div>
          </div>

          {/* --------------------------------------------------- the rail */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/4 p-4 space-y-2.5">
              <button
                type="button"
                disabled={saving || Boolean(problem)}
                onClick={() => void save(true)}
                className="btn-primary w-full justify-center py-3 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save and switch on"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(false)}
                className="w-full py-2.5 rounded-xl border border-white/12 text-sm text-white/65 hover:border-white/25 hover:text-white transition-colors disabled:opacity-50"
              >
                Save as a draft
              </button>
              {problem && <p className="text-[12px] text-[#FACC15]/85 leading-relaxed">{problem}</p>}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/3 p-4">
              <h3 className="text-sm font-semibold inline-flex items-center gap-2 mb-2.5">
                <Info className="w-3.5 h-3.5 text-accent-ink" />
                How it works
              </h3>
              <ol className="space-y-2 text-[12px] text-white/55 leading-relaxed">
                <li>
                  <span className="text-white/75 font-medium">1.</span> Somebody joins — by keyword,
                  by you adding them, or through the API.
                </li>
                <li>
                  <span className="text-white/75 font-medium">2.</span> Step one goes out straight
                  away. Once it is delivered, the next one is scheduled from the wait you set.
                </li>
                <li>
                  <span className="text-white/75 font-medium">3.</span> An exit keyword, or a reply
                  if you switched that on, takes them out.
                </li>
                <li>
                  <span className="text-white/75 font-medium">4.</span> Anybody who has opted out is
                  dropped automatically, whatever step they are on.
                </li>
              </ol>
            </div>

            <p className="text-[11px] text-white/35 leading-relaxed px-1">
              Every step sends an approved template. These reach people outside the 24-hour window,
              where WhatsApp refuses free text — which is the whole reason a sequence has to be
              built from templates rather than typed.
            </p>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// --- small parts -----------------------------------------------------------

function Toggle({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 w-full text-left"
    >
      <span
        className={`mt-0.5 w-9 h-5 rounded-full shrink-0 transition-colors relative ${
          checked ? "bg-accent" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-[11.5px] text-white/45 leading-snug">{hint}</span>
      </span>
    </button>
  );
}

function KeywordBox({
  label,
  hint,
  values,
  onChange,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [typed, setTyped] = useState("");

  const add = () => {
    const next = normaliseKeywords([...values, typed]);
    onChange(next);
    setTyped("");
  };

  return (
    <div>
      <label className="block text-xs font-medium text-white/70 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((word) => (
          <span
            key={word}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/12 border border-accent/25 text-[12px] text-accent-ink"
          >
            {word}
            <button
              type="button"
              onClick={() => onChange(values.filter((value) => value !== word))}
              aria-label={`Remove ${word}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={() => typed.trim() && add()}
        placeholder="Type a word and press Enter…"
        className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
      />
      <p className="text-[11px] text-white/40 mt-1.5">{hint}</p>
    </div>
  );
}

/**
 * The values for a template's variables.
 *
 * Shown only when the chosen template declares any. A sequence sent with
 * the wrong number of them is refused by Meta for every single person in
 * it, which is the failure this box exists to prevent.
 */
function StepVariables({
  step,
  template,
  onChange,
}: {
  step: DripStep;
  template: TemplateChoice | undefined;
  onChange: (values: string[]) => void;
}) {
  if (!template || template.variables === 0) return null;

  const values = Array.from({ length: template.variables }, (_, i) => step.variables[i] ?? "");

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-white/70">
        Values for {template.name}
      </span>
      {values.map((value, i) => (
        <input
          key={i}
          value={value}
          onChange={(e) => {
            const next = [...values];
            next[i] = e.target.value;
            onChange(next);
          }}
          placeholder={`Value for {{${i + 1}}}`}
          className="w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
        />
      ))}
    </div>
  );
}
