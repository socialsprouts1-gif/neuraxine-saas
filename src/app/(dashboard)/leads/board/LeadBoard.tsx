"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, Loader2, MessageCircle } from "lucide-react";
import { moveLeadStage } from "@/app/(dashboard)/leads-actions";
import { LEAD_STAGES, type LeadStage } from "@/types/portal";

export interface LeadCard {
  contactId: string;
  conversationId: string | null;
  name: string;
  waId: string;
  stage: LeadStage;
  score: number | null;
  owner: string | null;
  dealValue: number | null;
  source: string | null;
}

const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  demo: "Demo",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

// A column per stage, dragged between. The stage written here is the same
// column the inbox's dropdown sets, so the board and the conversation can
// never tell you different things about the same lead.
export default function LeadBoard({ leads }: { leads: LeadCard[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);

  const move = (contactId: string, stage: LeadStage) => {
    setDragging(null);
    setOver(null);
    const lead = leads.find((entry) => entry.contactId === contactId);
    if (!lead || lead.stage === stage) return;
    startTransition(async () => {
      await moveLeadStage(contactId, stage);
      router.refresh();
    });
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {LEAD_STAGES.map((stage) => {
        const column = leads.filter((lead) => lead.stage === stage);
        const value = column.reduce((sum, lead) => sum + (lead.dealValue ?? 0), 0);

        return (
          <div
            key={stage}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(stage);
            }}
            onDragLeave={() => setOver((current) => (current === stage ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData("text/plain") || dragging;
              if (id) move(id, stage);
            }}
            className={`w-64 flex-shrink-0 rounded-xl border transition-colors ${
              over === stage ? "border-accent/50 bg-accent/5" : "border-white/8 bg-white/2"
            }`}
          >
            <div className="px-3.5 py-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{STAGE_LABEL[stage]}</span>
                <span className="ml-auto text-xs text-white/35 tabular-nums">
                  {column.length}
                </span>
              </div>
              {value > 0 && (
                <div className="text-[11px] text-accent-ink mt-0.5 tabular-nums">
                  ₹{value.toLocaleString("en-IN")}
                </div>
              )}
            </div>

            <div className="p-2 space-y-2 min-h-[8rem] max-h-[calc(100vh-20rem)] overflow-y-auto">
              {column.length === 0 ? (
                <p className="text-[11px] text-white/25 text-center py-6">Nothing here</p>
              ) : (
                column.map((lead) => (
                  <div
                    key={lead.contactId}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", lead.contactId);
                      setDragging(lead.contactId);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={`rounded-lg border border-white/10 bg-[var(--surface-1)] p-3 cursor-grab active:cursor-grabbing transition-opacity ${
                      dragging === lead.contactId ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{lead.name}</span>
                      {(lead.score ?? 0) >= 70 && (
                        <Flame
                          className="w-3.5 h-3.5 text-[#FF6B35] flex-shrink-0"
                          aria-label={`Lead score ${lead.score}`}
                        />
                      )}
                    </div>
                    <div className="text-[11px] text-white/40 font-mono mt-0.5">{lead.waId}</div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-[10px] text-white/35">
                      {lead.score !== null && <span>Score {lead.score}</span>}
                      {lead.dealValue ? (
                        <span className="text-accent-ink">
                          ₹{lead.dealValue.toLocaleString("en-IN")}
                        </span>
                      ) : null}
                      {lead.source && <span>{lead.source}</span>}
                    </div>

                    <div className="flex items-center gap-2 mt-2.5">
                      {lead.owner && (
                        <span className="text-[10px] text-accent2-ink truncate">{lead.owner}</span>
                      )}
                      {lead.conversationId && (
                        <Link
                          href={`/inbox?c=${lead.conversationId}`}
                          className="ml-auto inline-flex items-center gap-1 text-[10px] text-white/45 hover:text-white"
                        >
                          <MessageCircle className="w-3 h-3" />
                          Open chat
                        </Link>
                      )}
                    </div>

                    {/* Drag is the fast path; the dropdown is the one that
                        works on a touchscreen and with a keyboard. */}
                    <select
                      value={lead.stage}
                      onChange={(event) => move(lead.contactId, event.target.value as LeadStage)}
                      aria-label={`Move ${lead.name} to another stage`}
                      className="w-full mt-2 bg-white/4 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white/60 focus:outline-none focus:border-accent/40"
                    >
                      {LEAD_STAGES.map((option) => (
                        <option key={option} value={option} className="bg-[var(--surface-3)]">
                          {STAGE_LABEL[option]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}

      {pending && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--surface-1)] border border-white/12 text-xs text-white/60 shadow-2xl">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Moving…
        </div>
      )}
    </div>
  );
}
