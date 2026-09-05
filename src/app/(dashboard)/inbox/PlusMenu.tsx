"use client";

import { useState, useTransition } from "react";
import {
  Clock,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  StickyNote,
  Tag,
  UserPlus,
  X,
} from "lucide-react";
import { addInternalNote, addReminder } from "./actions";
import { assignConversation } from "@/app/(dashboard)/actions";
import { updateContactDetails } from "./actions";
import type { MediaOption, TemplateOption } from "./Composer";
import type { Teammate } from "./ConversationList";

const REMINDERS: Array<[string, number]> = [
  ["In 15 minutes", 15],
  ["In 1 hour", 60],
  ["Tomorrow", 60 * 24],
  ["Next week", 60 * 24 * 7],
];

type View = "menu" | "note" | "reminder" | "tag" | "assign" | "media" | "template";

/**
 * Everything the composer used to wear as a row of icons. One button, six
 * things behind it — the composer stays [+] [AI] [text] [send].
 */
export default function PlusMenu({
  conversationId,
  contactId,
  tags,
  teammates,
  assignedTo,
  media,
  templates,
  onInsert,
  onSendTemplate,
}: {
  conversationId: string;
  contactId: string;
  tags: string[];
  teammates: Teammate[];
  assignedTo: string | null;
  media: MediaOption[];
  templates: TemplateOption[];
  onInsert: (text: string) => void;
  onSendTemplate: (template: TemplateOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const close = () => {
    setOpen(false);
    setView("menu");
    setText("");
    setMessage(null);
  };

  const run = (work: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    startTransition(async () => {
      const result = await work();
      setMessage({ ok: result.ok, text: result.error ?? result.message ?? "Done." });
      if (result.ok) {
        setText("");
        setView("menu");
      }
    });

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="More actions"
        className={`p-2.5 rounded-xl transition-colors ${
          open ? "bg-white/10 text-white" : "text-white/45 hover:text-white hover:bg-white/8"
        }`}
      >
        <Plus className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-30 w-72 rounded-xl border border-white/12 bg-[var(--surface-1)] shadow-2xl">
          {view === "menu" && (
            <div className="p-1.5">
              <Row icon={<Paperclip className="w-4 h-4" />} onClick={() => setView("media")}>
                Media
              </Row>
              <Row icon={<StickyNote className="w-4 h-4" />} onClick={() => setView("note")}>
                Internal note
              </Row>
              <Row icon={<Clock className="w-4 h-4" />} onClick={() => setView("reminder")}>
                Reminder
              </Row>
              <Row icon={<Tag className="w-4 h-4" />} onClick={() => setView("tag")}>
                Add tag
              </Row>
              <Row icon={<UserPlus className="w-4 h-4" />} onClick={() => setView("assign")}>
                Assign
              </Row>
              <Row icon={<FileText className="w-4 h-4" />} onClick={() => setView("template")}>
                Template
              </Row>
            </div>
          )}

          {view === "note" && (
            <Panel title="Internal note" onBack={() => setView("menu")} onClose={close}>
              <p className="text-[11px] text-white/40 mb-2 leading-relaxed">
                Only your team sees this. It is never sent to the customer.
              </p>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={4}
                autoFocus
                placeholder="Wants the annual plan. Follow up tomorrow at 11."
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 resize-y"
              />
              <button
                type="button"
                disabled={pending || !text.trim()}
                onClick={() => run(() => addInternalNote(conversationId, text))}
                className="btn-primary text-xs py-2 px-3.5 w-full justify-center mt-2 disabled:opacity-50"
              >
                {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save note
              </button>
            </Panel>
          )}

          {view === "reminder" && (
            <Panel title="Remind me" onBack={() => setView("menu")} onClose={close}>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Follow up on pricing"
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 mb-2"
              />
              {REMINDERS.map(([label, minutes]) => (
                <button
                  key={label}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => addReminder(conversationId, contactId, minutes, text || "Follow up"))
                  }
                  className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/6 transition-colors disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </Panel>
          )}

          {view === "tag" && (
            <Panel title="Add tag" onBack={() => setView("menu")} onClose={close}>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && text.trim()) {
                    run(() =>
                      updateContactDetails(contactId, {
                        tags: [...new Set([...tags, text.trim().toLowerCase()])],
                      })
                    );
                  }
                }}
                autoFocus
                placeholder="interested"
                className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((existing) => (
                    <span
                      key={existing}
                      className="text-[11px] px-2 py-0.5 rounded-lg bg-white/6 text-white/55"
                    >
                      {existing}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                disabled={pending || !text.trim()}
                onClick={() =>
                  run(() =>
                    updateContactDetails(contactId, {
                      tags: [...new Set([...tags, text.trim().toLowerCase()])],
                    })
                  )
                }
                className="btn-primary text-xs py-2 px-3.5 w-full justify-center mt-2 disabled:opacity-50"
              >
                Add tag
              </button>
            </Panel>
          )}

          {view === "assign" && (
            <Panel title="Assign to" onBack={() => setView("menu")} onClose={close}>
              {teammates.map((mate) => (
                <button
                  key={mate.userId}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => assignConversation(conversationId, mate.userId))}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50 ${
                    assignedTo === mate.userId
                      ? "text-accent-ink bg-accent/8"
                      : "text-white/70 hover:text-white hover:bg-white/6"
                  }`}
                >
                  {mate.name}
                </button>
              ))}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => assignConversation(conversationId, null))}
                className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/6 transition-colors disabled:opacity-50"
              >
                Nobody
              </button>
            </Panel>
          )}

          {view === "media" && (
            <Panel title="Media" onBack={() => setView("menu")} onClose={close}>
              {media.length === 0 ? (
                <p className="text-[11px] text-white/40 leading-relaxed py-2">
                  Nothing in the Gallery yet. WhatsApp needs a hosted URL, so attachments come from
                  your own media library.
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto">
                  {media.map((asset) => (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => {
                        onInsert(asset.url);
                        close();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/6 transition-colors"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                      <span className="text-sm truncate">{asset.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {view === "template" && (
            <Panel title="Send template" onBack={() => setView("menu")} onClose={close}>
              {templates.length === 0 ? (
                <p className="text-[11px] text-white/40 leading-relaxed py-2">
                  No approved templates yet. Only an approved template can reach someone outside the
                  24-hour window.
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        onSendTemplate(template);
                        close();
                      }}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/6 transition-colors"
                    >
                      <div className="text-sm truncate">{template.name}</div>
                      <div className="text-[10px] text-white/40">{template.language}</div>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          )}

          {message && (
            <p
              className={`text-xs px-3 pb-3 ${message.ok ? "text-accent-ink" : "text-red-400"}`}
              role="status"
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  icon,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/6 transition-colors"
    >
      <span className="text-white/45">{icon}</span>
      {children}
    </button>
  );
}

function Panel({
  title,
  children,
  onBack,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="p-3">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-semibold text-white/70 hover:text-white"
        >
          ‹ {title}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded-lg text-white/40 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}
