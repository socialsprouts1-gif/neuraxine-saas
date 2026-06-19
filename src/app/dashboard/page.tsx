"use client";

import { motion } from "framer-motion";
import {
  PhoneCall,
  TrendingUp,
  Clock,
  Mic,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";

const callsData = [
  { day: "Mon", calls: 42, answered: 35 },
  { day: "Tue", calls: 58, answered: 49 },
  { day: "Wed", calls: 63, answered: 55 },
  { day: "Thu", calls: 47, answered: 38 },
  { day: "Fri", calls: 71, answered: 62 },
  { day: "Sat", calls: 28, answered: 22 },
  { day: "Sun", calls: 19, answered: 14 },
];

const dispositionData = [
  { name: "Interested", value: 34, color: "#00FF87" },
  { name: "Completed", value: 28, color: "#00D4FF" },
  { name: "Callback", value: 18, color: "#7B2FFF" },
  { name: "No Answer", value: 12, color: "#FF6B35" },
  { name: "Not Interested", value: 8, color: "#FF3366" },
];

const recentCalls = [
  { name: "Rajesh Kumar", number: "+91 98765 43001", agent: "Priya", duration: "2:55", status: "interested", time: "10 min ago" },
  { name: "Sunita Sharma", number: "+91 98765 43002", agent: "Priya", duration: "2:20", status: "callback", time: "32 min ago" },
  { name: "Amit Singh", number: "+91 98765 43003", agent: "Priya", duration: "4:05", status: "completed", time: "1h ago" },
  { name: "Inbound Caller", number: "+91 98765 43005", agent: "Arjun", duration: "4:58", status: "completed", time: "6h ago" },
  { name: "Deepa Nair", number: "+91 98765 43004", agent: "Priya", duration: "—", status: "no_answer", time: "Yesterday" },
];

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  interested: { icon: TrendingUp, color: "text-[#00FF87]", label: "Interested" },
  completed: { icon: CheckCircle2, color: "text-[#00D4FF]", label: "Completed" },
  callback: { icon: Clock, color: "text-[#7B2FFF]", label: "Callback" },
  no_answer: { icon: XCircle, color: "text-white/40", label: "No Answer" },
  failed: { icon: AlertCircle, color: "text-[#FF3366]", label: "Failed" },
};

const stats = [
  { label: "Total Calls", value: "328", change: "+12.4%", up: true, icon: PhoneCall, color: "from-[#00FF87]/20 to-[#00FF87]/5", iconColor: "text-[#00FF87]" },
  { label: "Connect Rate", value: "82.6%", change: "+3.1%", up: true, icon: TrendingUp, color: "from-[#00D4FF]/20 to-[#00D4FF]/5", iconColor: "text-[#00D4FF]" },
  { label: "Avg Duration", value: "3m 14s", change: "+0:22", up: true, icon: Clock, color: "from-[#7B2FFF]/20 to-[#7B2FFF]/5", iconColor: "text-[#7B2FFF]" },
  { label: "Active Agents", value: "2", change: "Live now", up: true, icon: Mic, color: "from-[#FF6B35]/20 to-[#FF6B35]/5", iconColor: "text-[#FF6B35]" },
];

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-white/50 text-sm mt-0.5">Welcome back — here&apos;s what&apos;s happening today.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00FF87]/10 border border-[#00FF87]/20 text-[#00FF87] text-xs font-medium">
          <Activity className="w-3 h-3 animate-pulse" />
          2 calls in progress
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium ${stat.up ? "text-[#00FF87]" : "text-[#FF3366]"}`}>
                {stat.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {stat.change}
              </div>
            </div>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-white/50 text-xs mt-1">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-card p-5 xl:col-span-2">
          <div className="mb-4">
            <h2 className="font-semibold">Call Volume</h2>
            <p className="text-white/40 text-xs">This week</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={callsData}>
              <defs>
                <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00FF87" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00FF87" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="answeredGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#141420", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: 12 }} labelStyle={{ color: "rgba(255,255,255,0.7)" }} />
              <Area type="monotone" dataKey="calls" stroke="#00FF87" strokeWidth={2} fill="url(#callsGrad)" name="Total Calls" />
              <Area type="monotone" dataKey="answered" stroke="#00D4FF" strokeWidth={2} fill="url(#answeredGrad)" name="Answered" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <div className="mb-4">
            <h2 className="font-semibold">Dispositions</h2>
            <p className="text-white/40 text-xs">This week</p>
          </div>
          <div className="space-y-3">
            {dispositionData.map((d) => (
              <div key={d.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/70">{d.name}</span>
                  <span className="font-medium">{d.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/8">
                  <div className="h-full rounded-full" style={{ width: `${d.value}%`, background: d.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h2 className="font-semibold">Recent Calls</h2>
          <Link href="/dashboard/calls" className="text-xs text-[#00FF87] hover:underline flex items-center gap-1">
            View all <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-white/5">
          {recentCalls.map((call) => {
            const s = statusConfig[call.status] ?? statusConfig.failed;
            return (
              <div key={call.number + call.time} className="flex items-center gap-4 px-5 py-3 hover:bg-white/3 transition-colors">
                <div className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                  {call.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{call.name}</div>
                  <div className="text-white/40 text-xs">{call.number}</div>
                </div>
                <div className="hidden sm:block text-xs text-white/50 text-right">
                  <div>Agent: {call.agent}</div>
                  <div>{call.duration}</div>
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${s.color} min-w-[90px] justify-end`}>
                  <s.icon className="w-3.5 h-3.5" />
                  {s.label}
                </div>
                <div className="text-white/30 text-xs hidden md:block min-w-[70px] text-right">{call.time}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
