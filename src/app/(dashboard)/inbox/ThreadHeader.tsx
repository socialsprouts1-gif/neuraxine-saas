"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MoreVertical, Pencil, X } from "lucide-react";
import { assignConversation, renameContact, setContactOptIn } from "@/app/(dashboard)/actions";
import { setAiMode, setConversationClosed, setPriority } from "./actions";
import { AI_MODES, PRIORITIES, type AiMode, type Priority } from "@/types/portal";
import type { Teammate } from "./ConversationList";

const MODE_LABEL: Record<AiMode, string> = {
  ai: "AI Active",
  copilot: "Copilot",
  human: "Human",
};

const MODE_HELP: Record<AiMode, string> = {
  ai: "AI answers automatically.",
  copilot: "AI suggests, you send.",
  human: "AI is paused on this chat.",
};

const PRIORITY_DOT: Record<Priority, string> = {
  normal: "bg-white/25",
  medium: "bg-[#FACC15]",
  high: "bg-[#FB923C]",
  urgent: "bg-[#F87171]",
};

// Name, number, who is answering, what stage — and everything else behind
// the one ⋮. The header is the thing a new agent reads in two seconds.
export default function ThreadHeader({
  conversationId,
  contactId,
  name,
  waId,
  optedIn,
  aiMode,
  botEnabled,
  lastBotRun,
  priority,
  closed,
  needsHuman,
  needsHumanReason,
  windowOpen,
  assignedTo,
  teammates,
  viaNumber,
  onOpenPanel,
}: {
  conversationId: string;
  contactId: string;
  name: string;
  waId: string;
  /** Which of your numbers this thread is on — replies go out on it. */
  viaNumber: string | null;
  optedIn: boolean;
  aiMode: AiMode;
  /** What the message runner actually checks before replying to anything. */
  botEnabled: boolean;
  /** Why nothing was sent last time, when that is the question being asked. */
  lastBotRun: { outcome: string; label: string | null; error: string | null } | null;
  priority: Priority;
  closed: boolean;
  needsHuman: boolean;
  needsHumanReason: string | null;
  windowOpen: boolean;
  assignedTo: string | null;
  teammates: Teammate[];
  /** Opens the customer drawer on screens too narrow for the rail. */
  onOpenPanel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const modeMenu = useRef<HTMLDetailsElement>(null);
  const moreMenu = useRef<HTMLDetailsElement>(null);

  const run = (work: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await work();
      if (!result.ok) setError(result.error ?? "That didn't work.");
      modeMenu.current?.removeAttribute("open");
      moreMenu.current?.removeAttribute("open");
      router.refresh();
    });

  const assignee = teammates.find((mate) => mate.userId === assignedTo);

  return (
    <header className="px-4 md:px-5 py-3 border-b border-white/8 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenPanel}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/30 to-accent2/25 flex items-center justify-center text-sm font-bold flex-shrink-0"
          aria-label="Customer details"
        >
          {(name.trim() || waId).slice(0, 2).toUpperCase()}
        </button>

        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    run(() => renameContact(contactId, draft));
                    setEditing(false);
                  }
                  if (event.key === "Escape") setEditing(false);
                }}
                autoFocus
                className="bg-white/8 border border-white/15 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none focus:border-accent/50"
              />
              <button
                type="button"
                onClick={() => {
                  run(() => renameContact(contactId, draft));
                  setEditing(false);
                }}
                aria-label="Save name"
                className="p-1.5 rounded-lg text-accent-ink hover:bg-white/8"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(name);
                  setEditing(false);
                }}
                aria-label="Cancel"
                className="p-1.5 rounded-lg text-white/40 hover:bg-white/8"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold truncate">{name || waId}</span>
              <button
                type="button"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                aria-label="Rename contact"
                className="p-1 rounded text-white/30 hover:text-accent-ink transition-colors"
              >
                <Pencil className="w-3 h-3" />
              </button>
              {priority !== "normal" && (
                <span
                  className={`w-2 h-2 rounded-full ${PRIORITY_DOT[priority]}`}
                  title={`Priority: ${priority}`}
                />
              )}
            </div>
          )}
          <div className="text-xs text-white/45 font-mono truncate flex items-center gap-1.5">
            <span>{waId}</span>
            {/* Which of your numbers they wrote to. Only worth the space
                once there is more than one to confuse them with. */}
            {viaNumber && (
              <>
                <span className="text-white/20">·</span>
                <span className="text-white/35 font-sans">via {viaNumber}</span>
              </>
            )}
          </div>
        </div>

        {/* AI mode — the one control an agent reaches for most. */}
        <details ref={modeMenu} className="relative flex-shrink-0">
          <summary
            className={`list-none cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              aiMode === "ai"
                ? "border-accent/30 bg-accent/10 text-accent-ink"
                : aiMode === "copilot"
                  ? "border-accent2/30 bg-accent2/8 text-accent2-ink"
                  : "border-white/15 text-white/60"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                aiMode === "ai" ? "bg-accent" : aiMode === "copilot" ? "bg-accent2" : "bg-white/40"
              }`}
            />
            {MODE_LABEL[aiMode]}
          </summary>

          <div className="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-xl border border-white/12 bg-[var(--surface-1)] shadow-2xl py-1.5">
            {AI_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => run(() => setAiMode(conversationId, mode))}
                className="w-full text-left px-3 py-2 hover:bg-white/6 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Check
                    className={`w-3.5 h-3.5 flex-shrink-0 ${
                      aiMode === mode ? "text-accent-ink" : "opacity-0"
                    }`}
                  />
                  <span className="text-sm text-white/80">{MODE_LABEL[mode]}</span>
                </div>
                <p className="text-[10px] text-white/40 ml-5.5 mt-0.5">{MODE_HELP[mode]}</p>
              </button>
            ))}
          </div>
        </details>

        <details ref={moreMenu} className="relative flex-shrink-0">
          <summary
            aria-label="More"
            className="list-none cursor-pointer p-2 rounded-lg text-white/45 hover:text-white hover:bg-white/8 transition-colors"
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MoreVertical className="w-4 h-4" />
            )}
          </summary>

          <div className="absolute right-0 top-full mt-1.5 z-30 w-60 rounded-xl border border-white/12 bg-[var(--surface-1)] shadow-2xl py-1.5 max-h-96 overflow-y-auto">
            <Heading>Assign to</Heading>
            {teammates.map((mate) => (
              <Item
                key={mate.userId}
                checked={assignedTo === mate.userId}
                onClick={() => run(() => assignConversation(conversationId, mate.userId))}
              >
                {mate.name}
              </Item>
            ))}
            <Item
              checked={!assignedTo}
              onClick={() => run(() => assignConversation(conversationId, null))}
            >
              Nobody
            </Item>

            <Divider />
            <Heading>Priority</Heading>
            {PRIORITIES.map((option) => (
              <Item
                key={option}
                checked={priority === option}
                onClick={() => run(() => setPriority(conversationId, option))}
              >
                <span className="capitalize">{option}</span>
              </Item>
            ))}

            <Divider />
            <Item onClick={onOpenPanel}>Customer details</Item>
            <Item
              onClick={() => run(() => setContactOptIn(contactId, !optedIn))}
              checked={optedIn}
            >
              Opted in to campaigns
            </Item>
            <Item onClick={() => run(() => setConversationClosed(conversationId, !closed))}>
              {closed ? "Reopen conversation" : "Close conversation"}
            </Item>
          </div>
        </details>
      </div>

      {/* Two states that change what an agent should do next. Nothing else
          gets a banner. */}
      {needsHuman && aiMode !== "human" && (
        <div className="flex flex-wrap items-center gap-2 mt-2.5 rounded-lg border border-[#FB923C]/30 bg-[#FB923C]/8 px-3 py-2">
          <span className="text-xs text-[#FB923C] font-medium">Human needed</span>
          {needsHumanReason && (
            <span className="text-[11px] text-white/55">{needsHumanReason}</span>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setAiMode(conversationId, "human"))}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-[#FB923C]/15 border border-[#FB923C]/30 text-[#FB923C] hover:bg-[#FB923C]/25 transition-colors disabled:opacity-50"
          >
            Take over
          </button>
        </div>
      )}

      {!botEnabled && (
        <div className="flex flex-wrap items-center gap-2 mt-2.5 rounded-lg border border-white/12 bg-white/4 px-3 py-2">
          <span className="text-xs text-white/60">
            Automation is paused on this chat — no chatbot, FAQ or AI reply will be sent.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setAiMode(conversationId, "ai"))}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-accent/30 bg-accent/10 text-accent-ink hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            Resume automation
          </button>
        </div>
      )}

      {/* What the bot did last. Without this, "it did not reply" and "it was
          never asked to" look identical from the outside. */}
      {botEnabled && lastBotRun && lastBotRun.outcome !== "replied" && (
        <p
          className={`text-[11px] mt-2 ${
            lastBotRun.outcome === "failed" ? "text-red-400" : "text-white/35"
          }`}
        >
          {lastBotRun.outcome === "failed"
            ? `Bot error: ${lastBotRun.error ?? "unknown"}`
            : `Bot ${lastBotRun.outcome}${lastBotRun.label ? ` — ${lastBotRun.label}` : ""}`}
        </p>
      )}

      {!windowOpen && (
        <p className="text-[11px] text-[#FACC15] mt-2">
          The 24-hour window has closed — only an approved template will reach this person.
        </p>
      )}

      {assignee && (
        <p className="text-[11px] text-white/35 mt-1.5">Assigned to {assignee.name}</p>
      )}

      {error && (
        <p className="text-xs text-red-400 mt-2" role="alert">
          {error}
        </p>
      )}
    </header>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-white/8 my-1.5" />;
}

function Item({
  children,
  onClick,
  checked,
}: {
  children: React.ReactNode;
  onClick: () => void;
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/6 transition-colors"
    >
      {checked !== undefined && (
        <Check
          className={`w-3.5 h-3.5 flex-shrink-0 ${checked ? "text-accent-ink" : "opacity-0"}`}
        />
      )}
      <span className="truncate">{children}</span>
    </button>
  );
}
