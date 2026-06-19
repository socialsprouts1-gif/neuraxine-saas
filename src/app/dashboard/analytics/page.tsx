"use client";

import { motion } from "framer-motion";
import {
  PhoneCall,
  TrendingUp,
  Clock,
  DollarSign,
  ArrowUpRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const weeklyData = [
  { day: "Mon", calls: 42, answered: 35, cost: 3.5 },
  { day: "Tue", calls: 58, answered: 49, cost: 4.9 },
  { day: "Wed", calls: 63, answered: 55, cost: 5.5 },
  { day: "Thu", calls: 47, answered: 38, cost: 3.8 },
  { day: "Fri", calls: 71, answered: 62, cost: 6.2 },
  { day: "Sat", calls: 28, answered: 22, cost: 2.2 },
  { day: "Sun", calls: 19, answered: 14, cost: 1.4 },
];

const agentData = [
  { name: "Priya", calls: 266, rate: "83%" },
  { name: "Arjun", calls: 62, rate: "100%" },
];

const pieData = [
  { name: "Interested", value: 34, color: "#00FF87" },
  { name: "Completed", value: 28, color: "#00D4FF" },
  { name: "Callback", value: 18, color: "#7B2FFF" },
  { name: "No Answer", value: 12, color: "#FF6B35" },
  { name: "Not Interested", value: 8, color: "#FF3366" },
];

const kpis = [
  { label: "Total Calls", value: "328", change: "+12.4%", icon: PhoneCall, color: "text-[#00FF87]" },
  { label: "Connect Rate", value: "82.6%", change: "+3.1%", icon: TrendingUp, color: "text-[#00D4FF]" },
  { label: "Avg Duration", value: "3m 14s", change: "+22s", icon: Clock, color: "text-[#7B2FFF]" },
  { label: "Total Cost", value: "₹274.30", change: "+8.2%", icon: DollarSign, color: "text-[#FF6B35]" },
];

export default function AnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-white/50 text-sm mt-0.5">Performance insights across all calls, agents, and campaigns.</p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {["Today", "7 Days", "30 Days", "3 Months"].map((p, i) => (
          <button
            key={p}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              i === 1 ? "bg-[#00FF87]/15 text-[#00FF87] border border-[#00FF87]/20" : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass-card p-5"
          >
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              <span className="text-xs text-white/40">{kpi.label}</span>
            </div>
            <div className="text-2xl font-bold">{kpi.value}</div>
            <div className="flex items-center gap-1 mt-1 text-[#00FF87] text-xs">
              <ArrowUpRight className="w-3 h-3" /> {kpi.change} vs last week
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-card p-5 xl:col-span-2">
          <div className="mb-4">
            <h2 className="font-semibold">Daily Call Volume</h2>
            <p className="text-white/40 text-xs">Total vs answered, this week</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00FF87" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00FF87" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#141420", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }} />
              <Area type="monotone" dataKey="calls" stroke="#00FF87" strokeWidth={2} fill="url(#g1)" name="Total" />
              <Area type="monotone" dataKey="answered" stroke="#00D4FF" strokeWidth={2} fill="url(#g2)" name="Answered" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <div className="mb-4">
            <h2 className="font-semibold">Dispositions</h2>
            <p className="text-white/40 text-xs">This week</p>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#141420", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span className="text-white/60">{d.name}</span>
                </div>
                <span className="font-medium">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cost chart */}
      <div className="glass-card p-5">
        <div className="mb-4">
          <h2 className="font-semibold">Daily Cost (₹)</h2>
          <p className="text-white/40 text-xs">Call costs this week</p>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#141420", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }} />
            <Bar dataKey="cost" fill="#7B2FFF" radius={[4, 4, 0, 0]} name="Cost (₹)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Agent performance */}
      <div className="glass-card p-5">
        <h2 className="font-semibold mb-4">Agent Performance</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {agentData.map((a) => (
            <div key={a.name} className="p-4 rounded-xl bg-white/4 border border-white/8 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00FF87]/20 to-[#00D4FF]/20 flex items-center justify-center font-bold text-sm">
                  {a.name[0]}
                </div>
                <div>
                  <div className="font-semibold text-sm">{a.name}</div>
                  <div className="text-white/40 text-xs">{a.calls} calls this week</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[#00FF87] font-bold">{a.rate}</div>
                <div className="text-white/30 text-xs">connect rate</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
