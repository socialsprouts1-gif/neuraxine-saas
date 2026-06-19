"use client";

import { motion } from "framer-motion";
import { Plus, Bot, Phone, PhoneIncoming, PhoneOutgoing, Mic, Globe, Pencil, Trash2, Play, ToggleLeft } from "lucide-react";
import Link from "next/link";

const agents = [
  {
    id: "1",
    name: "Priya - Sales Agent",
    direction: "outbound",
    language: "Hinglish",
    voice: "Priya (Female)",
    status: "active",
    callsToday: 47,
    avgDuration: "3m 12s",
    connectRate: "84%",
    lastUsed: "2 min ago",
  },
  {
    id: "2",
    name: "Arjun - Support Agent",
    direction: "inbound",
    language: "Hindi",
    voice: "Arjun (Male)",
    status: "active",
    callsToday: 12,
    avgDuration: "4m 58s",
    connectRate: "100%",
    lastUsed: "6h ago",
  },
];

const directionIcon = {
  outbound: { icon: PhoneOutgoing, color: "text-[#00FF87]", bg: "bg-[#00FF87]/10" },
  inbound: { icon: PhoneIncoming, color: "text-[#00D4FF]", bg: "bg-[#00D4FF]/10" },
  both: { icon: Phone, color: "text-[#7B2FFF]", bg: "bg-[#7B2FFF]/10" },
};

export default function AgentsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Voice Agents</h1>
          <p className="text-white/50 text-sm mt-0.5">Build and manage your AI phone agents.</p>
        </div>
        <Link
          href="/dashboard/agents/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00FF87] text-[#050508] text-sm font-semibold hover:bg-[#00FF87]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Agent
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#00FF87]/10 flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 text-[#00FF87]" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No agents yet</h2>
          <p className="text-white/40 text-sm mb-6 max-w-sm">Create your first AI voice agent. It can handle inbound calls, run outbound campaigns, or both.</p>
          <Link href="/dashboard/agents/new" className="btn-primary text-sm px-5 py-2.5">
            <Plus className="w-4 h-4" /> Create Agent
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent, i) => {
            const dir = directionIcon[agent.direction as keyof typeof directionIcon];
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="glass-card p-5 hover:border-white/20 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${dir.bg} flex items-center justify-center`}>
                      <dir.icon className={`w-5 h-5 ${dir.color}`} />
                    </div>
                    <div>
                      <div className="font-semibold">{agent.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-medium uppercase tracking-wide ${dir.color}`}>
                          {agent.direction}
                        </span>
                        <span className="text-white/20">·</span>
                        <span className="text-white/40 text-xs flex items-center gap-1">
                          <Globe className="w-3 h-3" /> {agent.language}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${agent.status === "active" ? "bg-[#00FF87] shadow-[0_0_6px_#00FF87]" : "bg-white/20"}`} />
                    <span className={`text-xs font-medium ${agent.status === "active" ? "text-[#00FF87]" : "text-white/40"}`}>
                      {agent.status}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mb-4">
                  <Mic className="w-3.5 h-3.5 text-white/30" />
                  <span className="text-white/50 text-xs">{agent.voice}</span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Calls Today", value: agent.callsToday },
                    { label: "Avg Duration", value: agent.avgDuration },
                    { label: "Connect Rate", value: agent.connectRate },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-white/4 p-3 text-center">
                      <div className="font-semibold text-sm">{stat.value}</div>
                      <div className="text-white/40 text-[10px] mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/agents/${agent.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-xs font-medium transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Link>
                  <button className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#00FF87]/10 hover:bg-[#00FF87]/20 text-[#00FF87] text-xs font-medium transition-colors">
                    <Play className="w-3.5 h-3.5" /> Test Call
                  </button>
                  <button className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 text-white/50 text-xs font-medium transition-colors">
                    <ToggleLeft className="w-3.5 h-3.5" />
                  </button>
                  <button className="flex items-center justify-center px-3 py-2 rounded-lg bg-white/5 hover:bg-[#FF3366]/10 text-white/30 hover:text-[#FF3366] text-xs transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
