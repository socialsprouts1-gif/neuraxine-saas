"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, UserPlus, Phone, Mail, Tag } from "lucide-react";
import Header from "@/components/dashboard/Header";
import { useApi, mutate } from "@/lib/use-api";

interface Contact {
  id: string; name: string; phone: string; email?: string; tags: string[];
  status: string; lastActiveAt: string; attributes: Record<string, string>;
}

const statusColor: Record<string, string> = {
  lead: "#F59E0B", active: "#00D4FF", customer: "#00FF87", blocked: "#EF4444",
};

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function CrmPage() {
  const { data, refetch } = useApi<{ contacts: Contact[] }>("/api/contacts");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", tags: "" });

  const contacts = (data?.contacts ?? []).filter(
    (c) => c.name.toLowerCase().includes(query.toLowerCase()) || c.phone.includes(query),
  );

  async function add() {
    if (!form.name || !form.phone) return;
    await mutate("/api/contacts", "POST", {
      name: form.name, phone: form.phone, email: form.email,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setForm({ name: "", phone: "", email: "", tags: "" });
    setAdding(false);
    refetch();
  }

  const counts = {
    total: data?.contacts.length ?? 0,
    leads: data?.contacts.filter((c) => c.status === "lead").length ?? 0,
    customers: data?.contacts.filter((c) => c.status === "customer").length ?? 0,
  };

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Contacts & CRM" subtitle="Every WhatsApp contact in one place" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Contacts", value: counts.total, color: "#00FF87" },
            { label: "Leads", value: counts.leads, color: "#F59E0B" },
            { label: "Customers", value: counts.customers, color: "#00D4FF" },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4">
              <div className="text-2xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-white/50">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
            <Search className="w-4 h-4 text-white/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts…"
              className="bg-transparent text-sm flex-1 outline-none placeholder-white/30" />
          </div>
          <button onClick={() => setAdding(!adding)} className="btn-primary text-sm py-2.5"><Plus className="w-4 h-4" /> Add Contact</button>
        </div>

        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass-card p-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><UserPlus className="w-4 h-4 text-[#00FF87]" /> New contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (intl, digits)" className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email (optional)" className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Tags, comma separated" className="bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00FF87]/40" />
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={add} className="btn-primary text-sm py-2">Save</button>
              <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/60">Cancel</button>
            </div>
          </motion.div>
        )}

        <div className="glass-card overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/8 text-[11px] font-semibold uppercase tracking-wide text-white/40">
            <div className="col-span-4">Contact</div>
            <div className="col-span-3">Tags</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3">Last active</div>
          </div>
          {contacts.map((c) => (
            <div key={c.id} className="grid grid-cols-12 gap-4 px-5 py-3.5 border-b border-white/5 hover:bg-white/3 transition-colors items-center">
              <div className="col-span-4 flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00FF87]/30 to-[#00D4FF]/30 flex items-center justify-center text-xs font-bold flex-shrink-0">{c.name.charAt(0)}</div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-[11px] text-white/40 flex items-center gap-2">
                    <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" /> +{c.phone}</span>
                    {c.email && <span className="flex items-center gap-0.5 truncate"><Mail className="w-2.5 h-2.5" /> {c.email}</span>}
                  </div>
                </div>
              </div>
              <div className="col-span-3 flex flex-wrap gap-1">
                {c.tags.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/55 border border-white/10 flex items-center gap-0.5"><Tag className="w-2.5 h-2.5" />{t}</span>)}
              </div>
              <div className="col-span-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full capitalize" style={{ background: `${statusColor[c.status]}15`, color: statusColor[c.status], border: `1px solid ${statusColor[c.status]}30` }}>{c.status}</span>
              </div>
              <div className="col-span-3 text-xs text-white/40">{timeAgo(c.lastActiveAt)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
