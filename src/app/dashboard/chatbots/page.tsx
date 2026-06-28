"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, Plus, Zap, Play, Trash2, MessageSquare } from "lucide-react";
import Header from "@/components/dashboard/Header";
import { useApi, mutate } from "@/lib/use-api";

interface Rule {
  id: string; name: string; enabled: boolean; triggerType: string; keywords: string[];
  matchType: string; responseType: string; responseText?: string; priority: number; triggeredCount: number;
}

const triggerColor: Record<string, string> = { keyword: "#00D4FF", welcome: "#00FF87", default: "#A855F7" };

export default function ChatbotsPage() {
  const { data, refetch } = useApi<{ rules: Rule[] }>("/api/automations");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", keywords: "", responseText: "" });
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  const rules = data?.rules ?? [];

  async function toggle(rule: Rule) {
    await mutate(`/api/automations/${rule.id}`, "PATCH", { enabled: !rule.enabled });
    refetch();
  }
  async function remove(id: string) {
    await mutate(`/api/automations/${id}`, "DELETE");
    refetch();
  }
  async function create() {
    if (!form.name || !form.responseText) return;
    await mutate("/api/automations", "POST", {
      name: form.name,
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      responseText: form.responseText,
      triggerType: "keyword",
    });
    setForm({ name: "", keywords: "", responseText: "" });
    setCreating(false);
    refetch();
  }
  async function test() {
    if (!testText.trim()) return;
    const res = await mutate<{ reply?: { text: string } | null }>("/api/whatsapp/simulate", "POST", {
      phone: "10000000001", name: "Test User", text: testText,
    });
    setTestResult(res.reply?.text ?? "No rule matched (no auto-reply sent).");
    refetch();
  }

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Chatbot Rules" subtitle="Keyword auto-replies that respond instantly, 24/7" />
      <div className="p-6 space-y-6">
        {/* Toolbar + tester */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass-card p-4 lg:col-span-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00FF87]/12 border border-[#00FF87]/25 flex items-center justify-center">
                <Bot className="w-5 h-5 text-[#00FF87]" />
              </div>
              <div>
                <div className="font-semibold">{rules.filter((r) => r.enabled).length} active rules</div>
                <div className="text-xs text-white/45">{rules.reduce((a, r) => a + r.triggeredCount, 0).toLocaleString()} total triggers</div>
              </div>
            </div>
            <button onClick={() => setCreating(!creating)} className="btn-primary text-sm py-2">
              <Plus className="w-4 h-4" /> New Rule
            </button>
          </div>

          <div className="glass-card p-4">
            <div className="text-xs font-semibold text-white/70 mb-2 flex items-center gap-1.5"><Play className="w-3.5 h-3.5 text-[#00D4FF]" /> Test a message</div>
            <div className="flex gap-2">
              <input value={testText} onChange={(e) => setTestText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && test()}
                placeholder="e.g. menu" className="flex-1 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00D4FF]/40" />
              <button onClick={test} className="px-3 py-2 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/25 text-[#00D4FF] text-xs font-medium">Run</button>
            </div>
            {testResult && <div className="mt-2 text-xs text-white/70 bg-white/5 rounded-lg p-2 border border-white/10">🤖 {testResult}</div>}
          </div>
        </div>

        {creating && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass-card p-5 space-y-3">
            <h3 className="font-semibold text-sm">Create rule</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rule name (e.g. Shipping info)"
                className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
              <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="Keywords, comma separated"
                className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
            </div>
            <textarea value={form.responseText} onChange={(e) => setForm({ ...form, responseText: e.target.value })} placeholder="Auto-reply message…" rows={2}
              className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
            <div className="flex gap-2">
              <button onClick={create} className="btn-primary text-sm py-2">Save rule</button>
              <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/60">Cancel</button>
            </div>
          </motion.div>
        )}

        {/* Rules list */}
        <div className="space-y-3">
          {rules.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="glass-card p-5 flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${triggerColor[r.triggerType] ?? "#888"}15`, border: `1px solid ${triggerColor[r.triggerType] ?? "#888"}30` }}>
                <MessageSquare className="w-4 h-4" style={{ color: triggerColor[r.triggerType] ?? "#888" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{r.name}</h3>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-white/45 border border-white/10">{r.triggerType}</span>
                </div>
                {r.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {r.keywords.map((k) => <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20">{k}</span>)}
                  </div>
                )}
                <p className="text-sm text-white/55 mt-2 line-clamp-2">{r.responseText}</p>
                <div className="text-[11px] text-white/35 mt-1.5 flex items-center gap-1"><Zap className="w-3 h-3" /> {r.triggeredCount.toLocaleString()} triggers</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggle(r)} className={`relative w-10 h-5.5 rounded-full transition-colors ${r.enabled ? "bg-[#00FF87]" : "bg-white/15"}`} style={{ height: 22 }}>
                  <span className={`absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white transition-all ${r.enabled ? "left-[20px]" : "left-0.5"}`} />
                </button>
                <button onClick={() => remove(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
