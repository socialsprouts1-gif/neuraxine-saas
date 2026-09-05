"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Smile } from "lucide-react";
import EmojiPicker from "./EmojiPicker";
import CopilotMenu from "./CopilotMenu";
import PlusMenu from "./PlusMenu";
import type { Teammate } from "./ConversationList";

export interface CannedMessage {
  id: string;
  shortcut: string;
  title: string;
  body: string;
}

export interface TemplateOption {
  id: string;
  name: string;
  language: string;
  category: string;
}

export interface MediaOption {
  id: string;
  name: string;
  url: string;
  type: string;
}

// Posts through the authenticated send endpoint rather than a server action,
// so outbound sending has one code path shared with any future API client.
export default function Composer({
  orgId,
  conversationId,
  contactId,
  windowOpen,
  canned,
  templates,
  media,
  tags,
  teammates,
  assignedTo,
}: {
  orgId: string;
  conversationId: string;
  contactId: string;
  /** Inside the 24-hour service window, free-form text delivers. */
  windowOpen: boolean;
  canned: CannedMessage[];
  templates: TemplateOption[];
  media: MediaOption[];
  tags: string[];
  teammates: Teammate[];
  assignedTo: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"emoji" | "canned" | null>(null);

  const post = async (payload: Record<string, unknown>) => {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // conversationId is what tells the server which of the
        // workspace's numbers to reply from — the one the customer wrote
        // to, not whichever happens to be default.
        body: JSON.stringify({ orgId, contactId, conversationId, ...payload }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result?.error ?? `Send failed (${response.status})`);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error — the message was not sent.");
      return false;
    } finally {
      setSending(false);
    }
  };

  const sendText = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = body.trim();
    if (!text) return;
    if (await post({ body: text })) setBody("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line — the convention every chat
    // client shares, and the one people's hands already know.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendText();
    }
  };

  const insert = (text: string) => {
    setBody((current) => (current ? `${current}${text}` : text));
    input.current?.focus();
  };

  return (
    <div className="border-t border-white/8 bg-[var(--surface-1)]/60 flex-shrink-0">
      <div className="px-4 pt-3 flex flex-wrap items-center gap-3">
        <span className={`text-xs ${windowOpen ? "text-white/40" : "text-[#FACC15]"}`}>
          {windowOpen
            ? "Free-form messages allowed (24h window)"
            : "Window closed — only an approved template will deliver"}
        </span>
        {canned.length > 0 && (
          <button
            type="button"
            onClick={() => setPanel(panel === "canned" ? null : "canned")}
            className="ml-auto text-xs text-white/45 hover:text-white"
          >
            Canned replies
          </button>
        )}
      </div>

      {panel === "canned" && (
        <div className="mx-4 mt-2 rounded-xl border border-white/12 bg-[var(--surface-1)] max-h-52 overflow-y-auto p-1.5">
          {canned.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setBody(entry.body);
                setPanel(null);
                input.current?.focus();
              }}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/6 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{entry.title}</span>
                <code className="text-[10px] text-accent2-ink flex-shrink-0">/{entry.shortcut}</code>
              </div>
              <p className="text-[11px] text-white/40 line-clamp-1 mt-0.5">{entry.body}</p>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 px-4 pt-2" role="alert">
          {error}
        </p>
      )}

      {/* [+] [AI] [type a message] [send] — nothing else lives out here. */}
      <form onSubmit={sendText} className="flex items-end gap-1.5 p-4">
        <PlusMenu
          conversationId={conversationId}
          contactId={contactId}
          tags={tags}
          teammates={teammates}
          assignedTo={assignedTo}
          media={media}
          templates={templates}
          onInsert={insert}
          onSendTemplate={(template) =>
            void post({
              templateName: template.name,
              language: template.language,
              components: [],
            })
          }
        />

        <CopilotMenu conversationId={conversationId} draft={body} onInsert={setBody} />

        <textarea
          ref={input}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Type a message..."
          className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/35 focus:outline-none focus:border-accent/50 transition-all resize-none max-h-32"
        />

        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setPanel(panel === "emoji" ? null : "emoji")}
            aria-label="Emoji"
            className="p-2.5 rounded-xl text-white/45 hover:text-white hover:bg-white/8 transition-colors"
          >
            <Smile className="w-4 h-4" />
          </button>
          {panel === "emoji" && (
            <div className="absolute bottom-full right-0 mb-2 z-30">
              <EmojiPicker onPick={insert} />
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={sending || !body.trim()}
          aria-label="Send"
          className="w-11 h-11 rounded-full bg-accent text-[#050508] grid place-items-center hover:bg-[var(--accent-strong)] transition-colors disabled:opacity-40 flex-shrink-0"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
