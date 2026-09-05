"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Plus,
  Send,
  Trash2,
  Type,
} from "lucide-react";
import {
  COMPONENT_KINDS,
  FLOW_CATEGORIES,
  INPUT_TYPES,
  LIMITS,
  isAnswering,
  isChoosing,
  labelLimit,
  newField,
  newScreen,
  normaliseFieldName,
  textLimit,
  uniqueName,
  validateFlow,
  type ComponentKind,
  type FormField,
  type FormScreen,
  type InputType,
} from "@/lib/flow-json";
import { publishForm, saveForm, sendForm, syncForm } from "../flow-actions";

/** What each component is called in the editor, in plain words. */
const KIND_LABELS: Record<ComponentKind, string> = {
  TextHeading: "Large Heading",
  TextSubheading: "Small Heading",
  TextBody: "Paragraph",
  TextCaption: "Caption",
  TextInput: "Text Input",
  TextArea: "Long Text",
  Dropdown: "Dropdown",
  RadioButtonsGroup: "Single Choice",
  CheckboxGroup: "Multiple Choice",
  DatePicker: "Date Picker",
  OptIn: "Consent Checkbox",
};

const TEXT_KINDS: ComponentKind[] = [
  "TextHeading",
  "TextSubheading",
  "TextBody",
  "TextCaption",
];

