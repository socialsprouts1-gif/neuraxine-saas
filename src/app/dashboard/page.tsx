"use client";

import { motion } from "framer-motion";
import {
  Target, DollarSign, TrendingUp, Users, ArrowUpRight,
  Zap, Eye, MousePointer, BarChart3, Play, PauseCircle,
  Wand2, Sparkles,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";
import Header from "@/components/dashboard/Header";
import Link from "next/link";

const spendData = [
  { day: "Mon", spend: 3200, leads: 12 },
  { day: "Tue", spend: 4100, leads: 18 },
  { day: "Wed", spend: 3800, leads: 15 },
  { day: "Thu", spend: 5200, leads: 24 },
  { day: "Fri", spend: 4700, leads: 21 },
  { day: "Sat", spend: 6100, leads: 32 },
  { day: "Sun", spend: 5800, leads: 28 },
];

const campaignData = [
  { name: "Gym Lead Gen", roas: 4.2 },
  { name: "Summer Sale", roas: 5.8 },
  { name: "Dental Clinic", roas: 2.1 },
  { name: "Restaurant", roas: 0 },
  { name: "Retargeting", roas: 6.4 },
];

const activeCampaigns = [
  { name: "Gym Lead Gen — Pune", status: "active", spend: "₹12,400", leads: 47, roas: "4.2x", ctr: "3.8%" },
  { name: "Summer Sale — Clothing", status: "active", spend: "₹28,600", leads: 112, roas: "5.8x", ctr: "5.1%" },
  { name: "Retargeting — Website Visitors", status: "active", spend: "₹9,200", leads: 38, roas: "6.4x", ctr: "6.2%" },
  { name: "Dental Clinic — Mumbai", status: "paused", spend: "₹4,200", leads: 12, roas: "2.1x", ctr: "1.9%" },
];

const stats = [
  { label: "Total Spend", value: "₹61,200", change: "+18%", icon: DollarSign, color: "#C6FF00" },
  { label: "Total Leads", value: "209", change: "+34%", icon: Target, color: "#00D4FF" },
  { label: "Avg ROAS", value: "4.6x", change: "+0.8x", icon: TrendingUp, color: "#A855F7" },
  { label: "Avg CPL", value: "₹293", change: "-₹42", icon: Users, color: "#F59E0B" },
];

const tooltipStyle = {
  background: "rgba(14,14,28,0.95)",
  border: "1px solid rgba(198,255,0,0.2)",
  borderRadius: "12px",
  fontSize: "12px",
};

export default function DashboardPage() {
  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Dashboard" subtitle="Friday, 13 Jun 2026 · Live" />

      <div className="p-6 space-y-6">
        {/* Quick actions */}
        <div className="flex gap-3 flex-wrap">
          <Link href="/dashboard/ad-builder" className="btn-primary text-sm py-2 px-4">
            <Wand2 className="w-4 h-4" /> New Campaign
          </Link>
          <Link href="/dashboard/meta-connect" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all">
            <Zap className="w-4 h-4 text-[#C6FF00]" /> Meta Connected
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className="glass-card p-5 hover:border-white/20 transition-all hover:-translate-y-0.5">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }}>
                  <s.icon className="w-5 h-5" style={{ color: s.color }} />
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold text-[#C6FF00]">
                  <ArrowUpRight className="w-3 h-3" />{s.change}
                </span>
              </div>
              <div className="text-2xl font-black mb-0.5">{s.value}</div>
              <div className="text-xs text-white/50">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold">Ad Spend & Leads</h3>
                <p className="text-xs text-white/50 mt-0.5">Last 7 days</p>
              </div>
              <div className="flex gap-3 text-xs text-white/50">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#C6FF00]" />Spend</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#00D4FF]" />Leads</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={spendData}>
                <defs>
                  <linearGradient id="gSpend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C6FF00" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#C6FF00" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="spend" stroke="#C6FF00" strokeWidth={2} fill="url(#gSpend)" />
                <Area type="monotone" dataKey="leads" stroke="#00D4FF" strokeWidth={2} fill="url(#gLeads)" />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-5">
            <div className="mb-5">
              <h3 className="font-semibold">ROAS by Campaign</h3>
              <p className="text-xs text-white/50 mt-0.5">Return on ad spend</p>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={campaignData} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="roas" fill="#C6FF00" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Active campaigns */}
        <div className="grid lg:grid-cols-2 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold">Active Campaigns</h3>
                <p className="text-xs text-white/50">{activeCampaigns.filter((c) => c.status === "active").length} running</p>
              </div>
              <Link href="/dashboard/campaigns" className="text-xs text-[#C6FF00] hover:underline">View All</Link>
            </div>
            <div className="space-y-3">
              {activeCampaigns.map((c) => (
                <div key={c.name} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === "active" ? "bg-[#C6FF00] animate-pulse" : "bg-white/20"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-white/40">{c.spend} spent · {c.leads} leads</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-[#C6FF00]">{c.roas}</div>
                    <div className="text-[10px] text-white/40">ROAS</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Metrics */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="glass-card p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold">Key Metrics</h3>
                <p className="text-xs text-white/50">This week</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Impressions", value: "2.08M", icon: Eye, color: "#C6FF00" },
                { label: "Clicks", value: "81,200", icon: MousePointer, color: "#00D4FF" },
                { label: "Avg CTR", value: "3.9%", icon: BarChart3, color: "#A855F7" },
                { label: "Avg CPC", value: "₹214", icon: Target, color: "#F59E0B" },
              ].map((m) => (
                <div key={m.label} className="p-3 rounded-xl bg-white/3 border border-white/8">
                  <m.icon className="w-4 h-4 mb-2" style={{ color: m.color }} />
                  <div className="text-lg font-bold">{m.value}</div>
                  <div className="text-[10px] text-white/40">{m.label}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* AI insight */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="glass-card p-4 border-[#C6FF00]/15 bg-[#C6FF00]/3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#C6FF00]/20 border border-[#C6FF00]/30 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-[#C6FF00]" />
            </div>
            <div className="flex-1">
              <span className="text-xs font-semibold text-[#C6FF00] mr-2">AI Insight:</span>
              <span className="text-sm text-white/70">
                Your <strong className="text-white">Retargeting</strong> campaign has 6.4x ROAS — the best performer. Consider doubling its budget.
                The <strong className="text-white">Dental Clinic</strong> campaign is underperforming — try a new creative or WhatsApp CTA.
              </span>
            </div>
            <Link href="/dashboard/ai-suggestions" className="text-xs text-[#C6FF00] whitespace-nowrap hover:underline">
              View All Tips
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
