"use client";

import { useEffect, useRef, useState } from "react";
import { markConversationRead } from "@/app/(dashboard)/actions";
import ThreadHeader from "./ThreadHeader";
import CustomerPanel, { type CustomerData } from "./CustomerPanel";
import Composer, {
  type CannedMessage,
  type MediaOption,
  type TemplateOption,
} from "./Composer";
import type { Teammate } from "./ConversationList";
import type { AiMode, Priority } from "@/types/portal";

export interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  buttons: string[];
  status: string;
  createdAt: string;
}

export default function Thread({
  orgId,
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
  unread,
  teammates,
  viaNumber,
  messages,
  canned,
  templates,
  media,
  customer,
}: {
  /** Which of your numbers this conversation is on. */
  viaNumber: string | null;
  orgId: string;
  conversationId: string;
  contactId: string;
  name: string;
  waId: string;
  optedIn: boolean;
  aiMode: AiMode;
  botEnabled: boolean;
  lastBotRun: { outcome: string; label: string | null; error: string | null } | null;
  priority: Priority;
  closed: boolean;
  needsHuman: boolean;
  needsHumanReason: string | null;
  windowOpen: boolean;
  assignedTo: string | null;
  unread: boolean;
  teammates: Teammate[];
  messages: ThreadMessage[];
  canned: CannedMessage[];
  templates: TemplateOption[];
  media: MediaOption[];
  customer: CustomerData;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  // On a narrow screen the customer rail is a drawer, opened from the avatar
  // or the More menu rather than taking a third of the width permanently.
  const [drawer, setDrawer] = useState(false);

  // Opening a thread is what marks it read — anything else and the dot would
  // clear for a message nobody actually looked at.
  useEffect(() => {
    if (!unread) return;
    void markConversationRead(conversationId);
  }, [conversationId, unread]);

  // A chat that opens at the top is a chat you have to scroll to use.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [conversationId, messages.length]);

  return (
    <>
      <section className="flex-1 flex flex-col min-w-0 min-h-0">
        <ThreadHeader
          conversationId={conversationId}
          contactId={contactId}
          name={name}
          waId={waId}
          optedIn={optedIn}
          aiMode={aiMode}
          botEnabled={botEnabled}
          lastBotRun={lastBotRun}
          priority={priority}
          closed={closed}
          needsHuman={needsHuman}
          needsHumanReason={needsHumanReason}
          windowOpen={windowOpen}
          assignedTo={assignedTo}
          teammates={teammates}
          viaNumber={viaNumber}
          onOpenPanel={() => setDrawer(true)}
        />

        <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4">
          {messages.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">
              No messages in this conversation yet.
            </p>
          ) : (
            messages.map((message, index) => {
              const previous = messages[index - 1];
              const showDate = !previous || !sameDay(previous.createdAt, message.createdAt);
              const outbound = message.direction === "outbound";
              // Only label the first of a run — repeating the name on every
              // bubble is noise once you know who is talking.
              const showAuthor = !previous || previous.direction !== message.direction || showDate;

              return (
                <div key={message.id}>
                  {showDate && (
                    <div className="flex justify-center my-4">
                      <span className="px-3 py-1 rounded-full bg-white/6 border border-white/8 text-[11px] text-white/50">
                        {dayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}

                  <div className={`flex gap-2.5 mb-1.5 ${outbound ? "flex-row-reverse" : ""}`}>
                    <div className="w-8 flex-shrink-0">
                      {showAuthor && (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${
                            outbound
                              ? "bg-accent/20 text-accent-ink"
                              : "bg-gradient-to-br from-accent/30 to-accent2/25"
                          }`}
                        >
                          {outbound ? "You" : (name.trim() || waId).slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 max-w-[75%]">
                      <div
                        className={`rounded-2xl px-4 py-2.5 ${
                          outbound
                            ? "bg-accent/12 border border-accent/20"
                            : "bg-white/5 border border-white/10"
                        }`}
                      >
                        <div className="text-sm whitespace-pre-wrap break-words">
                          {message.body}
                        </div>

                        {message.buttons.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {message.buttons.map((label) => (
                              <span
                                key={label}
                                className="px-2.5 py-1 rounded-lg border border-accent2/25 bg-accent2/8 text-accent2-ink text-[11px] font-medium"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        )}

                        <div
                          className={`flex items-center gap-2 mt-1 ${outbound ? "justify-end" : ""}`}
                        >
                          <span className="text-[10px] text-white/35">
                            {new Date(message.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {outbound && (
                            <span
                              className={`text-[10px] ${
                                message.status === "failed" ? "text-red-400" : "text-white/35"
                              }`}
                            >
                              {message.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottom} />
        </div>

        <Composer
          orgId={orgId}
          conversationId={conversationId}
          contactId={contactId}
          windowOpen={windowOpen}
          canned={canned}
          templates={templates}
          media={media}
          tags={customer.tags}
          teammates={teammates}
          assignedTo={assignedTo}
        />
      </section>

      {/* Desktop: a permanent rail. Narrower: a drawer over the thread. */}
      <div className="hidden xl:flex min-h-0">
        <CustomerPanel data={customer} />
      </div>

      {drawer && (
        <div
          className="fixed inset-0 z-40 bg-black/50 xl:hidden"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDrawer(false);
          }}
        >
          <div className="absolute right-0 top-0 bottom-0 flex bg-[var(--app-bg)]">
            <CustomerPanel data={customer} onClose={() => setDrawer(false)} />
          </div>
        </div>
      )}
    </>
  );
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}
