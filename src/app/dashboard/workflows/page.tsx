"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GitBranch, Plus, Clock, Zap, ArrowDown, PlayCircle } from "lucide-react";
import Header from "@/components/dashboard/Header";
import { useApi, mutate } from "@/lib/use-api";

interface FlowStep { delayMinutes: number; message: string }
interface Flow {
  id: string; name: string; enabled: boolean; trigger: string; keywords: string[];
  steps: FlowStep[]; enrolledCount: number; completedCount: number;
}
interface Job { id: string; flowName: string; message: string; runAt: string; status: string }

function fmtDelay(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}
function fmtWhen(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const m = Math.round(diff / 60000);
  if (m <= 0) return "due now";
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `in ${h}h` : `in ${Math.round(h / 24)}d`;
}

export default function WorkflowsPage() {
  const { data, refetch } = useApi<{ flows: Flow[]; jobs: Job[] }>("/api/flows");
  const [busy, setBusy] = useState(false);

  const flows = data?.flows ?? [];
  const pendingJobs = (data?.jobs ?? []).filter((j) => j.status === "pending");

  async function processDue() {
    setBusy(true);
    await mutate("/api/cron/process", "POST");
    setBusy(false);
    refetch();
  }

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Workflows" subtitle="Time-delayed drip sequences and follow-ups" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Flows */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><GitBranch className="w-4 h-4 text-[#00FF87]" /> Active flows</h3>
              <button className="btn-primary text-sm py-1.5 px-3"><Plus className="w-3.5 h-3.5" /> New Flow</button>
            </div>
            {flows.map((f, i) => (
              <motion.div key={f.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{f.name}</h4>
                      <span className={`w-2 h-2 rounded-full ${f.enabled ? "bg-[#00FF87]" : "bg-white/20"}`} />
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      Trigger: {f.trigger.replace(/_/g, " ")}{f.keywords.length ? ` · ${f.keywords.join(", ")}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div><div className="text-sm font-bold text-[#00D4FF]">{f.enrolledCount}</div><div className="text-[10px] text-white/40">enrolled</div></div>
                    <div><div className="text-sm font-bold text-[#00FF87]">{f.completedCount}</div><div className="text-[10px] text-white/40">completed</div></div>
                  </div>
                </div>
                {/* Steps */}
                <div className="space-y-2">
                  {f.steps.map((s, idx) => (
                    <div key={idx}>
                      <div className="flex items-start gap-3 bg-white/3 border border-white/8 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-[11px] text-[#F59E0B] font-medium flex-shrink-0 pt-0.5">
                          <Clock className="w-3 h-3" /> {fmtDelay(s.delayMinutes)}
                        </div>
                        <p className="text-sm text-white/70 leading-snug">{s.message}</p>
                      </div>
                      {idx < f.steps.length - 1 && <div className="flex justify-center py-0.5"><ArrowDown className="w-3 h-3 text-white/25" /></div>}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Scheduled jobs */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-[#A855F7]" /> Scheduled</h3>
              <button onClick={processDue} disabled={busy} className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#A855F7]/10 border border-[#A855F7]/25 text-[#A855F7] font-medium disabled:opacity-50">
                <PlayCircle className="w-3.5 h-3.5" /> Run due now
              </button>
            </div>
            <div className="glass-card p-4">
              {pendingJobs.length === 0 ? (
                <p className="text-sm text-white/35 text-center py-6">No pending jobs.<br />Enroll a contact via the Inbox simulator to see drips queue here.</p>
              ) : (
                <div className="space-y-2">
                  {pendingJobs.slice(0, 12).map((j) => (
                    <div key={j.id} className="flex items-start gap-2 text-xs border-b border-white/5 pb-2 last:border-0">
                      <span className="text-[#F59E0B] flex-shrink-0 font-medium">{fmtWhen(j.runAt)}</span>
                      <div className="min-w-0">
                        <div className="text-white/40">{j.flowName}</div>
                        <div className="text-white/70 truncate">{j.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
