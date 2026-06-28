"use client";

import { motion } from "framer-motion";
import { Send, CheckCircle, Eye, Users } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import Header from "@/components/dashboard/Header";
import { useApi } from "@/lib/use-api";

interface Analytics {
  kpis: { totalSent: number; delivered: number; deliveryRate: number; readRate: number; inbound: number; contacts: number; activeCampaigns: number };
  trend: Array<{ label: string; sent: number; delivered: number; read: number }>;
  funnel: Array<{ stage: string; value: number }>;
  topRules: Array<{ name: string; triggered: number }>;
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`);
const funnelColors = ["#00FF87", "#00D4FF", "#A855F7", "#F59E0B"];

export default function AnalyticsPage() {
  const { data } = useApi<Analytics>("/api/analytics");
  const k = data?.kpis;

  const cards = [
    { label: "Total Sent", value: k ? fmt(k.totalSent) : "—", icon: Send, color: "#00FF87" },
    { label: "Delivery Rate", value: k ? `${k.deliveryRate}%` : "—", icon: CheckCircle, color: "#00D4FF" },
    { label: "Read Rate", value: k ? `${k.readRate}%` : "—", icon: Eye, color: "#A855F7" },
    { label: "Contacts", value: k ? fmt(k.contacts) : "—", icon: Users, color: "#F59E0B" },
  ];

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Analytics" subtitle="Performance across messages, campaigns and automations" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c, i) => (
            <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${c.color}15`, border: `1px solid ${c.color}25` }}>
                <c.icon className="w-4 h-4" style={{ color: c.color }} />
              </div>
              <div className="text-2xl font-black" style={{ color: c.color }}>{c.value}</div>
              <div className="text-xs text-white/50 mt-0.5">{c.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Trend */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
          <h3 className="font-semibold mb-4">Message volume — last 14 days</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trend ?? []}>
                <defs>
                  <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00FF87" stopOpacity={0.4} /><stop offset="100%" stopColor="#00FF87" stopOpacity={0} /></linearGradient>
                  <linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A855F7" stopOpacity={0.4} /><stop offset="100%" stopColor="#A855F7" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} tickLine={false} tickFormatter={fmt} />
                <Tooltip contentStyle={{ background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="sent" stroke="#00FF87" strokeWidth={2} fill="url(#s)" />
                <Area type="monotone" dataKey="read" stroke="#A855F7" strokeWidth={2} fill="url(#r)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Funnel */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
            <h3 className="font-semibold mb-4">Delivery funnel</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.funnel ?? []} layout="vertical">
                  <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={11} tickFormatter={fmt} />
                  <YAxis type="category" dataKey="stage" stroke="rgba(255,255,255,0.5)" fontSize={12} width={80} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#0A0A0F", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {(data?.funnel ?? []).map((_, i) => <Cell key={i} fill={funnelColors[i % funnelColors.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Top rules */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
            <h3 className="font-semibold mb-4">Top automation rules</h3>
            <div className="space-y-3">
              {(data?.topRules ?? []).map((r, i) => {
                const max = data?.topRules[0]?.triggered || 1;
                return (
                  <div key={r.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white/70">{r.name}</span>
                      <span className="text-white/45">{r.triggered.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(r.triggered / max) * 100}%`, background: funnelColors[i % funnelColors.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
