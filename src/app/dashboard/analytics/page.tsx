"use client";

import Header from "@/components/dashboard/Header";
import StatCard from "@/components/ui/StatCard";
import { PhoneCall, Clock, Target, IndianRupee } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { callVolumeWeekly, minutesByLanguage, seedAgents } from "@/lib/data";

const pieColors = ["#8B5CF6", "#22D3EE", "#34D399", "#FBBF24", "#FF9D3C", "#F87171", "#A78BFA"];

const outcomes = [
  { name: "Goal achieved", value: 42 },
  { name: "Follow-up needed", value: 23 },
  { name: "Not interested", value: 18 },
  { name: "No answer / busy", value: 17 },
];

export default function AnalyticsPage() {
  return (
    <>
      <Header title="Analytics" subtitle="Performance across agents, languages and outcomes" />
      <main className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={PhoneCall} label="Total calls (30d)" value="12,486" delta="+24%" deltaUp accent="#A78BFA" />
          <StatCard icon={Clock} label="Avg call duration" value="2m 18s" delta="+11s" deltaUp accent="#22D3EE" />
          <StatCard icon={Target} label="Goal completion" value="42.3%" delta="+3.8%" deltaUp accent="#34D399" />
          <StatCard icon={IndianRupee} label="Cost per outcome" value="₹18.40" delta="-₹2.10" deltaUp accent="#FF9D3C" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-1">Minutes by language</h3>
            <p className="text-xs text-white/40 mb-5">Where your customers actually talk — last 30 days</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={minutesByLanguage} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="language" axisLine={false} tickLine={false} width={70} />
                  <Tooltip
                    contentStyle={{ background: "#10101C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Bar dataKey="minutes" radius={[0, 6, 6, 0]}>
                    {minutesByLanguage.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-semibold mb-1">Call outcomes</h3>
            <p className="text-xs text-white/40 mb-5">Share of all connected calls</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={outcomes} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                    {outcomes.map((_, i) => (
                      <Cell key={i} fill={pieColors[i]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "#10101C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-card p-6">
            <h3 className="font-semibold mb-1">Daily connection funnel</h3>
            <p className="text-xs text-white/40 mb-5">Dialed vs connected, last 7 days</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={callVolumeWeekly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    contentStyle={{ background: "#10101C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Bar dataKey="calls" fill="#8B5CF6" radius={[6, 6, 0, 0]} name="Dialed" />
                  <Bar dataKey="connected" fill="#22D3EE" radius={[6, 6, 0, 0]} name="Connected" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-semibold mb-5">Agent leaderboard</h3>
            <div className="space-y-3">
              {seedAgents.map((a, i) => (
                <div key={a.id} className="flex items-center gap-4 p-3.5 rounded-xl bg-white/3 border border-white/8">
                  <span className="text-lg font-extrabold text-white/20 w-6">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{a.name}</div>
                    <div className="text-xs text-white/40">{a.totalCalls.toLocaleString("en-IN")} calls</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-[#34D399]">{a.successRate}%</div>
                    <div className="text-[10px] text-white/35">success</div>
                  </div>
                  <div className="w-24 h-1.5 rounded-full bg-white/8 overflow-hidden hidden sm:block">
                    <div className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE]" style={{ width: `${a.successRate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
