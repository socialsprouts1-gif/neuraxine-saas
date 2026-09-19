"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  createCampaign,
  previewAudience,
  syncTemplates,
  type Audience,
} from "@/app/(dashboard)/campaign-actions";
import { fillVariables, variablesIn } from "@/lib/template-spec";
import {
  parseCsv,
  parseNumberList,
  guessNameColumn,
  guessPhoneColumn,
  sheetToPeople,
  type ParsedAudience,
  type SheetPerson,
} from "@/lib/audience";
import { readXlsx } from "@/lib/xlsx";
import { describeReadiness, templateReadiness } from "@/lib/template-readiness";

export interface TemplateOption {
  id: string;
  name: string;
  language: string;
  category: string;
  /** Meta's review state. A template under review can still be scheduled. */
  status: string;
  body_text: string | null;
  header_text: string | null;
  footer_text: string | null;
}

type Mode = "all" | "tag" | "group" | "numbers";

const MODES: Array<{ key: Mode; label: string; hint: string }> = [
  { key: "all", label: "All contacts", hint: "Everyone who hasn't opted out" },
  { key: "tag", label: "By tag", hint: "Contacts carrying one tag" },
  { key: "group", label: "By group", hint: "A saved contact group" },
  { key: "numbers", label: "Upload a CSV", hint: "A contacts file, or paste a list" },
];

