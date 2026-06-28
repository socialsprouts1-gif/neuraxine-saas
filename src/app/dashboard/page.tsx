"use client";

import { motion } from "framer-motion";
import {
  Send, Users, Megaphone, MessageCircle, Bot, Zap, TrendingUp, Activity,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import Header from "@/components/dashboard/Header";
import { useApi } from "@/lib/use-api";

interface Overview {
  stats: { messagesSent: number; contacts: number; activeCampaigns: number; unreadConversations: number; activeRules: number; automationsRun: number };
  spark: number[];
  recentConversations: Array<{ id: string; lastMessagePreview: string; lastMessageAt: string; contact?: { name: string } }>;
  activity: Array<{ id: string; type: string; text: string; timestamp: string }>;
}

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`);
function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function DashboardPage() {
  const { data } = useApi<Overview>("/api/overview");
  const stats = data?.stats;
  const spark = (data?.spark ?? []).map((v, i) => ({ i, v }));

  const cards = [
    { label: "Messages Sent", value: stats ? fmt(stats.messagesSent) : "—", icon: Send, color: "#00FF87" },
    { label: "Contacts", value: stats ? fmt(stats.contacts) : "—", icon: Users, color: "#00D4FF" },
    { label: "Active Campaigns", value: stats?.activeCampaigns ?? "—", icon: Megaphone, color: "#A855F7" },
    { label: "Unread Chats", value: stats?.unreadConversations ?? "—", icon: MessageCircle, color: "#F59E0B" },
    { label: "Active Rules", value: stats?.activeRules ?? "—", icon: Bot, color: "#EC4899" },
    { label: "Automations Run", value: stats ? fmt(stats.automationsRun) : "—", icon: Zap, color: "#00FF87" },
  ];

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Dashboard" subtitle="Your WhatsApp automation at a glance" />
      <div className="p-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {cards.map((c, i) => (
            <motion.div key={c.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card p-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${c.color}15`, border: `1px solid ${c.color}25` }}>
                <c.icon className="w-4 h-4" style={{ color: c.color }} />
              </div>
              <div className="text-2xl font-black" style={{ color: c.color }}>{c.value}</div>
              <div className="text-xs text-white/50 mt-0.5">{c.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Volume chart */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#00FF87]" /> Message Volume</h3>
                <p className="text-xs text-white/40">Last 7 days</p>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00FF87" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#00FF87" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#00FF87" strokeWidth={2} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Activity feed */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
            <h3 className="font-semibold flex items-center gap-2 mb-4"><Activity className="w-4 h-4 text-[#00D4FF]" /> Recent Activity</h3>
            <div className="space-y-3">
              {(data?.activity ?? []).slice(0, 6).map((a) => (
                <div key={a.id} className="flex gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00FF87] mt-1.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-white/80 leading-snug">{a.text}</p>
                    <p className="text-[10px] text-white/35">{timeAgo(a.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Recent conversations */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-6">
          <h3 className="font-semibold flex items-center gap-2 mb-4"><MessageCircle className="w-4 h-4 text-[#A855F7]" /> Recent Conversations</h3>
          <div className="space-y-2">
            {(data?.recentConversations ?? []).map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00FF87]/30 to-[#00D4FF]/30 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {c.contact?.name?.charAt(0) ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.contact?.name}</div>
                  <div className="text-xs text-white/40 truncate">{c.lastMessagePreview}</div>
                </div>
                <span className="text-[10px] text-white/35 flex-shrink-0">{timeAgo(c.lastMessageAt)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