export default function FlowBuilder({
  id,
  initialName,
  initialCategory,
  initialScreens,
  status,
  previewUrl,
  metaFlowId,
}: {
  id: string;
  initialName: string;
  initialCategory: string;
  initialScreens: FormScreen[];
  status: string;
  previewUrl: string | null;
  metaFlowId: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [screens, setScreens] = useState<FormScreen[]>(
    initialScreens.length > 0 ? initialScreens : [seedScreen()]
  );
  const [activeKey, setActiveKey] = useState(
    initialScreens[0]?.key ?? screens[0]?.key ?? ""
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [publishing, startPublishing] = useTransition();
  const [sendOpen, setSendOpen] = useState(false);

  const active = screens.find((screen) => screen.key === activeKey) ?? screens[0];
  const validation = useMemo(() => validateFlow(screens), [screens]);

  const patchScreen = (key: string, patch: Partial<FormScreen>) =>
    setScreens((current) =>
      current.map((screen) => (screen.key === key ? { ...screen, ...patch } : screen))
    );

  const patchField = (fieldKey: string, patch: Partial<FormField>) =>
    patchScreen(active.key, {
      fields: active.fields.map((field) =>
        field.key === fieldKey ? { ...field, ...patch } : field
      ),
    });

  const addField = (kind: ComponentKind) =>
    patchScreen(active.key, {
      fields: [...active.fields, newField(kind, allFields(screens))],
    });

  const removeField = (fieldKey: string) =>
    patchScreen(active.key, {
      fields: active.fields.filter((field) => field.key !== fieldKey),
    });

  const addScreen = () => {
    const screen = newScreen(screens.length);
    setScreens([...screens, screen]);
    setActiveKey(screen.key);
  };

  const removeScreen = (key: string) => {
    const remaining = screens.filter((screen) => screen.key !== key);
    setScreens(remaining.length > 0 ? remaining : [seedScreen()]);
    setActiveKey(remaining[0]?.key ?? "");
  };

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const save = () =>
    startSaving(async () => {
      const result = await saveForm({ id, name, categories: [category], screens });
      setNote({
        tone: result.ok ? "ok" : "bad",
        text: result.ok ? (result.message ?? "Saved.") : (result.error ?? "Could not save."),
      });
      router.refresh();
    });

  const publish = () =>
    startPublishing(async () => {
      // Save first: publishing sends whatever Meta last received, so an
      // unsaved edit would go live as the previous version.
      const saved = await saveForm({ id, name, categories: [category], screens });
      if (!saved.ok) {
        setNote({ tone: "bad", text: saved.error ?? "Could not save." });
        return;
      }
      const result = await publishForm(id);
      setNote({
        tone: result.ok ? "ok" : "bad",
        text: result.ok ? (result.message ?? "Published.") : (result.error ?? "Publish failed."),
      });
      router.refresh();
    });

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/forms"
            className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <h1 className="text-2xl font-bold tracking-tight shrink-0">Flow Builder</h1>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Form name"
            className="bg-white/5 border border-white/12 rounded-xl px-3.5 py-2 text-sm min-w-0 w-56 focus:outline-none focus:border-accent/50"
          />
          <StatusPill status={status} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSendOpen(true)}
            disabled={!metaFlowId}
            title={metaFlowId ? "Send this form to a number" : "Press Update Flow first"}
            className="btn-secondary text-sm disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
            Test send
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn-secondary text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Update Flow
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={publishing || !validation.ok}
            className="btn-primary text-sm disabled:opacity-40"
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Publish
          </button>
        </div>
      </div>

      {note && (
        <div
          className={`mb-5 rounded-xl border p-3 text-sm ${
            note.tone === "ok"
              ? "border-accent/25 bg-accent/8 text-accent-ink"
              : "border-[#F87171]/25 bg-[#F87171]/8 text-[#F87171]"
          }`}
        >
          {note.text}
        </div>
      )}

      <div className="grid lg:grid-cols-[200px_minmax(0,1fr)_320px] gap-6 items-start">
        {/* Screens */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Screens</h2>
          <div className="space-y-2">
            {screens.map((screen) => (
              <button
                key={screen.key}
                type="button"
                onClick={() => setActiveKey(screen.key)}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                  screen.key === active.key
                    ? "border-accent/50 bg-accent/8"
                    : "border-white/10 bg-white/3 hover:border-white/20"
                }`}
              >
                <div className="font-medium text-sm truncate">{screen.title || "Untitled"}</div>
                <div className="text-[11px] text-white/40 mt-0.5">
                  {screen.fields.length} field{screen.fields.length === 1 ? "" : "s"}
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={addScreen}
            className="btn-secondary text-sm w-full justify-center mt-2"
          >
            <Plus className="w-4 h-4" />
            Add Screen
          </button>
          {screens.length > 1 && (
            <button
              type="button"
              onClick={() => removeScreen(active.key)}
              className="w-full text-center text-[11px] text-white/35 hover:text-[#F87171] mt-3 transition-colors"
            >
              Remove this screen
            </button>
          )}
        </div>

        {/* Editor */}
        <div className="space-y-4">
          <Card>
            <CardHead icon={<Type className="w-4 h-4 text-white/50" />} title="Screen title" />
            <Counted value={active.title} limit={LIMITS.screenTitle}>
              <input
                value={active.title}
                onChange={(event) => patchScreen(active.key, { title: event.target.value })}
                className={input}
              />
            </Counted>
          </Card>

          {active.fields.map((field) => (
            <Card key={field.key}>
              <CardHead
                title={KIND_LABELS[field.kind]}
                collapsed={collapsed.has(field.key)}
                onToggle={() => toggle(field.key)}
                onDelete={() => removeField(field.key)}
              />
              {!collapsed.has(field.key) && (
                <FieldEditor
                  field={field}
                  screens={screens}
                  onChange={(patch) => patchField(field.key, patch)}
                />
              )}
            </Card>
          ))}

          <Card>
            <Field label="Button at the bottom of this screen">
              <Counted value={active.buttonLabel} limit={LIMITS.footerLabel}>
                <input
                  value={active.buttonLabel}
                  onChange={(event) =>
                    patchScreen(active.key, { buttonLabel: event.target.value })
                  }
                  className={input}
                />
              </Counted>
            </Field>
          </Card>

          <AddComponent onAdd={addField} />

          {!validation.ok && (
            <div className="rounded-xl border border-[#FACC15]/25 bg-[#FACC15]/8 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#FACC15] mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Fix before publishing
              </div>
              <ul className="text-[11px] text-white/60 space-y-1 list-disc list-inside">
                {validation.errors.slice(0, 5).map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="space-y-4">
          <Preview screen={active} />

          <div>
            <p className="text-xs font-medium text-white/60 mb-2">Preview Notes:</p>
            <ul className="text-[11px] text-white/40 space-y-1 list-disc list-inside leading-relaxed">
              <li>Rendering may vary on different devices</li>
              <li>Interactions are disabled in preview mode</li>
              <li>Actual WhatsApp styling may differ slightly</li>
            </ul>
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

          <PreviewLink id={id} previewUrl={previewUrl} disabled={!metaFlowId} />
        </div>
      </div>

      {sendOpen && <SendDialog id={id} onClose={() => setSendOpen(false)} />}
    </div>
  );
}

function seedScreen(): FormScreen {
  const screen = newScreen(0);
  screen.fields = [newField("TextHeading"), newField("TextInput")];
  return screen;
}

function allFields(screens: FormScreen[]): FormField[] {
  return screens.flatMap((screen) => screen.fields);
}

// --- the editor for one component ----------------------------------------

function FieldEditor({
  field,
  screens,
  onChange,
}: {
  field: FormField;
  screens: FormScreen[];
  onChange: (patch: Partial<FormField>) => void;
}) {
  if (!isAnswering(field.kind)) {
    return (
      <div className="space-y-4">
        <Field label="Text Type">
          <select
            value={field.kind}
            onChange={(event) => onChange({ kind: event.target.value as ComponentKind })}
            className={input}
          >
            {TEXT_KINDS.map((kind) => (
              <option key={kind} value={kind} className="bg-[var(--surface-3)]">
                {KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Text Content">
          <Counted value={field.text} limit={textLimit(field.kind)}>
            <textarea
              value={field.text}
              onChange={(event) => onChange({ text: event.target.value })}
              rows={field.kind === "TextBody" || field.kind === "TextCaption" ? 3 : 1}
              className={input}
            />
          </Counted>
        </Field>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {field.kind === "TextInput" && (
        <Field label="Input Type" hint="Sets the keyboard and what WhatsApp will accept.">
          <select
            value={field.inputType}
            onChange={(event) => onChange({ inputType: event.target.value as InputType })}
            className={input}
          >
            {INPUT_TYPES.map((type) => (
              <option key={type} value={type} className="bg-[var(--surface-3)]">
                {type[0].toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Label">
        <Counted value={field.label} limit={labelLimit(field.kind)}>
          <input
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
            // The answer key follows the label until someone edits it
            // directly, which is what makes a readable submission the
            // default rather than something you have to remember to set.
            onBlur={() => {
              if (!field.name || field.name.startsWith("field")) {
                onChange({
                  name: uniqueName(
                    normaliseFieldName(field.label),
                    allFields(screens).filter((other) => other.key !== field.key)
                  ),
                });
              }
            }}
            className={input}
          />
        </Counted>
      </Field>

      {field.kind !== "OptIn" && (
        <Field label="Instructions (Optional)">
          <Counted value={field.helperText} limit={LIMITS.helperText}>
            <input
              value={field.helperText}
              onChange={(event) => onChange({ helperText: event.target.value })}
              placeholder="Shown in small text under the field"
              className={input}
            />
          </Counted>
        </Field>
      )}

      {isChoosing(field.kind) && (
        <Field label="Options">
          <div className="space-y-2">
            {field.options.map((option, index) => (
              <div key={option.id} className="flex items-center gap-2">
                <input
                  value={option.title}
                  onChange={(event) =>
                    onChange({
                      options: field.options.map((entry, position) =>
                        position === index ? { ...entry, title: event.target.value } : entry
                      ),
                    })
                  }
                  maxLength={LIMITS.optionTitle}
                  className={input}
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      options: field.options.filter((_, position) => position !== index),
                    })
                  }
                  aria-label={`Remove option ${index + 1}`}
                  className="p-2 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              onChange({
                options: [
                  ...field.options,
                  {
                    // Ids must be stable and unique: they are what the
                    // answer contains, not the visible title.
                    id: String(
                      Math.max(0, ...field.options.map((o) => Number(o.id) || 0)) + 1
                    ),
                    title: `Option ${field.options.length + 1}`,
                  },
                ],
              })
            }
            className="btn-secondary text-xs mt-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Add option
          </button>
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => onChange({ required: event.target.checked })}
            className="accent-[#22C55E]"
          />
          Required
        </label>

        <div className="flex items-center gap-2 text-[11px] text-white/35">
          <span>Answer key</span>
          <input
            value={field.name}
            onChange={(event) => onChange({ name: event.target.value })}
            onBlur={(event) => onChange({ name: normaliseFieldName(event.target.value) })}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 font-mono text-[11px] w-40 focus:outline-none focus:border-accent/40"
          />
        </div>
      </div>
    </div>
  );
}

function AddComponent({ onAdd }: { onAdd: (kind: ComponentKind) => void }) {
  return (
    <div className="glass-card p-4">
      <p className="text-xs font-medium text-white/60 mb-2.5">Add a component</p>
      <div className="flex flex-wrap gap-1.5">
        {COMPONENT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onAdd(kind)}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/3 hover:border-white/25 text-xs transition-colors"
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- preview --------------------------------------------------------------

/** What the screen will look like inside WhatsApp. */
function Preview({ screen }: { screen: FormScreen }) {
  return (
    <div className="rounded-2xl bg-white text-[#111B21] overflow-hidden border border-white/10">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-black/8">
        <span className="grid place-items-center w-6 h-6 rounded-full bg-[#128C7E] text-white text-[11px] font-semibold">
          ×
        </span>
        <span className="flex-1 text-center text-sm font-semibold truncate">
          {screen.title || "Untitled"}
        </span>
        <span className="text-black/40 text-sm">···</span>
      </div>

      <div className="p-4 space-y-3.5 min-h-[18rem]">
        {screen.fields.map((field) => (
          <PreviewField key={field.key} field={field} />
        ))}

        <button
          type="button"
          disabled
          className="w-full rounded-full bg-[#075E54] text-white text-sm font-medium py-3 mt-2"
        >
          {screen.buttonLabel || "Continue"}
        </button>

        <p className="text-[11px] text-black/45 text-center pt-1">
          Managed by the business. <span className="underline">Learn more</span>
        </p>
      </div>
    </div>
  );
}

function PreviewField({ field }: { field: FormField }) {
  const star = field.required ? " *" : "";

  switch (field.kind) {
    case "TextHeading":
      return <h3 className="text-xl font-bold leading-snug">{field.text}</h3>;
    case "TextSubheading":
      return <h4 className="text-base font-semibold">{field.text}</h4>;
    case "TextBody":
      return <p className="text-sm text-black/75 whitespace-pre-wrap">{field.text}</p>;
    case "TextCaption":
      return <p className="text-[11px] text-black/50 whitespace-pre-wrap">{field.text}</p>;

    case "TextInput":
    case "TextArea":
    case "DatePicker":
      return (
        <div>
          <div className="text-xs text-black/60 mb-1">
            {field.label}
            {star}
          </div>
          <div
            className={`rounded-lg border border-black/15 px-3 py-2.5 text-sm text-black/30 ${
              field.kind === "TextArea" ? "h-16" : ""
            }`}
          >
            {field.kind === "DatePicker" ? "Select a date" : "Enter text..."}
          </div>
          {field.helperText && (
            <div className="text-[11px] text-black/45 mt-1">{field.helperText}</div>
          )}
        </div>
      );

    case "Dropdown":
      return (
        <div>
          <div className="text-xs text-black/60 mb-1">
            {field.label}
            {star}
          </div>
          <div className="rounded-lg border border-black/15 px-3 py-2.5 text-sm text-black/30 flex items-center justify-between">
            <span>Select</span>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      );

    case "RadioButtonsGroup":
    case "CheckboxGroup":
      return (
        <div>
          <div className="text-xs text-black/60 mb-1.5">
            {field.label}
            {star}
          </div>
          <div className="space-y-1.5">
            {field.options.map((option) => (
              <div key={option.id} className="flex items-center gap-2.5 text-sm">
                <span
                  className={`w-4 h-4 border border-black/30 shrink-0 ${
                    field.kind === "RadioButtonsGroup" ? "rounded-full" : "rounded"
                  }`}
                />
                {option.title}
              </div>
            ))}
          </div>
        </div>
      );

    case "OptIn":
      return (
        <div className="flex items-start gap-2.5 text-sm">
          <span className="w-4 h-4 rounded border border-black/30 shrink-0 mt-0.5" />
          <span className="text-black/75">
            {field.label}
            {star}
          </span>
        </div>
      );
  }
}

function PreviewLink({
  id,
  previewUrl,
  disabled,
}: {
  id: string;
  previewUrl: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(previewUrl);
  const [problem, setProblem] = useState<string | null>(null);

  if (disabled) return null;

  return (
    <div>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm w-full justify-center"
        >
          <ExternalLink className="w-4 h-4" />
          Open on WhatsApp
        </a>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await syncForm(id);
              if (result.ok) setUrl(result.previewUrl ?? null);
              else setProblem(result.error ?? "Could not reach WhatsApp.");
              router.refresh();
            })
          }
          className="btn-secondary text-sm w-full justify-center"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Get preview link
        </button>
      )}
      {problem && <p className="text-[11px] text-[#F87171] mt-2">{problem}</p>}
    </div>
  );
}

function SendDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [waId, setWaId] = useState("");
  const [cta, setCta] = useState("Open form");
  const [body, setBody] = useState("Tap below to fill in the form.");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send form"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="glass-card w-full max-w-md p-6 space-y-4">
        <h3 className="font-semibold">Send this form</h3>
        <p className="text-xs text-white/45 leading-relaxed">
          While the form is a draft, only numbers on your WhatsApp account can open it — which
          is exactly what you want for a test.
        </p>

        <Field label="WhatsApp number" hint="Country code included, no + or spaces.">
          <input
            value={waId}
            onChange={(event) => setWaId(event.target.value)}
            placeholder="919876543210"
            className={input}
          />
        </Field>
        <Field label="Message">
          <input value={body} onChange={(event) => setBody(event.target.value)} className={input} />
        </Field>
        <Field label="Button text">
          <input
            value={cta}
            onChange={(event) => setCta(event.target.value)}
            maxLength={20}
            className={input}
          />
        </Field>

        {note && <p className="text-xs text-white/60">{note}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
            Close
          </button>
          <button
            type="button"
            disabled={pending || !waId.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await sendForm({ id, waId, cta, body });
                setNote(result.ok ? (result.message ?? "Sent.") : (result.error ?? "Failed."));
              })
            }
            className="btn-primary text-sm disabled:opacity-40"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// --- small shared pieces --------------------------------------------------

const input =
  "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="glass-card p-5">{children}</div>;
}

function CardHead({
  title,
  icon,
  collapsed,
  onToggle,
  onDelete,
}: {
  title: string;
  icon?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <h3 className="font-medium truncate">{title}</h3>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8"
          >
            {collapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${title}`}
            className="p-1.5 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-white/70 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-white/35 mt-1">{hint}</span>}
    </div>
  );
}

/** A character counter that turns red before Meta refuses the document. */
function Counted({
  value,
  limit,
  children,
}: {
  value: string;
  limit: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      {children}
      <span
        className={`block text-[11px] mt-1 ${
          value.length > limit ? "text-[#F87171]" : "text-white/35"
        }`}
      >
        {value.length}/{limit}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "published"
      ? "bg-accent/10 text-accent-ink border-accent/20"
      : status === "draft"
        ? "bg-[#FACC15]/10 text-[#FACC15] border-[#FACC15]/20"
        : "bg-white/5 text-white/50 border-white/10";

  return (
    <span className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium border ${tone}`}>
      {status}
    </span>
  );
}
