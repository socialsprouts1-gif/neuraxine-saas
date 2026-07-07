"use client";

import { useState } from "react";
import Header from "@/components/dashboard/Header";
import { PhoneIncoming, PhoneOutgoing, X, Play, Download, Smile, Meh, Frown } from "lucide-react";
import { seedCalls } from "@/lib/data";
import type { CallLog } from "@/lib/types";
import { formatDuration, formatINR, timeAgo } from "@/lib/utils";

const statusTag: Record<string, string> = {
  completed: "tag-green",
  failed: "tag-red",
  "no-answer": "tag-yellow",
  busy: "tag-yellow",
  "in-progress": "tag-cyan",
};

const sentimentIcon = {
  positive: <Smile className="w-4 h-4 text-[#34D399]" />,
  neutral: <Meh className="w-4 h-4 text-[#FBBF24]" />,
  negative: <Frown className="w-4 h-4 text-[#F87171]" />,
};

const filters = ["all", "completed", "no-answer", "busy", "failed"] as const;

export default function CallsPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [selected, setSelected] = useState<CallLog | null>(null);

  const calls = seedCalls.filter((c) => filter === "all" || c.status === filter);

  return (
    <>
      <Header title="Call Logs" subtitle="Every conversation, recorded and transcribed" />
      <main className="flex-1 p-6">
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${
                filter === f
                  ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/12 text-[#A78BFA]"
                  : "border-white/10 text-white/50 hover:border-white/25"
              }`}
            >
              {f === "all" ? `All (${seedCalls.length})` : f}
            </button>
          ))}
        </div>

        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/40 border-b border-white/8 bg-white/2">
                  <th className="p-4 font-medium">Contact</th>
                  <th className="p-4 font-medium">Agent</th>
                  <th className="p-4 font-medium">Direction</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Sentiment</th>
                  <th className="p-4 font-medium">Duration</th>
                  <th className="p-4 font-medium">Cost</th>
                  <th className="p-4 font-medium">Outcome</th>
                  <th className="p-4 font-medium text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr
                    key={call.id}
                    onClick={() => setSelected(call)}
                    className="border-b border-white/5 last:border-0 hover:bg-white/3 cursor-pointer transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-medium">{call.contactName}</div>
                      <div className="text-xs text-white/35">{call.phone}</div>
                    </td>
                    <td className="p-4 text-white/60">{call.agentName.split(" — ")[0]}</td>
                    <td className="p-4">
                      <span className="flex items-center gap-1.5 text-white/60 text-xs">
                        {call.direction === "outbound" ? (
                          <PhoneOutgoing className="w-3.5 h-3.5 text-[#A78BFA]" />
                        ) : (
                          <PhoneIncoming className="w-3.5 h-3.5 text-[#22D3EE]" />
                        )}
                        {call.direction}
                      </span>
                    </td>
                    <td className="p-4"><span className={statusTag[call.status]}>{call.status}</span></td>
                    <td className="p-4">{sentimentIcon[call.sentiment]}</td>
                    <td className="p-4 text-white/60">{call.durationSec ? formatDuration(call.durationSec) : "—"}</td>
                    <td className="p-4 text-white/60">{formatINR(call.costInr)}</td>
                    <td className="p-4 text-white/60 max-w-[200px] truncate">{call.outcome}</td>
                    <td className="p-4 text-white/40 text-right whitespace-nowrap">{timeAgo(call.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg bg-[#0B0B14] border-l border-white/10 h-full overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="font-bold">{selected.contactName}</h2>
                <p className="text-xs text-white/40">{selected.phone} · {timeAgo(selected.startedAt)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-white/8">
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="glass-card p-3.5 text-center">
                <div className="text-sm font-bold">{selected.durationSec ? formatDuration(selected.durationSec) : "—"}</div>
                <div className="text-[10px] text-white/40 mt-0.5">Duration</div>
              </div>
              <div className="glass-card p-3.5 text-center">
                <div className="text-sm font-bold">{formatINR(selected.costInr)}</div>
                <div className="text-[10px] text-white/40 mt-0.5">Cost</div>
              </div>
              <div className="glass-card p-3.5 text-center">
                <div className="text-sm font-bold capitalize">{selected.sentiment}</div>
                <div className="text-[10px] text-white/40 mt-0.5">Sentiment</div>
              </div>
            </div>

            <div className="glass-card p-4 mb-6">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-white/60">Outcome</span>
                <span className={statusTag[selected.status]}>{selected.status}</span>
              </div>
              <p className="text-sm">{selected.outcome}</p>
            </div>

            {selected.transcript.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Transcript</h3>
                  <div className="flex gap-2">
                    <button className="btn-secondary !py-1.5 !px-3 text-xs">
                      <Play className="w-3 h-3" /> Recording
                    </button>
                    <button className="btn-secondary !py-1.5 !px-3 text-xs">
                      <Download className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {selected.transcript.map((line, i) => (
                    <div key={i} className={`flex ${line.speaker === "agent" ? "" : "justify-end"}`}>
                      <div
                        className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                          line.speaker === "agent"
                            ? "bg-[#8B5CF6]/12 border border-[#8B5CF6]/20 rounded-tl-sm"
                            : "bg-white/6 border border-white/10 rounded-tr-sm"
                        }`}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/35 mb-1">
                          {line.speaker === "agent" ? selected.agentName.split(" — ")[0] : selected.contactName}
                        </div>
                        {line.text}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {selected.transcript.length === 0 && (
              <div className="text-center text-xs text-white/35 py-10">
                No transcript — the call didn&apos;t connect.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
