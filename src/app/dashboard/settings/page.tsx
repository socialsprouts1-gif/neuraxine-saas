"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Users,
  Phone,
  Key,
  CreditCard,
  Shield,
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const TABS = [
  { id: "org", label: "Organization", icon: Building2 },
  { id: "team", label: "Team", icon: Users },
  { id: "numbers", label: "Phone Numbers", icon: Phone },
  { id: "api", label: "API Keys", icon: Key },
  { id: "billing", label: "Usage & Billing", icon: CreditCard },
  { id: "compliance", label: "Compliance", icon: Shield },
];

const phoneNumbers = [
  { id: "1", e164: "+91 14000 00001", series: "140", dltStatus: "approved", status: "active", inboundAgent: null },
  { id: "2", e164: "+91 16000 00001", series: "1600", dltStatus: "approved", status: "active", inboundAgent: "Arjun - Support Agent" },
];

const teamMembers = [
  { name: "Alex Johnson", email: "alex@acme.com", role: "owner", joined: "Jan 2026" },
  { name: "Priti Mehta", email: "priti@acme.com", role: "admin", joined: "Feb 2026" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState("org");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-white/50 text-sm mt-0.5">Manage your organization, numbers, team, and billing.</p>
      </div>

      <div className="flex gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.id ? "bg-[#00FF87]/15 text-[#00FF87] border border-[#00FF87]/20" : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {tab === "org" && (
          <div className="glass-card p-6 space-y-5 max-w-xl">
            <h2 className="font-semibold">Organization Details</h2>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Organization Name</label>
              <input defaultValue="Acme Corp" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-[#00FF87]/40 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">DLT Entity ID</label>
              <input placeholder="Your TRAI DLT Entity ID" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-[#00FF87]/40 focus:outline-none" />
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/4 border border-white/8">
              <div>
                <div className="text-sm font-medium">BFSI / Regulated Entity</div>
                <div className="text-xs text-white/40">Enables 1600-series number provisioning</div>
              </div>
              <button className="w-10 h-5 rounded-full bg-white/15">
                <div className="w-4 h-4 rounded-full bg-white shadow translate-x-0.5" />
              </button>
            </div>
            <button className="px-5 py-2.5 rounded-xl bg-[#00FF87] text-[#050508] text-sm font-semibold hover:bg-[#00FF87]/90 transition-colors">
              Save Changes
            </button>
          </div>
        )}

        {tab === "team" && (
          <div className="space-y-4 max-w-2xl">
            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <h2 className="font-semibold">Team Members</h2>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00FF87]/10 text-[#00FF87] text-xs font-medium hover:bg-[#00FF87]/20 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Invite Member
                </button>
              </div>
              <div className="divide-y divide-white/5">
                {teamMembers.map((m) => (
                  <div key={m.email} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00FF87]/20 to-[#00D4FF]/20 flex items-center justify-center text-sm font-bold">
                      {m.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-white/40 text-xs">{m.email}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.role === "owner" ? "bg-[#00FF87]/10 text-[#00FF87]" : "bg-white/8 text-white/50"}`}>
                      {m.role}
                    </span>
                    <div className="text-white/30 text-xs">{m.joined}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "numbers" && (
          <div className="space-y-4">
            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <h2 className="font-semibold">Phone Numbers</h2>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00FF87]/10 text-[#00FF87] text-xs font-medium hover:bg-[#00FF87]/20 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Provision Number
                </button>
              </div>
              <div className="divide-y divide-white/5">
                {phoneNumbers.map((n) => (
                  <div key={n.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="w-9 h-9 rounded-full bg-[#00D4FF]/10 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-4 h-4 text-[#00D4FF]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono font-semibold text-sm">{n.e164}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-white/40">{n.series}-series</span>
                        {n.inboundAgent && (
                          <span className="text-[10px] text-[#00FF87]">→ {n.inboundAgent}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {n.dltStatus === "approved" ? (
                        <CheckCircle2 className="w-4 h-4 text-[#00FF87]" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-[#FF6B35]" />
                      )}
                      <span className={`text-xs font-medium ${n.dltStatus === "approved" ? "text-[#00FF87]" : "text-[#FF6B35]"}`}>
                        DLT {n.dltStatus}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${n.status === "active" ? "bg-[#00FF87]/10 text-[#00FF87]" : "bg-white/8 text-white/40"}`}>
                      {n.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "api" && (
          <div className="space-y-4 max-w-2xl">
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">API Keys</h2>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00FF87]/10 text-[#00FF87] text-xs font-medium hover:bg-[#00FF87]/20 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Create Key
                </button>
              </div>
              <div className="p-4 rounded-xl bg-white/4 border border-white/8 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-sm">Production Key</div>
                  <code className="text-xs text-white/40 font-mono">nrx_live_••••••••••••••••••••••••</code>
                </div>
                <div className="flex gap-2">
                  <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/8 text-white/50 transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded-lg bg-white/5 hover:bg-[#FF3366]/10 text-white/30 hover:text-[#FF3366] transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "billing" && (
          <div className="space-y-4 max-w-2xl">
            <div className="glass-card p-5">
              <h2 className="font-semibold mb-4">Current Plan</h2>
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#00FF87]/10 to-[#00D4FF]/10 border border-[#00FF87]/20 flex items-center justify-between">
                <div>
                  <div className="font-bold text-lg text-[#00FF87]">Growth Plan</div>
                  <div className="text-white/50 text-sm">500 minutes/month · ₹2/min overage</div>
                </div>
                <button className="px-4 py-2 rounded-xl bg-[#00FF87] text-[#050508] text-sm font-semibold">Upgrade</button>
              </div>
            </div>
            <div className="glass-card p-5">
              <h2 className="font-semibold mb-4">Usage This Month (June 2026)</h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: "Minutes Used", value: "47.5 / 500" },
                  { label: "Calls Made", value: "5" },
                  { label: "Est. Cost", value: "₹4.75" },
                ].map((u) => (
                  <div key={u.label} className="p-3 rounded-xl bg-white/4 text-center">
                    <div className="font-semibold">{u.value}</div>
                    <div className="text-white/40 text-xs mt-0.5">{u.label}</div>
                  </div>
                ))}
              </div>
              <div className="h-2 rounded-full bg-white/8">
                <div className="h-full w-[9.5%] rounded-full bg-gradient-to-r from-[#00FF87] to-[#00D4FF]" />
              </div>
              <div className="text-xs text-white/30 mt-1 text-right">47.5 / 500 minutes</div>
            </div>
          </div>
        )}

        {tab === "compliance" && (
          <div className="space-y-4 max-w-2xl">
            <div className="glass-card p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#00FF87]" /> India Regulatory Checklist
              </h2>
              {[
                { label: "DLT Entity Registration", status: "done", desc: "Entity registered on the TRAI DLT platform" },
                { label: "140-series Number (Promotional)", status: "done", desc: "+911400000001 approved for promotional calls" },
                { label: "AI Disclosure Enabled", status: "done", desc: "All agents disclose AI nature at call start" },
                { label: "DND Scrubbing", status: "warning", desc: "Configure automated DND list scrubbing before running promotional campaigns" },
                { label: "Calling Hours Enforced", status: "done", desc: "9 AM – 9 PM IST, Mon–Sat" },
                { label: "DPDP Consent Records", status: "done", desc: "Consent source and timestamp stored per contact" },
                { label: "Data Retention Policy", status: "warning", desc: "Set recording and transcript retention period in compliance settings" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  {item.status === "done" ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00FF87] flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-[#FF6B35] flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-white/40">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
