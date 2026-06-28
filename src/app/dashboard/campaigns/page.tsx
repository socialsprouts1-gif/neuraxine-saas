"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Send, CheckCircle, Clock, Eye, MousePointer, Megaphone, Rocket } from "lucide-react";
import Header from "@/components/dashboard/Header";
import { useApi, mutate } from "@/lib/use-api";

interface Campaign {
  id: string; name: string; type: string; status: string; templateName?: string; audienceTag?: string;
  recipientCount: number; stats: { sent: number; delivered: number; read: number; failed: number; clicked: number };
}
interface Template { id: string; name: string; status: string }

const statusColor: Record<string, string> = {
  sent: "#00FF87", sending: "#00D4FF", scheduled: "#F59E0B", draft: "#9CA3AF", paused: "#EC4899",
};

export default function CampaignsPage() {
  const { data, refetch } = useApi<{ campaigns: Campaign[] }>("/api/campaigns");
  const { data: tplData } = useApi<{ templates: Template[] }>("/api/templates");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", templateName: "", audienceTag: "" });

  const campaigns = data?.campaigns ?? [];
  const tags = ["", "lead", "customer", "active", "website", "abandoned-cart"];

  async function createAndSend(send: boolean) {
    if (!form.name) return;
    setBusy(true);
    await mutate("/api/campaigns", "POST", { ...form, send });
    setForm({ name: "", templateName: "", audienceTag: "" });
    setCreating(false);
    setBusy(false);
    refetch();
  }
  async function sendNow(id: string) {
    setBusy(true);
    await mutate(`/api/campaigns/${id}/send`, "POST");
    setBusy(false);
    refetch();
  }

  const totals = campaigns.reduce((a, c) => ({ sent: a.sent + c.stats.sent, read: a.read + c.stats.read, clicked: a.clicked + c.stats.clicked }), { sent: 0, read: 0, clicked: 0 });

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Campaigns" subtitle="Broadcast templates to your audience" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Campaigns", value: campaigns.length, icon: Megaphone, color: "#00FF87" },
            { label: "Messages Sent", value: totals.sent.toLocaleString(), icon: Send, color: "#00D4FF" },
            { label: "Read", value: totals.read.toLocaleString(), icon: Eye, color: "#A855F7" },
            { label: "Clicks", value: totals.clicked.toLocaleString(), icon: MousePointer, color: "#F59E0B" },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }}>
                <s.icon className="w-5 h-5" style={{ color: s.color }} />
              </div>
              <div>
                <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs text-white/50">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <button onClick={() => setCreating(!creating)} className="btn-primary text-sm py-2"><Plus className="w-4 h-4" /> New Campaign</button>
        </div>

        {creating && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass-card p-5 space-y-3">
            <h3 className="font-semibold text-sm">Create broadcast</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Campaign name"
                className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
              <select value={form.templateName} onChange={(e) => setForm({ ...form, templateName: e.target.value })}
                className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40">
                <option value="">No template</option>
                {(tplData?.templates ?? []).filter((t) => t.status === "approved").map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
              <select value={form.audienceTag} onChange={(e) => setForm({ ...form, audienceTag: e.target.value })}
                className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40">
                {tags.map((t) => <option key={t} value={t}>{t === "" ? "All contacts" : `Tag: ${t}`}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => createAndSend(true)} disabled={busy} className="btn-primary text-sm py-2 disabled:opacity-50"><Rocket className="w-4 h-4" /> Send now</button>
              <button onClick={() => createAndSend(false)} disabled={busy} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70">Save draft</button>
            </div>
          </motion.div>
        )}

        <div className="space-y-3">
          {campaigns.map((c, i) => {
            const openRate = c.stats.sent ? Math.round((c.stats.read / c.stats.sent) * 100) : 0;
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass-card p-5">
                <div className="flex items-center gap-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{c.name}</h3>
                      <span className="text-[11px] px-2 py-0.5 rounded-full capitalize flex items-center gap-1" style={{ background: `${statusColor[c.status]}15`, color: statusColor[c.status], border: `1px solid ${statusColor[c.status]}30` }}>
                        {c.status === "sent" ? <CheckCircle className="w-3 h-3" /> : c.status === "scheduled" ? <Clock className="w-3 h-3" /> : null}
                        {c.status}
                      </span>
                    </div>
                    <div className="text-xs text-white/40 mt-1">
                      {c.type} · {c.audienceTag ? `tag: ${c.audienceTag}` : "all contacts"}{c.templateName ? ` · ${c.templateName}` : ""}
                    </div>
                  </div>
                  {c.stats.sent > 0 ? (
                    <div className="hidden md:grid grid-cols-4 gap-6 text-center">
                      {[
                        { l: "Sent", v: c.stats.sent }, { l: "Delivered", v: c.stats.delivered },
                        { l: `${openRate}% Read`, v: c.stats.read }, { l: "Clicked", v: c.stats.clicked },
                      ].map((s) => (
                        <div key={s.l}><div className="text-sm font-bold">{s.v.toLocaleString()}</div><div className="text-[10px] text-white/40">{s.l}</div></div>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => sendNow(c.id)} disabled={busy} className="px-4 py-2 rounded-lg bg-[#00FF87]/10 border border-[#00FF87]/25 text-[#00FF87] text-xs font-medium hover:bg-[#00FF87]/20 disabled:opacity-50">
                      <Send className="w-3.5 h-3.5 inline mr-1" /> Send now
                    </button>
                  )}
                </div>
                {c.stats.sent > 0 && (
                  <div className="mt-4 h-1 bg-white/8 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(c.stats.delivered / c.stats.sent) * 100}%`, background: statusColor[c.status] }} />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
