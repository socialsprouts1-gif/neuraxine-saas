"use client";

import { useState } from "react";
import Header from "@/components/dashboard/Header";
import { Megaphone, Plus, Upload, X, Calendar, Clock } from "lucide-react";
import { seedCampaigns, seedAgents } from "@/lib/data";
import { formatNumber } from "@/lib/utils";
import toast, { Toaster } from "react-hot-toast";

const statusTag: Record<string, string> = {
  running: "tag-green",
  scheduled: "tag-yellow",
  completed: "tag-violet",
  paused: "tag-saffron",
  draft: "tag-cyan",
};

export default function CampaignsPage() {
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: "#10101C", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" } }} />
      <Header title="Campaigns" subtitle="Bulk outbound calling with smart retries" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-white/50">{seedCampaigns.length} campaigns · calls run only inside TRAI-allowed hours</p>
          <button onClick={() => setShowNew(true)} className="btn-primary !py-2.5 text-sm">
            <Plus className="w-4 h-4" /> New Campaign
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {seedCampaigns.map((c) => {
            const pct = c.totalContacts ? Math.round((c.called / c.totalContacts) * 100) : 0;
            const connectRate = c.called ? Math.round((c.connected / c.called) * 100) : 0;
            return (
              <div key={c.id} className="glass-card p-6">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#22D3EE]/12 border border-[#22D3EE]/25 flex items-center justify-center">
                      <Megaphone className="w-5 h-5 text-[#22D3EE]" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{c.name}</div>
                      <div className="text-xs text-white/40">{c.agentName}</div>
                    </div>
                  </div>
                  <span className={statusTag[c.status]}>{c.status}</span>
                </div>

                <div className="h-2 rounded-full bg-white/8 overflow-hidden mb-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE]" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-white/40 mb-5">
                  <span>{formatNumber(c.called)} of {formatNumber(c.totalContacts)} dialed</span>
                  <span>{pct}%</span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-white/3 border border-white/8 text-center">
                    <div className="text-base font-bold">{formatNumber(c.connected)}</div>
                    <div className="text-[10px] text-white/40 mt-0.5">Connected · {connectRate}%</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/3 border border-white/8 text-center">
                    <div className="text-base font-bold text-[#34D399]">{formatNumber(c.converted)}</div>
                    <div className="text-[10px] text-white/40 mt-0.5">Goal met</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/3 border border-white/8 text-center">
                    <div className="text-base font-bold">{c.connected ? Math.round((c.converted / c.connected) * 100) : 0}%</div>
                    <div className="text-[10px] text-white/40 mt-0.5">Conversion</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-white/40">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {new Date(c.scheduledFor).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                  <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {c.callWindow}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative glass-card !bg-[#10101C] w-full max-w-lg p-7">
            <button onClick={() => setShowNew(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/8">
              <X className="w-4 h-4 text-white/50" />
            </button>
            <h2 className="text-lg font-bold mb-6">New calling campaign</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Campaign name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali offer follow-ups" className="input-dark" />
              </div>
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Voice agent</label>
                <select className="input-dark">
                  {seedAgents.map((a) => (
                    <option key={a.id} className="bg-[#10101C]">{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Contacts</label>
                <div className="p-6 rounded-xl border border-dashed border-white/15 text-center hover:border-[#8B5CF6]/40 transition-colors cursor-pointer">
                  <Upload className="w-6 h-6 text-white/25 mx-auto mb-2" />
                  <div className="text-xs text-white/45">Upload CSV — we&apos;ll auto-scrub DND numbers</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-white/60 mb-1.5 block">Start date</label>
                  <input type="date" className="input-dark" />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/60 mb-1.5 block">Call window</label>
                  <select className="input-dark">
                    <option className="bg-[#10101C]">10 AM – 6 PM</option>
                    <option className="bg-[#10101C]">9 AM – 7 PM</option>
                    <option className="bg-[#10101C]">11 AM – 5 PM</option>
                  </select>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowNew(false);
                  toast.success(`Campaign "${name || "Untitled"}" created as draft`);
                }}
                className="btn-primary w-full text-sm"
              >
                Create campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
