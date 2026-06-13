"use client";

import { motion } from "framer-motion";
import {
  Play, PauseCircle, BarChart3, Target, DollarSign,
  TrendingUp, MoreHorizontal, Filter, Search, Wand2,
  ArrowUpRight, Zap, Users, Clock,
} from "lucide-react";
import Header from "@/components/dashboard/Header";
import Link from "next/link";

const campaigns = [
  {
    id: 1, name: "Gym Lead Gen — Pune", objective: "Lead Generation", status: "active",
    budget: "₹500/day", spent: "₹12,400", leads: 47, ctr: "3.8%", cpc: "₹264", roas: "4.2x",
    reach: "18,400", startDate: "Jun 1", aiScore: 87,
    placements: ["Facebook Feed", "Instagram Feed"],
  },
  {
    id: 2, name: "Summer Sale — Clothing", objective: "Conversions", status: "active",
    budget: "₹1,500/day", spent: "₹28,600", leads: 112, ctr: "5.1%", cpc: "₹255", roas: "5.8x",
    reach: "42,100", startDate: "May 25", aiScore: 93,
    placements: ["Instagram Feed", "Reels"],
  },
  {
    id: 3, name: "Dental Clinic — Mumbai", objective: "Lead Generation", status: "paused",
    budget: "₹800/day", spent: "₹4,200", leads: 12, ctr: "1.9%", cpc: "₹350", roas: "2.1x",
    reach: "8,900", startDate: "Jun 5", aiScore: 54,
    placements: ["Facebook Feed"],
  },
  {
    id: 4, name: "Restaurant Brand Awareness", objective: "Brand Awareness", status: "active",
    budget: "₹300/day", spent: "₹6,800", leads: 0, ctr: "2.4%", cpc: "₹85", roas: "—",
    reach: "52,000", startDate: "May 30", aiScore: 78,
    placements: ["Facebook Feed", "Instagram Stories"],
  },
  {
    id: 5, name: "Retargeting — Website Visitors", objective: "Conversions", status: "active",
    budget: "₹600/day", spent: "₹9,200", leads: 38, ctr: "6.2%", cpc: "₹242", roas: "6.4x",
    reach: "5,800", startDate: "Jun 3", aiScore: 96,
    placements: ["Facebook Feed", "Instagram Feed", "Reels"],
  },
];

const summaryStats = [
  { label: "Total Spend", value: "₹61,200", change: "+18%", icon: DollarSign, color: "#C6FF00" },
  { label: "Total Leads", value: "209", change: "+34%", icon: Target, color: "#00D4FF" },
  { label: "Avg ROAS", value: "4.6x", change: "+0.8x", icon: TrendingUp, color: "#A855F7" },
  { label: "Avg CPL", value: "₹293", change: "-₹42", icon: Users, color: "#F59E0B" },
];

export default function CampaignsPage() {
  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Meta Campaigns" subtitle="Manage and monitor your Meta ad campaigns" />
      <div className="p-6 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryStats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }}>
                  <s.icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <span className="flex items-center gap-0.5 text-xs font-semibold text-[#C6FF00]">
                  <ArrowUpRight className="w-3 h-3" />{s.change}
                </span>
              </div>
              <div className="text-2xl font-black mb-0.5">{s.value}</div>
              <div className="text-xs text-white/40">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input type="text" placeholder="Search campaigns..." className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#C6FF00]/30 w-56" />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm text-white/60 hover:text-white transition-all">
              <Filter className="w-4 h-4" /> Filter
            </button>
          </div>
          <Link href="/dashboard/ad-builder" className="btn-primary text-sm py-2 px-4">
            <Wand2 className="w-4 h-4" /> New Campaign
          </Link>
        </div>

        {/* Campaign list */}
        <div className="space-y-3">
          {campaigns.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }} className="glass-card p-5 hover:border-white/20 transition-all">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-48">
                  <div className="flex items-center gap-2.5 mb-1">
                    <h3 className="font-semibold">{c.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.status === "active" ? "bg-[#C6FF00]/15 text-[#C6FF00] border border-[#C6FF00]/20" : "bg-white/10 text-white/50 border border-white/15"}`}>
                      {c.status === "active" ? "● Active" : "⏸ Paused"}
                    </span>
                  </div>
                  <div className="text-xs text-white/40 flex items-center gap-3">
                    <span>{c.objective}</span><span>·</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Since {c.startDate}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {c.placements.map((p) => (
                      <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{p}</span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-6 text-center">
                  {[["Spend", c.spent], ["Leads", c.leads || "—"], ["CTR", c.ctr], ["ROAS", c.roas]].map(([label, val]) => (
                    <div key={label as string}>
                      <div className="text-lg font-bold">{val}</div>
                      <div className="text-[10px] text-white/40">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col items-center gap-1">
                  <div className="relative w-12 h-12">
                    <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="14" fill="none" stroke={c.aiScore >= 80 ? "#C6FF00" : c.aiScore >= 60 ? "#F59E0B" : "#EF4444"} strokeWidth="3" strokeDasharray={`${(c.aiScore / 100) * 88} 88`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{c.aiScore}</div>
                  </div>
                  <div className="text-[10px] text-white/40">AI Score</div>
                </div>

                <div className="flex items-center gap-2">
                  <button className={`p-2 rounded-xl border transition-colors ${c.status === "active" ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10" : "border-[#C6FF00]/30 text-[#C6FF00] hover:bg-[#C6FF00]/10"}`}>
                    {c.status === "active" ? <PauseCircle className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button className="p-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-colors">
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  <button className="p-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 transition-colors">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {c.aiScore < 70 && (
                <div className="mt-4 flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <Zap className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                  <span className="text-xs text-amber-300/80">AI suggests: Broaden audience targeting and increase budget to improve performance.</span>
                  <button className="ml-auto text-xs text-amber-400 hover:underline whitespace-nowrap">Apply Fix</button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
