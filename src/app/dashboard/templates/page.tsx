"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Layers, CheckCircle, Clock, XCircle } from "lucide-react";
import Header from "@/components/dashboard/Header";
import { useApi, mutate } from "@/lib/use-api";

interface Template {
  id: string; name: string; category: string; language: string; status: string; body: string; variableCount: number;
}

const statusMeta: Record<string, { color: string; icon: typeof CheckCircle }> = {
  approved: { color: "#00FF87", icon: CheckCircle },
  pending: { color: "#F59E0B", icon: Clock },
  rejected: { color: "#EF4444", icon: XCircle },
};
const catColor: Record<string, string> = { marketing: "#A855F7", utility: "#00D4FF", authentication: "#F59E0B" };

export default function TemplatesPage() {
  const { data, refetch } = useApi<{ templates: Template[] }>("/api/templates");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", category: "utility", body: "" });

  const templates = data?.templates ?? [];

  async function create() {
    if (!form.name || !form.body) return;
    await mutate("/api/templates", "POST", form);
    setForm({ name: "", category: "utility", body: "" });
    setCreating(false);
    refetch();
  }

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Message Templates" subtitle="Pre-approved messages for sending outside the 24h window" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            {["approved", "pending", "rejected"].map((s) => {
              const Meta = statusMeta[s];
              const count = templates.filter((t) => t.status === s).length;
              return (
                <div key={s} className="flex items-center gap-2 text-sm">
                  <Meta.icon className="w-4 h-4" style={{ color: Meta.color }} />
                  <span className="text-white/60 capitalize">{count} {s}</span>
                </div>
              );
            })}
          </div>
          <button onClick={() => setCreating(!creating)} className="btn-primary text-sm py-2"><Plus className="w-4 h-4" /> New Template</button>
        </div>

        {creating && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass-card p-5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Template name"
                className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40">
                <option value="utility">Utility</option>
                <option value="marketing">Marketing</option>
                <option value="authentication">Authentication</option>
              </select>
            </div>
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3}
              placeholder="Message body. Use {{1}}, {{2}} for variables." className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
            <div className="flex gap-2">
              <button onClick={create} className="btn-primary text-sm py-2">Submit for approval</button>
              <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/60">Cancel</button>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((t, i) => {
            const Meta = statusMeta[t.status];
            return (
              <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass-card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4" style={{ color: catColor[t.category] }} />
                    <span className="font-mono text-sm font-medium">{t.name}</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 capitalize" style={{ background: `${Meta.color}15`, color: Meta.color, border: `1px solid ${Meta.color}30` }}>
                    <Meta.icon className="w-3 h-3" /> {t.status}
                  </span>
                </div>
                <p className="text-sm text-white/60 leading-relaxed min-h-[60px]">{t.body}</p>
                <div className="flex items-center gap-2 mt-3 text-[11px] text-white/40">
                  <span className="px-1.5 py-0.5 rounded capitalize" style={{ background: `${catColor[t.category]}12`, color: catColor[t.category] }}>{t.category}</span>
                  <span>{t.language}</span>
                  <span>· {t.variableCount} variables</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
