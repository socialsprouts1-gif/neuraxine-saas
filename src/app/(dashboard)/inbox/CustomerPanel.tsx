"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Flame, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { LEAD_STAGES, type LeadStage } from "@/types/portal";
import {
  analyzeThread,
  deleteInternalNote,
  setLeadStage,
  updateContactDetails,
} from "./actions";

export interface PanelNote {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export interface PanelEvent {
  id: string;
  label: string;
  createdAt: string;
}

export interface CustomerData {
  conversationId: string;
  contactId: string;
  name: string;
  waId: string;
  tags: string[];
  stage: LeadStage;
  score: number | null;
  scoreReasons: string[];
  intent: string | null;
  sentiment: string | null;
  summary: string | null;
  nextAction: string | null;
  source: string | null;
  campaign: string | null;
  dealValue: number | null;
  createdAt: string;
  notes: PanelNote[];
  events: PanelEvent[];
}

// The right rail. Only the four things worth knowing at a glance are open;
// everything else is a heading you can push on. A panel that shows twenty
// fields is a panel nobody reads.
export default function CustomerPanel({
  data,
  onClose,
}: {
  data: CustomerData;
  /** Present on small screens, where the panel is a drawer. */
  onClose?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [showScore, setShowScore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = () =>
    startTransition(async () => {
      setError(null);
      const result = await analyzeThread(data.conversationId);
      if (!result.ok) setError(result.error ?? "Could not analyse the conversation.");
    });

  const changeStage = (stage: LeadStage) =>
    startTransition(async () => {
      await setLeadStage(data.conversationId, data.contactId, stage);
    });

  return (
    <aside className="w-80 border-l border-white/8 flex flex-col flex-shrink-0 min-h-0 bg-[var(--surface-1)]/40">
      <div className="px-4 py-3.5 border-b border-white/8 flex items-center gap-2 flex-shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Customer
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="ml-auto p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* The glance: who, how hot, where they are, what they are tagged. */}
        <div className="p-4 border-b border-white/8">
          <div className="font-semibold truncate">{data.name || data.waId}</div>
          <div className="text-xs text-white/45 font-mono mt-0.5">{data.waId}</div>

          <div className="flex items-center gap-2 mt-3">
            {data.score === null ? (
              <button
                type="button"
                onClick={analyze}
                disabled={pending}
                className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Score this lead
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowScore((current) => !current)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold hover:opacity-80 transition-opacity"
                title="Why this score?"
              >
                <Flame className={`w-4 h-4 ${scoreColour(data.score)}`} />
                <span className={scoreColour(data.score)}>{data.score}</span>
                <span className="text-white/35 font-normal text-xs">/100</span>
                <ChevronDown
                  className={`w-3 h-3 text-white/30 transition-transform ${
                    showScore ? "rotate-180" : ""
                  }`}
                />
              </button>
            )}

            {data.sentiment && (
              <span className="text-xs text-white/45" title={`Sentiment: ${data.sentiment}`}>
                {data.sentiment === "positive"
                  ? "😊"
                  : data.sentiment === "negative"
                    ? "⚠️"
                    : "😐"}
              </span>
            )}
          </div>

          {showScore && data.scoreReasons.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {data.scoreReasons.map((reason) => (
                <li key={reason} className="text-[11px] text-white/50">
                  + {reason}
                </li>
              ))}
            </ul>
          )}

          {data.intent && (
            <div className="text-xs text-white/50 mt-2">
              Intent: <span className="text-white/75">{data.intent}</span>
            </div>
          )}

          <label className="block mt-3">
            <span className="text-[11px] text-white/45">Stage</span>
            <select
              value={data.stage}
              disabled={pending}
              onChange={(event) => changeStage(event.target.value as LeadStage)}
              className="w-full mt-1 bg-white/5 border border-white/12 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-accent/50 capitalize disabled:opacity-50"
            >
              {LEAD_STAGES.map((stage) => (
                <option key={stage} value={stage} className="bg-[var(--surface-3)] capitalize">
                  {stage}
                </option>
              ))}
            </select>
          </label>

          {data.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {data.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] px-2 py-0.5 rounded-lg bg-accent/10 text-accent-ink border border-accent/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {error && (
            <p className="text-[11px] text-red-400 mt-2" role="alert">
              {error}
            </p>
          )}
        </div>

        <Section title="AI summary" defaultOpen={Boolean(data.summary)}>
          {data.summary ? (
            <>
              <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">
                {data.summary}
              </p>
              {data.nextAction && (
                <div className="mt-3 rounded-lg border border-accent/25 bg-accent/8 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
                    Next best action
                  </div>
                  <div className="text-xs text-accent-ink font-medium">{data.nextAction}</div>
                </div>
              )}
              <button
                type="button"
                onClick={analyze}
                disabled={pending}
                className="text-[11px] text-white/45 hover:text-white mt-2.5 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {pending && <Loader2 className="w-3 h-3 animate-spin" />}
                Re-analyse
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={analyze}
              disabled={pending}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Summarise conversation
            </button>
          )}
        </Section>

        <Section title="Lead information">
          <EditableField
            label="Source"
            value={data.source}
            placeholder="Instagram, Website, Facebook Ads…"
            onSave={(value) => updateContactDetails(data.contactId, { source: value })}
          />
          <EditableField
            label="Campaign"
            value={data.campaign}
            placeholder="Summer Offer"
            onSave={(value) => updateContactDetails(data.contactId, { campaign: value })}
          />
          <EditableField
            label="Potential deal value"
            value={data.dealValue === null ? null : String(data.dealValue)}
            placeholder="25000"
            onSave={(value) =>
              updateContactDetails(data.contactId, {
                dealValue: value.trim() ? Number(value) : null,
              })
            }
          />
        </Section>

        <Section title={`Notes${data.notes.length ? ` (${data.notes.length})` : ""}`}>
          {data.notes.length === 0 ? (
            <p className="text-[11px] text-white/40 leading-relaxed">
              Nothing yet. Add one from the + menu beside the composer — only your team sees it.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.notes.map((note) => (
                <li key={note.id} className="rounded-lg bg-[#FACC15]/6 border border-[#FACC15]/20 p-2.5">
                  <p className="text-xs text-white/70 whitespace-pre-wrap leading-relaxed">
                    {note.body}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-white/35">
                      {note.author} · {relative(note.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          await deleteInternalNote(note.id);
                        })
                      }
                      aria-label="Delete note"
                      className="ml-auto p-1 rounded text-white/30 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Activity">
          {data.events.length === 0 ? (
            <p className="text-[11px] text-white/40">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.events.map((event) => (
                <li key={event.id} className="flex gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/25 mt-1.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs text-white/65 leading-snug">{event.label}</div>
                    <div className="text-[10px] text-white/30">{relative(event.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Customer details">
          <Field label="Phone" value={data.waId} />
          <Field label="First seen" value={new Date(data.createdAt).toLocaleDateString()} />
          <Field label="Tags" value={data.tags.join(", ") || "—"} />
        </Section>
      </div>
    </aside>
  );
}

function scoreColour(score: number): string {
  if (score >= 80) return "text-[#FF6B35]";
  if (score >= 50) return "text-accent-ink";
  return "text-white/50";
}

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/8">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/3 transition-colors"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 text-white/30 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span className="text-xs font-medium text-white/70">{title}</span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1">
      <span className="text-[11px] text-white/40 w-24 flex-shrink-0">{label}</span>
      <span className="text-xs text-white/70 truncate">{value}</span>
    </div>
  );
}

/** Click to edit, blur or Enter to save. No form, no save button per field. */
function EditableField({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onSave: (value: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  const commit = () => {
    setEditing(false);
    if (draft === (value ?? "")) return;
    startTransition(async () => {
      await onSave(draft);
    });
  };

  return (
    <div className="py-1.5">
      <span className="block text-[11px] text-white/40 mb-1">{label}</span>
      {editing ? (
        <input
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setDraft(value ?? "");
              setEditing(false);
            }
          }}
          placeholder={placeholder}
          className="w-full bg-white/5 border border-white/12 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-accent/50"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full text-left text-xs text-white/70 hover:text-white px-2.5 py-1.5 rounded-lg border border-transparent hover:border-white/12 transition-colors"
        >
          {pending ? "Saving…" : value || <span className="text-white/25">{placeholder}</span>}
        </button>
      )}
    </div>
  );
}

function relative(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
