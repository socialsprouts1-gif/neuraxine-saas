"use client";

import { motion } from "framer-motion";
import {
  TrendingUp, DollarSign, Target, Users, Eye, MousePointer,
  ArrowUpRight, ArrowDownRight, Zap, BarChart3, Filter,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
} from "recharts";
import Header from "@/components/dashboard/Header";

const spendData = [
  { date: "Jun 1", spend: 3200, leads: 12, roas: 3.8 },
  { date: "Jun 2", spend: 4100, leads: 18, roas: 4.2 },
  { date: "Jun 3", spend: 3800, leads: 15, roas: 4.0 },
  { date: "Jun 4", spend: 5200, leads: 24, roas: 4.8 },
  { date: "Jun 5", spend: 4700, leads: 21, roas: 4.5 },
  { date: "Jun 6", spend: 6100, leads: 32, roas: 5.2 },
  { date: "Jun 7", spend: 5800, leads: 28, roas: 5.0 },
  { date: "Jun 8", spend: 7200, leads: 38, roas: 5.6 },
  { date: "Jun 9", spend: 6900, leads: 35, roas: 5.4 },
  { date: "Jun 10", spend: 8400, leads: 47, roas: 6.1 },
  { date: "Jun 11", spend: 7800, leads: 42, roas: 5.8 },
  { date: "Jun 12", spend: 9200, leads: 52, roas: 6.4 },
];

const campaignBreakdown = [
  { name: "Gym Lead Gen", spend: 12400, leads: 47, roas: 4.2 },
  { name: "Summer Sale", spend: 28600, leads: 112, roas: 5.8 },
  { name: "Dental Clinic", spend: 4200, leads: 12, roas: 2.1 },
  { name: "Restaurant", spend: 6800, leads: 0, roas: 0 },
  { name: "Retargeting", spend: 9200, leads: 38, roas: 6.4 },
];

const stats = [
  { label: "Total Spend", value: "₹61,200", change: "+18%", up: true, icon: DollarSign, color: "#C6FF00" },
  { label: "Total Leads", value: "209", change: "+34%", up: true, icon: Target, color: "#00D4FF" },
  { label: "Avg ROAS", value: "4.6x", change: "+0.8x", up: true, icon: TrendingUp, color: "#A855F7" },
  { label: "Avg CTR", value: "3.9%", change: "+0.4%", up: true, icon: MousePointer, color: "#F59E0B" },
  { label: "Impressions", value: "2.08M", change: "+22%", up: true, icon: Eye, color: "#00FF87" },
  { label: "Avg CPL", value: "₹293", change: "-₹42", up: true, icon: Users, color: "#C6FF00" },
  { label: "Avg CPC", value: "₹214", change: "-₹18", up: true, icon: MousePointer, color: "#00D4FF" },
  { label: "Avg CPM", value: "₹148", change: "-₹12", up: true, icon: BarChart3, color: "#A855F7" },
];

const tooltipStyle = {
  background: "rgba(14,14,28,0.95)",
  border: "1px solid rgba(198,255,0,0.2)",
  borderRadius: "12px",
  fontSize: "12px",
};

export default function AnalyticsPage() {
  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Ad Analytics" subtitle="Performance overview across all Meta campaigns" />

      <div className="p-6 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.slice(0, 4).map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }}>
                  <s.icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <span className={`flex items-center gap-0.5 text-xs font-semibold ${s.up ? "text-[#C6FF00]" : "text-red-400"}`}>
                  {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{s.change}
                </span>
              </div>
              <div className="text-2xl font-black mb-0.5">{s.value}</div>
              <div className="text-xs text-white/40">{s.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.slice(4).map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.07 }} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${s.color}15`, border: `1px solid ${s.color}25` }}>
                  <s.icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <span className={`flex items-center gap-0.5 text-xs font-semibold ${s.up ? "text-[#C6FF00]" : "text-red-400"}`}>
                  {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{s.change}
                </span>
              </div>
              <div className="text-2xl font-black mb-0.5">{s.value}</div>
              <div className="text-xs text-white/40">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Spend & leads chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold">Spend & Leads Over Time</h3>
              <p className="text-xs text-white/40 mt-0.5">Last 12 days</p>
            </div>
            <div className="flex gap-4 text-xs text-white/50">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#C6FF00]" />Spend (₹)</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#00D4FF]" />Leads</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
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
              <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="spend" stroke="#C6FF00" strokeWidth={2} fill="url(#gSpend)" />
              <Area type="monotone" dataKey="leads" stroke="#00D4FF" strokeWidth={2} fill="url(#gLeads)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-5">
          {/* ROAS chart */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-5">
            <div className="mb-4">
              <h3 className="font-semibold">ROAS Trend</h3>
              <p className="text-xs text-white/40">Return on ad spend over time</p>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={spendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="roas" stroke="#A855F7" strokeWidth={2.5} dot={{ fill: "#A855F7", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Campaign breakdown */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="glass-card p-5">
            <div className="mb-4">
              <h3 className="font-semibold">Campaign Breakdown</h3>
              <p className="text-xs text-white/40">Spend by campaign</p>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={campaignBreakdown} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="spend" fill="#C6FF00" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* AI insight */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="glass-card p-4 border-[#C6FF00]/15 bg-[#C6FF00]/3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#C6FF00]/20 border border-[#C6FF00]/30 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-[#C6FF00]" />
            </div>
            <div className="flex-1">
              <span className="text-xs font-semibold text-[#C6FF00] mr-2">AI Insight:</span>
              <span className="text-sm text-white/70">
                Your <strong className="text-white">Retargeting</strong> campaign has the highest ROAS (6.4x). Consider increasing its budget by 50% to maximize returns. The <strong className="text-white">Dental Clinic</strong> campaign needs creative refresh — CTR is below benchmark.
              </span>
            </div>
            <button className="text-xs text-[#C6FF00] whitespace-nowrap hover:underline">Apply</button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
