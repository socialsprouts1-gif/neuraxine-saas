"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Bot, User, Sparkles, Phone, RefreshCw } from "lucide-react";
import Header from "@/components/dashboard/Header";
import { mutate } from "@/lib/use-api";

interface Contact { id: string; name: string; phone: string; status: string }
interface Conversation { id: string; contactId: string; unread: number; lastMessagePreview: string; lastMessageAt: string; contact?: Contact }
interface Message { id: string; direction: "in" | "out"; text: string; status: string; timestamp: string; via?: string }

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [reply, setReply] = useState("");
  const [simText, setSimText] = useState("menu");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const json = await fetch("/api/conversations").then((r) => r.json());
    setConversations(json.conversations ?? []);
    setActiveId((cur) => cur ?? json.conversations?.[0]?.id ?? null);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const json = await fetch(`/api/conversations/${id}`).then((r) => r.json());
    setMessages(json.messages ?? []);
    setContact(json.contact ?? null);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { if (activeId) loadThread(activeId); }, [activeId, loadThread]);

  // Light polling so automation replies appear without a manual refresh.
  useEffect(() => {
    const t = setInterval(() => {
      loadConversations();
      if (activeId) loadThread(activeId);
    }, 4000);
    return () => clearInterval(t);
  }, [activeId, loadConversations, loadThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendReply() {
    if (!reply.trim() || !activeId) return;
    setSending(true);
    await mutate(`/api/conversations/${activeId}`, "POST", { text: reply });
    setReply("");
    await loadThread(activeId);
    setSending(false);
  }

  async function simulateInbound() {
    if (!contact || !simText.trim()) return;
    setSending(true);
    await mutate("/api/whatsapp/simulate", "POST", { phone: contact.phone, name: contact.name, text: simText });
    await new Promise((r) => setTimeout(r, 300));
    if (activeId) await loadThread(activeId);
    await loadConversations();
    setSending(false);
  }

  return (
    <div className="bg-[#050508] h-full flex flex-col">
      <Header title="Team Inbox" subtitle="Live WhatsApp conversations with automated replies" />
      <div className="flex-1 flex min-h-0">
        {/* Conversation list */}
        <div className="w-80 border-r border-white/8 flex flex-col min-h-0">
          <div className="p-3 border-b border-white/8 flex items-center justify-between">
            <span className="text-sm font-semibold">Conversations</span>
            <button onClick={loadConversations} className="text-white/40 hover:text-white">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                  activeId === c.id ? "bg-[#00FF87]/8" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{c.contact?.name ?? "Unknown"}</span>
                  <span className="text-[10px] text-white/40 flex-shrink-0">{timeAgo(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-white/45 truncate">{c.lastMessagePreview}</span>
                  {c.unread > 0 && (
                    <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#00FF87] text-[#050508] text-[10px] font-bold flex items-center justify-center">
                      {c.unread}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col min-h-0">
          {contact ? (
            <>
              <div className="px-5 py-3 border-b border-white/8 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00FF87]/30 to-[#00D4FF]/30 flex items-center justify-center text-sm font-bold">
                  {contact.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold">{contact.name}</div>
                  <div className="text-[11px] text-white/40 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> +{contact.phone}
                  </div>
                </div>
                <span className="ml-auto text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-white/5 text-white/50 border border-white/10">
                  {contact.status}
                </span>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.direction === "out"
                        ? "bg-[#00FF87]/15 border border-[#00FF87]/25 rounded-br-sm"
                        : "bg-white/8 border border-white/10 rounded-bl-sm"
                    }`}>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-white/40">
                        {m.via === "automation" && <span className="flex items-center gap-0.5 text-[#00D4FF]"><Bot className="w-2.5 h-2.5" /> bot</span>}
                        {m.via === "flow" && <span className="flex items-center gap-0.5 text-[#A855F7]"><Sparkles className="w-2.5 h-2.5" /> flow</span>}
                        <span>{timeAgo(m.timestamp)}</span>
                        {m.direction === "out" && <span className="capitalize">· {m.status}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Composer */}
              <div className="border-t border-white/8 p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendReply()}
                    placeholder="Type a reply…"
                    className="flex-1 bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00FF87]/50"
                  />
                  <button onClick={sendReply} disabled={sending} className="btn-primary px-4 disabled:opacity-50">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[11px] text-white/35 flex items-center gap-1"><User className="w-3 h-3" /> Simulate inbound:</span>
                  <input
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && simulateInbound()}
                    placeholder="e.g. menu, price, hi"
                    className="flex-1 bg-white/3 border border-white/8 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00D4FF]/40"
                  />
                  <button onClick={simulateInbound} disabled={sending} className="px-3 py-1.5 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/25 text-[#00D4FF] text-xs font-medium hover:bg-[#00D4FF]/20 disabled:opacity-50">
                    Send as customer
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Select a conversation</div>
          )}
        </div>
      </div>
    </div>
  );
}
