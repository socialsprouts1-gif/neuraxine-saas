"use client";

import { useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  FileText,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  deleteKnowledgeEntry,
  importKnowledgeFromUrl,
  saveKnowledgeEntry,
  toggleKnowledgeEntry,
} from "@/app/(dashboard)/portal-actions";
import type { AssistantKnowledge } from "@/types/portal";
import { SaveForm, Select, TextArea, TextInput } from "./EditorControls";

// Files are read in the browser and stored as text, because that is what the
// assistant actually reads. Anything the browser cannot turn into text — a
// PDF, a Word file — has to be pasted in, and the drop zone says so rather
// than accepting it and storing mojibake.
const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json"];
const MAX_FILE_BYTES = 1_000_000;

export default function KnowledgeTab({
  assistantId,
  entries,
  enabled,
}: {
  assistantId: string;
  entries: AssistantKnowledge[];
  /** Mirrors use_knowledge_base, so the tab can say when nothing is read. */
  enabled: boolean;
}) {
  const [composer, setComposer] = useState<Draft | null>(
    entries.length === 0 ? { title: "", content: "", sourceType: "text", sourceUrl: "" } : null
  );
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const active = entries.filter((entry) => entry.is_active);
  const characters = active.reduce((total, entry) => total + entry.content.length, 0);

  const readFiles = async (files: File[]) => {
    setNotice(null);
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (!TEXT_EXTENSIONS.some((extension) => name.endsWith(extension))) {
        setNotice({
          ok: false,
          text: `${file.name} isn't a text file. Open it, copy the text, and paste it in — a PDF or Word file stored raw is unreadable to the assistant.`,
        });
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setNotice({ ok: false, text: `${file.name} is over 1MB. Split it into smaller entries.` });
        return;
      }
      const text = await file.text();
      setComposer({
        title: file.name.replace(/\.[^.]+$/, ""),
        content: text,
        sourceType: "file",
        sourceUrl: "",
      });
    }
  };

  const importUrl = () => {
    const url = window.prompt("Paste the page URL. Its text is fetched once and stored here.");
    if (!url) return;
    setNotice(null);
    startTransition(async () => {
      const result = await importKnowledgeFromUrl(url);
      if (!result.ok || !result.content) {
        setNotice({ ok: false, text: result.error ?? "Could not read that page." });
        return;
      }
      setComposer({
        title: result.title ?? "Imported page",
        content: result.content,
        sourceType: "url",
        sourceUrl: url,
      });
      setNotice({ ok: true, text: "Fetched. Check the text, then add it." });
    });
  };

  return (
    <div className="space-y-5">
      {!enabled && (
        <div className="rounded-xl border border-[#FACC15]/25 bg-[#FACC15]/8 p-4">
          <div className="text-sm font-semibold text-[#FACC15] mb-1">
            This assistant is not reading its knowledge base
          </div>
          <p className="text-xs text-white/50 leading-relaxed">
            Entries are stored, but nothing here reaches the model. Turn on “Smart knowledge
            search” on the Agent Rules tab.
          </p>
        </div>
      )}

      <section className="glass-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-semibold">Knowledge Base</h2>
            <p className="text-xs text-white/45 mt-1 leading-relaxed max-w-xl">
              Create and manage knowledge for your AI assistant. Every active entry is included in
              every reply. Tip: edit an existing entry instead of adding a second copy — they are
              all searched together.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setComposer({ title: "", content: "", sourceType: "text", sourceUrl: "" })
            }
            className="btn-primary text-sm py-2.5 px-4"
          >
            <Plus className="w-4 h-4" />
            Add rich text
          </button>
        </div>

        {/* Upload / import */}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={TEXT_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(event) => {
            // Copy out of the FileList before resetting the input: it is
            // live, and clearing value empties it in place.
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) void readFiles(files);
          }}
        />

        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void readFiles(Array.from(event.dataTransfer.files));
          }}
          className="rounded-xl border-2 border-dashed border-white/12 hover:border-accent/35 transition-colors p-8 text-center"
        >
          <Upload className="w-6 h-6 text-white/30 mx-auto mb-3" />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="text-sm text-white/70 hover:text-white"
          >
            Click to upload, or drag and drop
          </button>
          <p className="text-[11px] text-white/35 mt-1.5">
            .txt, .md, .csv or .json — up to 1MB each
          </p>
          <button
            type="button"
            onClick={importUrl}
            disabled={pending}
            className="btn-secondary text-xs py-2 px-3.5 mt-4 disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Import from URL
          </button>
        </div>

        {notice && (
          <div
            className={`mt-4 rounded-xl border p-3.5 flex items-start gap-2.5 ${
              notice.ok
                ? "border-accent/25 bg-accent/8"
                : "border-[#F87171]/25 bg-[#F87171]/8"
            }`}
          >
            <p className={`text-xs leading-relaxed flex-1 ${notice.ok ? "text-white/60" : "text-white/70"}`}>
              {notice.text}
            </p>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="text-white/40 hover:text-white flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {composer && (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/3 p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold">New knowledge entry</h3>
              <button
                type="button"
                onClick={() => setComposer(null)}
                aria-label="Discard"
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <SaveForm action={saveKnowledgeEntry} label="Add to knowledge base">
              <input type="hidden" name="assistant_id" value={assistantId} />
              <input type="hidden" name="source_url" value={composer.sourceUrl} />

              <div className="grid md:grid-cols-2 gap-4">
                <TextInput
                  label="Title"
                  name="title"
                  value={composer.title}
                  onChange={(event) =>
                    setComposer({ ...composer, title: event.target.value })
                  }
                  placeholder="Refund policy"
                  required
                  hint="The assistant sees this as the heading above the content."
                />
                <Select
                  label="Type"
                  name="source_type"
                  value={composer.sourceType}
                  onChange={(event) =>
                    setComposer({ ...composer, sourceType: event.target.value })
                  }
                  options={[
                    { value: "text", label: "Note" },
                    { value: "faq", label: "Q&A" },
                    { value: "url", label: "Page" },
                    { value: "file", label: "Document" },
                  ]}
                />
              </div>

              <div className="mt-4">
                <TextArea
                  label="Content"
                  name="content"
                  rows={10}
                  required
                  value={composer.content}
                  onChange={(event) =>
                    setComposer({ ...composer, content: event.target.value })
                  }
                  placeholder="Paste the text the assistant should know. Plain sentences work better than bullet fragments."
                  hint={`${composer.content.length.toLocaleString()} characters. The assistant reads what is stored here — it never browses the web.`}
                />
              </div>
            </SaveForm>
          </div>
        )}

        {/* Existing entries */}
        <div className="mt-6">
          {entries.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 grid place-items-center mx-auto mb-3">
                <FileText className="w-5 h-5 text-accent-ink" />
              </div>
              <h3 className="font-semibold mb-1">No knowledge entries yet</h3>
              <p className="text-sm text-white/45 max-w-sm mx-auto leading-relaxed">
                Add text or upload a file so your assistant can answer from your content. Without
                it, it answers from its instructions alone and will say it needs to check anything
                specific to your business.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/45 mb-3">
                <span>
                  <span className="text-white/80 font-semibold tabular-nums">{active.length}</span>{" "}
                  active
                  {entries.length !== active.length && ` of ${entries.length}`}
                </span>
                <span>
                  <span className="text-white/80 font-semibold tabular-nums">
                    {characters.toLocaleString()}
                  </span>{" "}
                  characters sent with every reply
                </span>
              </div>
              <ul className="space-y-2">
                {entries.map((entry) => (
                  <KnowledgeRow key={entry.id} entry={entry} assistantId={assistantId} />
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

interface Draft {
  title: string;
  content: string;
  sourceType: string;
  sourceUrl: string;
}

function KnowledgeRow({
  entry,
  assistantId,
}: {
  entry: AssistantKnowledge;
  assistantId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: (data: FormData) => Promise<{ ok: boolean; error?: string }>) => {
    const data = new FormData();
    data.set("id", entry.id);
    data.set("assistant_id", assistantId);
    data.set("is_active", String(entry.is_active));
    setError(null);
    startTransition(async () => {
      const result = await action(data);
      if (!result.ok) setError(result.error ?? "That didn't work.");
    });
  };

  return (
    <li
      className={`rounded-xl border transition-colors ${
        entry.is_active ? "border-white/10 bg-white/3" : "border-white/8 bg-white/[0.015] opacity-60"
      }`}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="w-8 h-8 rounded-lg bg-white/5 grid place-items-center flex-shrink-0 text-white/50">
          <FileText className="w-4 h-4" />
        </div>

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{entry.title}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-white/30 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {entry.content.length.toLocaleString()} characters
            {entry.assistant_id === null && " · shared with every assistant"}
          </div>
          {!open && <p className="text-[11px] text-white/35 mt-1 line-clamp-1">{entry.content}</p>}
        </button>

        <div className="flex items-center gap-1 flex-shrink-0">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />}
          <button
            type="button"
            onClick={() => run(toggleKnowledgeEntry)}
            disabled={pending}
            className="text-[11px] px-2.5 py-1 rounded-lg border border-white/12 text-white/55 hover:text-white hover:border-white/25 transition-colors disabled:opacity-50"
          >
            {entry.is_active ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            onClick={() => run(deleteKnowledgeEntry)}
            disabled={pending}
            aria-label={`Delete ${entry.title}`}
            className="p-1.5 rounded-lg text-white/35 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="px-3.5 pb-3.5 -mt-1">
          <pre className="text-[11px] text-white/60 whitespace-pre-wrap leading-relaxed bg-white/3 border border-white/8 rounded-lg p-3 max-h-72 overflow-y-auto font-sans">
            {entry.content}
          </pre>
          {entry.source_url && (
            <a
              href={entry.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-accent2-ink hover:underline inline-flex items-center gap-1 mt-2"
            >
              {entry.source_url}
            </a>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 px-3.5 pb-3" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