export default function CampaignBuilder({
  templates,
  tags,
  groups,
  numbers,
  onClose,
}: {
  templates: TemplateOption[];
  tags: string[];
  groups: Array<{ id: string; name: string }>;
  numbers: Array<{ id: string; label: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [connectionId, setConnectionId] = useState<string>("");
  const [variables, setVariables] = useState<string[]>([]);

  const [mode, setMode] = useState<Mode>("all");
  const [tag, setTag] = useState(tags[0] ?? "");
  const [group, setGroup] = useState(groups[0]?.id ?? "");
  const [countryCode, setCountryCode] = useState("91");
  const [pasted, setPasted] = useState("");
  const [sheet, setSheet] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [column, setColumn] = useState(0);
  const [nameColumn, setNameColumn] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const [steps, setSteps] = useState<
    Array<{ templateId: string; delayHours: number; variables: string[] }>
  >([]);

  const template = templates.find((option) => option.id === templateId) ?? null;
  const slots = useMemo(() => variablesIn(template?.body_text ?? ""), [template]);

  // Meta's review is the normal state of a template someone just made, and
  // a builder that refuses to proceed during it is the reason campaigns
  // read as missing. The campaign is built, queued, and held by the
  // dispatcher until approval lands.
  const waiting = template ? describeReadiness(template.status) : null;

  // Numbers are parsed as they arrive so the count is honest before anything
  // is created — a list where a third of the rows are unreadable should say
  // so here, not in a delivery report tomorrow. An uploaded sheet wins over
  // the textarea, and pasting clears the sheet, so only one is ever live.
  const manual: (ParsedAudience & { people?: SheetPerson[] }) | null = useMemo(() => {
    if (mode !== "numbers") return null;
    return sheet
      ? sheetToPeople(sheet.rows, column, nameColumn, countryCode)
      : parseNumberList(pasted, countryCode);
  }, [mode, sheet, column, nameColumn, pasted, countryCode]);

  const audience: Audience =
    mode === "numbers"
      ? {
          kind: "numbers",
          waIds: manual?.waIds ?? [],
          ...(manual?.people?.some((person) => person.name)
            ? {
                names: Object.fromEntries(
                  manual.people
                    .filter((person) => person.name)
                    .map((person) => [person.waId, person.name])
                ),
              }
            : {}),
        }
      : mode === "tag"
        ? { kind: "tag", value: tag }
        : mode === "group"
          ? { kind: "group", value: group }
          : { kind: "all" };

  // Contact-backed audiences live in the database, so their size is a round
  // trip. Keyed by the audience itself: the answer is only shown when it
  // belongs to the selection currently on screen, which is what makes
  // "counting…" honest without a second piece of state to keep in step.
  const countKey = mode === "numbers" ? null : JSON.stringify(audience);
  const [counted, setCounted] = useState<{ key: string; count: number | null } | null>(null);

  useEffect(() => {
    if (!countKey) return;
    let cancelled = false;
    previewAudience(JSON.parse(countKey) as Audience).then((result) => {
      if (!cancelled) {
        setCounted({ key: countKey, count: result.ok ? (result.count ?? 0) : null });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [countKey]);

  const counting = countKey !== null && counted?.key !== countKey;
  const reach =
    mode === "numbers"
      ? (manual?.waIds.length ?? 0)
      : counted?.key === countKey
        ? counted.count
        : null;

  const readFile = async (file: File) => {
    setFileError(null);
    setSheet(null);
    // A dropped file is an unambiguous statement about who the audience
    // is, so the mode follows it rather than making someone say it twice.
    setMode("numbers");

    const accept = (headers: string[], rows: string[][], phone: number | null) => {
      setSheet({ headers, rows });
      const picked = phone ?? 0;
      setColumn(picked);
      setNameColumn(guessNameColumn(headers, picked));
    };

    try {
      if (/\.xlsx$/i.test(file.name)) {
        const rows = await readXlsx(await file.arrayBuffer());
        if (rows.length === 0) throw new Error("That sheet is empty.");
        const [headers, ...body] = rows;
        accept(headers, body, guessPhoneColumn(headers, body));
        return;
      }
      if (/\.xls$/i.test(file.name)) {
        throw new Error("Old .xls files aren't readable — save it as .xlsx or CSV.");
      }

      const parsed = parseCsv(await file.text());
      if (parsed.rows.length === 0) throw new Error("That file has no rows under its header.");
      accept(parsed.headers, parsed.rows, parsed.phoneColumn);
    } catch (problem) {
      setFileError(problem instanceof Error ? problem.message : "That file could not be read.");
    }
  };

  const launch = () => {
    setError(null);
    startTransition(async () => {
      const result = await createCampaign({
        name,
        templateId,
        variables,
        audience,
        connectionId: connectionId || null,
        scheduledAt: when === "later" ? scheduledAt : null,
        steps: steps.filter((step) => step.templateId),
      });
      if (!result.ok) {
        setError(result.error ?? "The campaign could not be created.");
        return;
      }
      router.refresh();
      onClose();
    });
  };

  const ready =
    Boolean(name.trim()) &&
    Boolean(templateId) &&
    (reach ?? 0) > 0 &&
    slots.every((_, index) => variables[index]?.trim()) &&
    (when === "now" || Boolean(scheduledAt));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm overflow-y-auto p-4 md:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="New campaign"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="glass-card w-full max-w-4xl mx-auto overflow-hidden">
        {/* The header carries the accent so the dialog reads as one object
            rather than a form floating on a dark rectangle. */}
        <div className="relative border-b border-white/8 bg-gradient-to-br from-accent/12 via-accent/4 to-transparent px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="grid place-items-center w-10 h-10 rounded-2xl bg-accent/15 border border-accent/25 shrink-0">
                <Megaphone className="w-5 h-5 text-accent-ink" />
              </span>
              <div>
                <h3 className="text-lg font-semibold leading-tight">New campaign</h3>
                <p className="text-xs text-white/50 mt-1">
                  Pick a template, choose who gets it, and send now or later.
                </p>
              </div>
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
        </div>

        <div className="p-6">

        {templates.length === 0 ? (
          <NoTemplatesYet onClose={onClose} />
        ) : (
          <div className="space-y-8">
            <Section step={1} title="Message">
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Campaign name" hint="Only you see this.">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Diwali offer"
                    className={input}
                  />
                </Field>
                {numbers.length > 1 && (
                  <Field label="Send from" hint="Which of your numbers customers will see.">
                    <select
                      value={connectionId}
                      onChange={(event) => setConnectionId(event.target.value)}
                      className={input}
                    >
                      <option value="" className="bg-[var(--surface-3)]">
                        Default number
                      </option>
                      {numbers.map((number) => (
                        <option key={number.id} value={number.id} className="bg-[var(--surface-3)]">
                          {number.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <Field label="Template">
                  <select
                    value={templateId}
                    onChange={(event) => {
                      setTemplateId(event.target.value);
                      setVariables([]);
                    }}
                    className={input}
                  >
                    {templates.map((option) => (
                      <option key={option.id} value={option.id} className="bg-[var(--surface-3)]">
                        {option.name} · {option.language} · {option.category.toLowerCase()}
                        {templateReadiness(option.status) === "ready" ? "" : "  (in review)"}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {waiting && (
                <div className="mt-4 flex gap-2.5 rounded-xl border border-[#FACC15]/25 bg-[#FACC15]/8 p-3">
                  <Clock className="w-4 h-4 text-[#FACC15] shrink-0 mt-0.5" />
                  <p className="text-xs text-white/70 leading-relaxed">{waiting}</p>
                </div>
              )}

              {slots.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-white/50">
                    This template has {slots.length} placeholder
                    {slots.length === 1 ? "" : "s"}. Everyone receives the same values.
                  </p>
                  {slots.map((slot, index) => (
                    <div key={slot} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-accent2-ink w-12 shrink-0">
                        {"{{"}
                        {slot}
                        {"}}"}
                      </span>
                      <input
                        value={variables[index] ?? ""}
                        onChange={(event) => {
                          const next = [...variables];
                          next[index] = event.target.value;
                          setVariables(next);
                        }}
                        placeholder="Value"
                        className={input}
                      />
                    </div>
                  ))}
                </div>
              )}

              {template && (
                <div className="mt-4 rounded-xl bg-[#0B141A] border border-white/10 p-3">
                  <div className="rounded-lg bg-[#1F2C34] p-3 max-w-sm">
                    {template.header_text && (
                      <div className="text-sm font-semibold mb-1.5">
                        {fillVariables(template.header_text, variables)}
                      </div>
                    )}
                    <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                      {fillVariables(template.body_text ?? "", variables)}
                    </p>
                    {template.footer_text && (
                      <p className="text-[11px] text-white/40 mt-2">{template.footer_text}</p>
                    )}
                  </div>
                </div>
              )}
            </Section>

            <Section step={2} title="Who gets it">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {MODES.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setMode(option.key)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      mode === option.key
                        ? "border-accent/50 bg-accent/8"
                        : "border-white/10 bg-white/3 hover:border-white/20"
                    }`}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-[11px] text-white/40 mt-0.5">{option.hint}</div>
                  </button>
                ))}
              </div>

              {/* Outside the mode, on purpose. The import used to live
                  behind the fourth tile, so someone looking at "All
                  contacts" saw no way to upload anything and concluded
                  there wasn't one. A file is an unambiguous statement
                  about the audience, so dropping one here selects the
                  mode rather than asking for it first. */}
              <DropZone onFile={readFile} active={mode === "numbers" && sheet !== null} />

              {mode === "tag" && (
                <div className="mt-4">
                  <Field label="Tag">
                    {tags.length > 0 ? (
                      <select
                        value={tag}
                        onChange={(event) => setTag(event.target.value)}
                        className={input}
                      >
                        {tags.map((option) => (
                          <option key={option} value={option} className="bg-[var(--surface-3)]">
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-white/40">
                        No tags on your contacts yet. Add one from the Contacts screen.
                      </p>
                    )}
                  </Field>
                </div>
              )}

              {mode === "group" && (
                <div className="mt-4">
                  <Field label="Group">
                    {groups.length > 0 ? (
                      <select
                        value={group}
                        onChange={(event) => setGroup(event.target.value)}
                        className={input}
                      >
                        {groups.map((option) => (
                          <option
                            key={option.id}
                            value={option.id}
                            className="bg-[var(--surface-3)]"
                          >
                            {option.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-white/40">No contact groups yet.</p>
                    )}
                  </Field>
                </div>
              )}

              {mode === "numbers" && (
                <NumberPicker
                  countryCode={countryCode}
                  setCountryCode={setCountryCode}
                  pasted={pasted}
                  setPasted={(value) => {
                    setPasted(value);
                    setSheet(null);
                    setNameColumn(null);
                  }}
                  fileError={fileError}
                  sheet={sheet}
                  column={column}
                  setColumn={setColumn}
                  nameColumn={nameColumn}
                  setNameColumn={setNameColumn}
                  parsed={manual}
                />
              )}

              <div className="mt-4 flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-white/40" />
                {counting ? (
                  <span className="text-white/40">Counting…</span>
                ) : reach === null ? (
                  <span className="text-[#F87171]">Could not count this audience.</span>
                ) : (
                  <span className={reach > 0 ? "text-white/70" : "text-[#FACC15]"}>
                    {reach.toLocaleString()} recipient{reach === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </Section>

            <Section step={3} title="When">
              <div className="flex flex-wrap gap-2">
                {(["now", "later"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setWhen(option)}
                    className={`px-3.5 py-2 rounded-xl text-sm border transition-colors ${
                      when === option
                        ? "border-accent/50 bg-accent/8"
                        : "border-white/10 bg-white/3 hover:border-white/20"
                    }`}
                  >
                    {option === "now" ? "Send now" : "Schedule"}
                  </button>
                ))}
              </div>
              {when === "later" && (
                <div className="mt-3 max-w-xs">
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className={input}
                  />
                </div>
              )}
            </Section>

            <Section
              step={4}
              title="Follow-ups"
              subtitle="Optional. Each one goes only to people who received the message before it."
            >
              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div
                    key={index}
                    className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/3 p-3"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-white/45 pb-2.5">
                      <Clock className="w-3.5 h-3.5" />
                      Step {index + 1}
                    </div>
                    <div className="w-24">
                      <Field label="After (hours)">
                        <input
                          type="number"
                          min={1}
                          value={step.delayHours}
                          onChange={(event) =>
                            setSteps(
                              steps.map((entry, position) =>
                                position === index
                                  ? { ...entry, delayHours: Number(event.target.value) || 1 }
                                  : entry
                              )
                            )
                          }
                          className={input}
                        />
                      </Field>
                    </div>
                    <div className="flex-1 min-w-[12rem]">
                      <Field label="Template">
                        <select
                          value={step.templateId}
                          onChange={(event) =>
                            setSteps(
                              steps.map((entry, position) =>
                                position === index
                                  ? { ...entry, templateId: event.target.value }
                                  : entry
                              )
                            )
                          }
                          className={input}
                        >
                          {templates.map((option) => (
                            <option
                              key={option.id}
                              value={option.id}
                              className="bg-[var(--surface-3)]"
                            >
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSteps(steps.filter((_, position) => position !== index))}
                      aria-label={`Remove step ${index + 1}`}
                      className="p-2 mb-0.5 rounded-lg text-white/30 hover:text-[#F87171] hover:bg-white/8"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setSteps([
                    ...steps,
                    { templateId: templates[0]?.id ?? "", delayHours: 24, variables: [] },
                  ])
                }
                className="btn-secondary text-sm mt-2"
              >
                <Plus className="w-4 h-4" />
                Add a follow-up
              </button>
            </Section>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-[#F87171]/25 bg-[#F87171]/8 p-3 text-sm text-[#F87171]">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/8">
              <p className="text-[11px] text-white/35 max-w-sm leading-relaxed pt-4">
                Recipients are queued and sent by the dispatcher, so closing this window
                won&apos;t stop the campaign. You can cancel it while it runs.
              </p>
              <button
                type="button"
                onClick={launch}
                disabled={!ready || pending}
                className="btn-primary shrink-0 mt-4 disabled:opacity-40"
              >
                {pending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : when === "now" ? (
                  <Send className="w-4 h-4" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                {pending
                  ? "Queueing…"
                  : when === "now"
                    ? `Send to ${(reach ?? 0).toLocaleString()}`
                    : "Schedule"}
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

/**
 * Where a contacts file lands.
 *
 * Drag-and-drop and a click open the same path, because half of people
 * will try one and half the other, and a zone that only accepts a drop
 * looks broken to everyone who clicks it.
 */
function DropZone({ onFile, active }: { onFile: (file: File) => void; active: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`mt-2.5 rounded-xl border border-dashed transition-colors ${
        over
          ? "border-accent/60 bg-accent/10"
          : active
            ? "border-accent/30 bg-accent/5"
            : "border-white/12 bg-white/2 hover:border-white/25"
      }`}
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-3 text-xs text-white/55 hover:text-white/80 transition-colors"
      >
        <Upload className="w-4 h-4 shrink-0" />
        <span>
          {active ? "Replace the file" : "Drop a contacts CSV or Excel file here"}
          <span className="text-white/30"> · or click to choose</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * Pasting a list and importing a sheet are the same job, so they share one
 * panel rather than hiding behind another set of tabs.
 */
function NumberPicker({
  countryCode,
  setCountryCode,
  pasted,
  setPasted,
  fileError,
  sheet,
  column,
  setColumn,
  nameColumn,
  setNameColumn,
  parsed,
}: {
  countryCode: string;
  setCountryCode: (value: string) => void;
  pasted: string;
  setPasted: (value: string) => void;
  fileError: string | null;
  sheet: { headers: string[]; rows: string[][] } | null;
  column: number;
  setColumn: (value: number) => void;
  nameColumn: number | null;
  setNameColumn: (value: number | null) => void;
  parsed: (ParsedAudience & { people?: SheetPerson[] }) | null;
}) {

  return (
    <div className="mt-4 space-y-4">
      <div className="grid md:grid-cols-[1fr_10rem] gap-4">
        <Field
          label="Paste numbers"
          hint="One per line, or separated by commas. Duplicates are removed."
        >
          <textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={4}
            placeholder={"+91 98765 43210\n9811122333"}
            className={`${input} font-mono text-xs`}
          />
        </Field>
        <Field label="Default country" hint="Added to numbers that have none.">
          <div className="flex items-center gap-1.5">
            <span className="text-white/40 text-sm">+</span>
            <input
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className={input}
            />
          </div>
        </Field>
      </div>

      {fileError && <p className="text-xs text-[#F87171]">{fileError}</p>}

      {sheet && (
        <Field
          label="Which column holds the names?"
          hint="Optional. New numbers are saved as contacts under this name, so replies arrive from a person rather than a number."
        >
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setNameColumn(null)}
              className={`px-3 py-2 rounded-xl border text-xs transition-colors ${
                nameColumn === null
                  ? "border-accent/50 bg-accent/8"
                  : "border-white/10 bg-white/3 hover:border-white/20"
              }`}
            >
              No names
            </button>
            {sheet.headers.map((header, index) =>
              // The phone column is not on offer: naming everyone after
              // their own number is never what anyone meant.
              index === column ? null : (
                <button
                  key={index}
                  type="button"
                  onClick={() => setNameColumn(index)}
                  className={`px-3 py-2 rounded-xl text-left border text-xs transition-colors ${
                    nameColumn === index
                      ? "border-accent/50 bg-accent/8"
                      : "border-white/10 bg-white/3 hover:border-white/20"
                  }`}
                >
                  <span className="block font-medium">{header || `Column ${index + 1}`}</span>
                  <span className="block text-white/35 mt-0.5">{sheet.rows[0]?.[index] || "—"}</span>
                </button>
              )
            )}
          </div>
        </Field>
      )}

      {sheet && (
        <Field label="Which column holds the numbers?">
          <div className="flex flex-wrap gap-1.5">
            {sheet.headers.map((header, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setColumn(index)}
                className={`px-3 py-2 rounded-xl text-left border text-xs transition-colors ${
                  column === index
                    ? "border-accent/50 bg-accent/8"
                    : "border-white/10 bg-white/3 hover:border-white/20"
                }`}
              >
                <span className="block font-medium">{header || `Column ${index + 1}`}</span>
                <span className="block text-white/35 mt-0.5 font-mono">
                  {sheet.rows[0]?.[index] || "—"}
                </span>
              </button>
            ))}
          </div>
        </Field>
      )}

      {parsed && (parsed.waIds.length > 0 || parsed.rejected.length > 0) && (
        <div className="rounded-xl border border-white/10 bg-white/3 p-3 text-xs space-y-1">
          <p className="flex items-center gap-1.5 text-white/70">
            <CheckCircle2 className="w-3.5 h-3.5 text-accent-ink" />
            {parsed.waIds.length.toLocaleString()} valid number
            {parsed.waIds.length === 1 ? "" : "s"}
            {parsed.duplicates > 0 && (
              <span className="text-white/40">· {parsed.duplicates} duplicate removed</span>
            )}
          </p>
          {parsed.rejected.length > 0 && (
            <p className="text-[#FACC15]">
              {parsed.rejected.length} skipped —{" "}
              {parsed.rejected
                .slice(0, 3)
                .map((entry) => `${entry.value} (${entry.reason})`)
                .join(", ")}
              {parsed.rejected.length > 3 && ` and ${parsed.rejected.length - 3} more`}
            </p>
          )}

          {/* Three real rows out of the file. A count can be right about
              the wrong column; seeing the first names and numbers side by
              side is what actually catches an order-id column before it
              becomes ten thousand messages. */}
          {parsed.people && parsed.people.length > 0 && (
            <div className="pt-1.5 mt-1.5 border-t border-white/8 space-y-1">
              {parsed.people.slice(0, 3).map((person) => (
                <p key={person.waId} className="flex items-center gap-2 text-white/50">
                  <span className="font-mono tabular-nums">+{person.waId}</span>
                  {person.name && <span className="text-white/70">{person.name}</span>}
                </p>
              ))}
              {parsed.people.length > 3 && (
                <p className="text-white/30">
                  and {(parsed.people.length - 3).toLocaleString()} more
                </p>
              )}
            </div>
          )}
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

function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    // The numbered marker sits on a rule that runs the height of the step,
    // so three sections read as one sequence instead of three stacked
    // forms. The rule is the whole trick — without it the numbers are
    // decoration and the eye has nothing to follow.
    <section className="relative pl-9 last:pb-0 pb-1">
      <span className="absolute left-[13px] top-8 bottom-0 w-px bg-white/8" aria-hidden />
      <span className="absolute left-0 top-0 grid place-items-center w-7 h-7 rounded-full bg-accent/12 border border-accent/25 text-[11px] font-semibold text-accent-ink">
        {step}
      </span>
      <div className="mb-3.5 min-h-[1.75rem] flex flex-col justify-center">
        <h4 className="text-sm font-semibold leading-tight">{title}</h4>
        {subtitle && <p className="text-[11px] text-white/40 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * What to show when there is nothing to send.
 *
 * This used to be a yellow note saying "create one under Templates", which
 * is true and useless: it leaves someone inside a dialog they now have to
 * close, on a page they have to find, to do a thing they were not told how
 * to start. Both routes out are here instead — and Sync matters because
 * templates made in WhatsApp Manager are invisible until it runs, which is
 * the exact state of anyone who has just worked around a refusal there.
 */
function NoTemplatesYet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="text-center py-6 px-4">
      <span className="grid place-items-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10 mx-auto mb-4">
        <FileText className="w-5 h-5 text-white/40" />
      </span>
      <h4 className="text-sm font-semibold">No template to send yet</h4>
      <p className="text-xs text-white/50 mt-2 max-w-sm mx-auto leading-relaxed">
        A campaign sends a template, and WhatsApp requires Meta to review one before it goes
        out. Make one here, or pull in the ones already on your WhatsApp Business Account.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/templates");
          }}
          className="btn-primary text-sm"
        >
          <Plus className="w-4 h-4" />
          Create a template
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await syncTemplates();
              setNote(result.message ?? result.error ?? null);
              router.refresh();
            })
          }
          className="btn-secondary text-sm disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Sync from Meta
        </button>
      </div>

      {note && <p className="text-xs text-white/50 mt-4 max-w-sm mx-auto">{note}</p>}
    </div>
  );
}
