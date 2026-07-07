"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import StatCard from "@/components/ui/StatCard";
import { Building2, IndianRupee, PhoneCall, Activity, ArrowUpRight, AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { adminRevenueMonthly, adminSignupsWeekly, seedClients, seedTickets, seedProviders } from "@/lib/data";
import { formatINR } from "@/lib/utils";

export default function AdminOverview() {
  const degraded = seedProviders.filter((p) => p.status !== "connected");

  return (
    <>
      <AdminHeader title="Platform Overview" subtitle="Neuraxine Voice — business & infrastructure health" />
      <main className="flex-1 p-6 space-y-6">
        {degraded.length > 0 && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-[#FBBF24]/8 border border-[#FBBF24]/25 text-sm">
            <AlertTriangle className="w-4 h-4 text-[#FBBF24] shrink-0" />
            <span className="text-white/70">
              {degraded.map((d) => d.name).join(", ")} reporting degraded performance —{" "}
              <Link href="/admin/providers" className="text-[#FBBF24] hover:underline">check providers →</Link>
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={IndianRupee} label="MRR" value="₹10.24 L" delta="+8.8%" deltaUp accent="#FF9D3C" />
          <StatCard icon={Building2} label="Active clients" value="168" delta="+31 this month" deltaUp accent="#A78BFA" />
          <StatCard icon={PhoneCall} label="Platform minutes (Jul)" value="2.36 L" delta="+10.3%" deltaUp accent="#22D3EE" />
          <StatCard icon={Activity} label="Uptime (30d)" value="99.96%" delta="SLA met" deltaUp accent="#34D399" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="glass-card p-6 xl:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold">Revenue & usage growth</h3>
                <p className="text-xs text-white/40">Monthly recurring revenue vs platform minutes</p>
              </div>
              <span className="tag-saffron">Last 6 months</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={adminRevenueMonthly}>
                  <defs>
                    <linearGradient id="mrr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF9D3C" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#FF9D3C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => `₹${(v / 100000).toFixed(1)}L`} />
                  <Tooltip
                    formatter={(value) => formatINR(Number(value), { compact: true })}
                    contentStyle={{ background: "#10101C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="mrr" stroke="#FF9D3C" strokeWidth={2} fill="url(#mrr)" name="MRR" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-semibold mb-1">Signups vs churn</h3>
            <p className="text-xs text-white/40 mb-5">Weekly, this month</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={adminSignupsWeekly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ background: "#10101C", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Bar dataKey="signups" fill="#34D399" radius={[6, 6, 0, 0]} name="Signups" />
                  <Bar dataKey="churned" fill="#F87171" radius={[6, 6, 0, 0]} name="Churned" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold">Top clients by usage</h3>
              <Link href="/admin/clients" className="text-xs text-[#FF9D3C] hover:underline flex items-center gap-1">
                All clients <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {[...seedClients]
                .sort((a, b) => b.minutesThisMonth - a.minutesThisMonth)
                .slice(0, 5)
                .map((c) => (
                  <div key={c.id} className="flex items-center gap-4 p-3.5 rounded-xl bg-white/3 border border-white/8">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF9D3C]/30 to-[#FBBF24]/20 flex items-center justify-center text-xs font-bold shrink-0">
                      {c.company.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.company}</div>
                      <div className="text-xs text-white/40">{c.plan} · {c.city}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{c.minutesThisMonth.toLocaleString("en-IN")} min</div>
                      <div className="text-[10px] text-white/35">{formatINR(c.mrrInr)}/mo</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold">Open support tickets</h3>
              <Link href="/admin/support" className="text-xs text-[#FF9D3C] hover:underline flex items-center gap-1">
                Support desk <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {seedTickets
                .filter((t) => t.status !== "resolved")
                .map((t) => (
                  <div key={t.id} className="p-3.5 rounded-xl bg-white/3 border border-white/8">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-sm font-medium truncate">{t.subject}</span>
                      <span
                        className={
                          t.priority === "urgent" ? "tag-red" : t.priority === "high" ? "tag-saffron" : "tag-yellow"
                        }
                      >
                        {t.priority}
                      </span>
                    </div>
                    <div className="text-xs text-white/40">{t.client} · {t.status}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
