"use client";

import Header from "@/components/dashboard/Header";
import StatCard from "@/components/ui/StatCard";
import { PhoneCall, Clock, CheckCircle2, Wallet, Bot, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { callVolumeWeekly, seedCalls, seedCampaigns } from "@/lib/data";
import { formatDuration, timeAgo } from "@/lib/utils";

const statusTag: Record<string, string> = {
  completed: "tag-green",
  failed: "tag-red",
  "no-answer": "tag-yellow",
  busy: "tag-yellow",
  "in-progress": "tag-cyan",
};

export default function DashboardOverview() {
  return (
    <>
      <Header title="Overview" subtitle="Namaste, Nikhil! Here's what your agents did today." />
      <main className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={PhoneCall} label="Calls this week" value="3,022" delta="+18.2%" deltaUp accent="#A78BFA" />
          <StatCard icon={Clock} label="Minutes used" value="1,840 / 2,000" delta="+9.4%" deltaUp accent="#22D3EE" />
          <StatCard icon={CheckCircle2} label="Connection rate" value="73.6%" delta="+2.1%" deltaUp accent="#34D399" />
          <StatCard icon={Wallet} label="Wallet balance" value="₹31,299" delta="-₹1,404 today" accent="#FF9D3C" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="glass-card p-6 xl:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold">Call volume</h3>
                <p className="text-xs text-white/40">Dialed vs connected, last 7 days</p>
              </div>
              <span className="tag-violet">This week</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={callVolumeWeekly}>
                  <defs>
                    <linearGradient id="calls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="connected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    contentStyle={{
                      background: "#10101C",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="calls" stroke="#8B5CF6" strokeWidth={2} fill="url(#calls)" name="Dialed" />
                  <Area type="monotone" dataKey="connected" stroke="#22D3EE" strokeWidth={2} fill="url(#connected)" name="Connected" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold">Active campaigns</h3>
              <Link href="/dashboard/campaigns" className="text-xs text-[#A78BFA] hover:underline flex items-center gap-1">
                View all <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-4">
              {seedCampaigns.slice(0, 3).map((c) => {
                const pct = c.totalContacts ? Math.round((c.called / c.totalContacts) * 100) : 0;
                return (
                  <div key={c.id} className="p-3.5 rounded-xl bg-white/3 border border-white/8">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm font-medium truncate">{c.name}</span>
                      <span className={c.status === "running" ? "tag-green" : c.status === "scheduled" ? "tag-yellow" : "tag-violet"}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-xs text-white/40 mb-2 flex items-center gap-1.5">
                      <Bot className="w-3 h-3" /> {c.agentName}
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-white/40 mt-1.5">
                      <span>{c.called.toLocaleString("en-IN")} / {c.totalContacts.toLocaleString("en-IN")} called</span>
                      <span>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold">Recent calls</h3>
              <p className="text-xs text-white/40">Latest conversations across all agents</p>
            </div>
            <Link href="/dashboard/calls" className="text-xs text-[#A78BFA] hover:underline flex items-center gap-1">
              All call logs <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/40 border-b border-white/8">
                  <th className="pb-3 font-medium">Contact</th>
                  <th className="pb-3 font-medium">Agent</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Duration</th>
                  <th className="pb-3 font-medium">Outcome</th>
                  <th className="pb-3 font-medium text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {seedCalls.slice(0, 5).map((call) => (
                  <tr key={call.id} className="border-b border-white/5 last:border-0">
                    <td className="py-3">
                      <div className="font-medium">{call.contactName}</div>
                      <div className="text-xs text-white/35">{call.phone}</div>
                    </td>
                    <td className="py-3 text-white/60">{call.agentName.split(" — ")[0]}</td>
                    <td className="py-3"><span className={statusTag[call.status]}>{call.status}</span></td>
                    <td className="py-3 text-white/60">{call.durationSec ? formatDuration(call.durationSec) : "—"}</td>
                    <td className="py-3 text-white/60 max-w-[220px] truncate">{call.outcome}</td>
                    <td className="py-3 text-white/40 text-right whitespace-nowrap">{timeAgo(call.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
