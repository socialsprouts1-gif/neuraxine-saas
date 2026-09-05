"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { submitTemplate } from "@/app/(dashboard)/campaign-actions";
import {
  HEADER_FORMATS,
  LIMITS,
  TEMPLATE_CATEGORIES,
  fillVariables,
  normaliseName,
  validateTemplate,
  variablesIn,
  type ButtonSpec,
  type TemplateSpec,
} from "@/lib/template-spec";

const LANGUAGES = [
  ["en_US", "English (US)"],
  ["en_GB", "English (UK)"],
  ["hi", "Hindi"],
  ["mr", "Marathi"],
  ["gu", "Gujarati"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["bn", "Bengali"],
  ["ar", "Arabic"],
  ["es", "Spanish"],
  ["pt_BR", "Portuguese (BR)"],
] as const;

const CATEGORY_HELP: Record<string, string> = {
  UTILITY:
    "A message about something the customer already did — an order, a booking, an account. Cheapest, and approved fastest.",
  MARKETING:
    "Promotions, offers, anything they did not ask for. Costs more and only reaches people who opted in.",
  AUTHENTICATION: "One-time passcodes. No links, no calls, no marketing language.",
};

const BLANK: TemplateSpec = {
  name: "",
  language: "en_US",
  category: "UTILITY",
  headerFormat: "NONE",
  headerText: "",
  headerMediaUrl: "",
  body: "",
  footer: "",
  buttons: [],
  samples: [],
};

/** A number the template can be created on. */
export interface TemplateTarget {
  id: string;
  label: string;
  wabaId: string;
  isDefault: boolean;
}

export default function TemplateBuilder({
  onClose,
  initial,
  numbers = [],
  /**
   * Set when the template already exists at Meta. Meta will not accept a
   * second template under the same name, so an edit here has to become a
   * new one — and saying that up front beats letting the submission fail.
   */
  liveAtMeta = false,
}: {
  onClose: () => void;
  initial?: TemplateSpec;
  /** Every active number, so the account can be seen and chosen. */
  numbers?: TemplateTarget[];
  liveAtMeta?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const editing = initial !== undefined;
  const originalName = initial?.name ?? "";

  const [spec, setSpec] = useState<TemplateSpec>(initial ?? BLANK);

  // Default to the workspace default, falling back to the only one there is.
  const [target, setTarget] = useState<string>(
    () => (numbers.find((number) => number.isDefault) ?? numbers[0])?.id ?? ""
  );
  const chosen = numbers.find((number) => number.id === target) ?? null;

  const set = <K extends keyof TemplateSpec>(key: K, value: TemplateSpec[K]) =>
    setSpec((current) => ({ ...current, [key]: value }));

  const bodyVariables = useMemo(() => variablesIn(spec.body), [spec.body]);
  const validation = useMemo(
    () => validateTemplate({ ...spec, name: normaliseName(spec.name) }),
    [spec]
  );

  const addButton = (type: ButtonSpec["type"]) => {
    const button: ButtonSpec =
      type === "URL"
        ? { type: "URL", text: "", url: "" }
        : type === "PHONE_NUMBER"
          ? { type: "PHONE_NUMBER", text: "", phone_number: "" }
          : { type: "QUICK_REPLY", text: "" };
    set("buttons", [...spec.buttons, button]);
  };

  const updateButton = (index: number, patch: Partial<ButtonSpec>) =>
    set(
      "buttons",
      spec.buttons.map((button, position) =>
        position === index ? ({ ...button, ...patch } as ButtonSpec) : button
      )
    );

  const nameUnchanged = normaliseName(spec.name) === normaliseName(originalName);

  const submit = () => {
    setError(null);
    setDetail(null);

    if (liveAtMeta && nameUnchanged) {
      setError(
        "This template already exists on your WhatsApp Business Account, and Meta does not allow replacing one under the same name. Give it a new name to submit these changes as a separate template."
      );
      return;
    }

    const data = new FormData();
    if (target) data.set("connection_id", target);
    data.set("name", normaliseName(spec.name));
    data.set("language", spec.language);
    data.set("category", spec.category);
    data.set("header_format", spec.headerFormat);
    data.set("header_text", spec.headerText);
    data.set("header_media_url", spec.headerMediaUrl);
    data.set("body", spec.body);
    data.set("footer", spec.footer);
    data.set("buttons", JSON.stringify(spec.buttons));
    data.set("samples", spec.samples.join("\n"));

    startTransition(async () => {
      const result = await submitTemplate(data);
      if (!result.ok) {
        setError(result.error ?? "Meta refused the template.");
        setDetail(result.detail ?? null);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit template" : "Create template"}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="glass-card w-full max-w-5xl mx-auto p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold">
              {editing ? "Edit template" : "Create template"}
            </h3>
            <p className="text-xs text-white/45 mt-1.5 leading-relaxed max-w-xl">
              {liveAtMeta
                ? "This one is already on your WhatsApp Business Account. Meta will not replace a template under the same name, so save these changes under a new name."
                : "Meta reviews every template before it can be sent. Most come back in minutes; marketing ones can take a day."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Which account this lands on. A template belongs to a WhatsApp
            Business Account, not to a workspace, so with more than one number
            connected the target was previously an invisible guess — and an
            account-level rejection then reads as a fault in the template. */}
        {numbers.length > 0 && (
          <div className="mb-6 rounded-xl border border-white/10 bg-white/4 p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="text-xs text-white/50" htmlFor="template-target">
                Create on
              </label>
              {numbers.length === 1 ? (
                <span className="text-sm font-medium">{numbers[0].label}</span>
              ) : (
                <select
                  id="template-target"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  className="bg-white/5 border border-white/12 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent/50"
                >
                  {numbers.map((number) => (
                    <option key={number.id} value={number.id}>
                      {number.label}
                      {number.isDefault ? " · default" : ""}
                    </option>
                  ))}
                </select>
              )}
              {chosen && (
                <span className="text-[11px] text-white/35 font-mono">
                  WABA {chosen.wabaId}
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/35 mt-2 leading-relaxed">
              Templates live on the WhatsApp Business Account, not on this workspace. One
              approved here is not available on your other numbers.
            </p>
          </div>
        )}

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Template name" hint="Lowercase and underscores. Meta requires it.">
                <input
                  value={spec.name}
                  onChange={(event) => set("name", event.target.value)}
                  onBlur={() => set("name", normaliseName(spec.name))}
                  placeholder="order_shipped"
                  className={input}
                />
                {spec.name && normaliseName(spec.name) !== spec.name && (
                  <span className="block text-[11px] text-accent2-ink mt-1">
                    Will be saved as {normaliseName(spec.name)}
                  </span>
                )}
              </Field>

              <Field label="Language">
                <select
                  value={spec.language}
                  onChange={(event) => set("language", event.target.value)}
                  className={input}
                >
                  {LANGUAGES.map(([code, label]) => (
                    <option key={code} value={code} className="bg-[var(--surface-3)]">
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Category">
              <div className="grid sm:grid-cols-3 gap-2">
                {TEMPLATE_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => set("category", category)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      spec.category === category
                        ? "border-accent/50 bg-accent/8"
                        : "border-white/10 bg-white/3 hover:border-white/20"
                    }`}
                  >
                    <div className="text-sm font-medium capitalize">
                      {category.toLowerCase()}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
                {CATEGORY_HELP[spec.category]}
              </p>
            </Field>

            <Field label="Header" hint="Optional. One variable at most, and only in text.">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {HEADER_FORMATS.map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => set("headerFormat", format)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      spec.headerFormat === format
                        ? "border-accent/50 bg-accent/10 text-accent-ink"
                        : "border-white/10 text-white/50 hover:border-white/25"
                    }`}
                  >
                    {format === "NONE" ? "None" : format.charAt(0) + format.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              {spec.headerFormat === "TEXT" && (
                <input
                  value={spec.headerText}
                  onChange={(event) => set("headerText", event.target.value)}
                  maxLength={LIMITS.headerText}
                  placeholder="Order update"
                  className={input}
                />
              )}
              {["IMAGE", "VIDEO", "DOCUMENT"].includes(spec.headerFormat) && (
                <input
                  value={spec.headerMediaUrl}
                  onChange={(event) => set("headerMediaUrl", event.target.value)}
                  placeholder="https://your-domain/sample.jpg"
                  className={input}
                />
              )}
            </Field>

            <Field
              label="Body"
              hint={`${spec.body.length}/${LIMITS.body}. Use {{1}}, {{2}} for anything that changes per person.`}
            >
              <textarea
                value={spec.body}
                onChange={(event) => set("body", event.target.value)}
                rows={5}
                maxLength={LIMITS.body}
                placeholder="Hi {{1}}, your order {{2}} has shipped and should arrive in 3-5 days."
                className={`${input} resize-y leading-relaxed`}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[1, 2, 3, 4].map((index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => set("body", `${spec.body}{{${index}}}`)}
                    className="text-[11px] px-2 py-1 rounded-lg border border-white/12 text-white/50 hover:text-white hover:border-white/25"
                  >
                    + {`{{${index}}}`}
                  </button>
                ))}
              </div>
            </Field>

            {bodyVariables.length > 0 && (
              <Field
                label="Example values"
                hint="Meta reviews the template with these filled in. They are not sent."
              >
                <div className="space-y-2">
                  {bodyVariables.map((variable, index) => (
                    <div key={variable} className="flex items-center gap-2">
                      <code className="text-[11px] text-accent2-ink w-12 flex-shrink-0">
                        {`{{${variable}}}`}
                      </code>
                      <input
                        value={spec.samples[index] ?? ""}
                        onChange={(event) => {
                          const next = [...spec.samples];
                          next[index] = event.target.value;
                          set("samples", next);
                        }}
                        placeholder={index === 0 ? "Vivek" : "#1234"}
                        className={input}
                      />
                    </div>
                  ))}
                </div>
              </Field>
            )}

            <Field label="Footer" hint="Optional, no variables. Often an opt-out line.">
              <input
                value={spec.footer}
                onChange={(event) => set("footer", event.target.value)}
                maxLength={LIMITS.footer}
                placeholder="Reply STOP to opt out"
                className={input}
              />
            </Field>

            <Field label="Buttons" hint="Up to 3 quick replies, 2 links and 1 call button.">
              <div className="space-y-2">
                {spec.buttons.map((button, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-white/35 w-20 flex-shrink-0">
                      {button.type === "QUICK_REPLY"
                        ? "Reply"
                        : button.type === "URL"
                          ? "Link"
                          : "Call"}
                    </span>
                    <input
                      value={button.text}
                      onChange={(event) => updateButton(index, { text: event.target.value })}
                      maxLength={LIMITS.buttonText}
                      placeholder="Button label"
                      className={`${input} flex-1 min-w-[8rem]`}
                    />
                    {button.type === "URL" && (
                      <input
                        value={button.url}
                        onChange={(event) =>
                          updateButton(index, { url: event.target.value } as Partial<ButtonSpec>)
                        }
                        placeholder="https://…"
                        className={`${input} flex-1 min-w-[10rem]`}
                      />
                    )}
                    {button.type === "PHONE_NUMBER" && (
                      <input
                        value={button.phone_number}
                        onChange={(event) =>
                          updateButton(index, {
                            phone_number: event.target.value,
                          } as Partial<ButtonSpec>)
                        }
                        placeholder="+91…"
                        className={`${input} flex-1 min-w-[10rem]`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        set("buttons", spec.buttons.filter((_, position) => position !== index))
                      }
                      aria-label="Remove button"
                      className="p-2 rounded-lg text-white/30 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                {(
                  [
                    ["QUICK_REPLY", "Quick reply"],
                    ["URL", "Link"],
                    ["PHONE_NUMBER", "Call"],
                  ] as const
                ).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => addButton(type)}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-white/12 text-white/55 hover:text-white hover:border-white/25"
                  >
                    <Plus className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Preview */}
          <div className="lg:sticky lg:top-4">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/35 mb-2">
              Preview
            </div>
            <Preview spec={spec} />

            {!validation.ok && (
              <ul className="mt-4 space-y-1.5">
                {validation.errors.map((message) => (
                  <li key={message} className="text-[11px] text-[#FACC15] leading-relaxed">
                    • {message}
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <div className="mt-4">
                <p className="text-xs text-red-400 leading-relaxed" role="alert">
                  {error}
                </p>

                {/* Meta's own envelope. Normally the wrong thing to put in
                    front of an operator, but the readable sentence drops the
                    subcode and error_data — the only fields that ever say
                    which of several unrelated faults this actually is. */}
                {detail && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-white/40 hover:text-white/65 list-none">
                      Show Meta&apos;s exact response
                    </summary>
                    <pre className="mt-2 text-[10px] leading-relaxed bg-black/40 border border-white/10 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-words text-white/65">
                      {detail}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={pending || !validation.ok}
              className="btn-primary w-full justify-center mt-4 disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {pending
                ? "Submitting…"
                : liveAtMeta
                  ? "Submit as a new template"
                  : "Submit for review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** What the customer will see, with the example values filled in. */
function Preview({ spec }: { spec: TemplateSpec }) {
  const body = fillVariables(spec.body, spec.samples);
  const header = fillVariables(spec.headerText, spec.samples);

  return (
    <div className="rounded-xl bg-[#0B141A] border border-white/10 p-3">
      <div className="rounded-lg bg-[#1F2C34] p-3 max-w-[16rem]">
        {spec.headerFormat === "TEXT" && header && (
          <div className="text-sm font-semibold mb-1.5 text-white">{header}</div>
        )}
        {["IMAGE", "VIDEO", "DOCUMENT"].includes(spec.headerFormat) && (
          <div className="h-20 rounded-md bg-white/8 grid place-items-center text-[10px] text-white/40 mb-2">
            {spec.headerFormat.toLowerCase()}
          </div>
        )}

        <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
          {body || <span className="text-white/30">Your message appears here…</span>}
        </p>

        {spec.footer && <p className="text-[11px] text-white/40 mt-2">{spec.footer}</p>}
        <div className="text-[10px] text-white/30 text-right mt-1">12:00</div>
      </div>

      {spec.buttons.length > 0 && (
        <div className="max-w-[16rem] mt-1 space-y-1">
          {spec.buttons.map((button, index) => (
            <div
              key={index}
              className="rounded-lg bg-[#1F2C34] py-2 text-center text-sm text-[#53BDEB]"
            >
              {button.text || "Button"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const input =
  "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all";

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
