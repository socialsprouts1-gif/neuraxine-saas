"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  PhoneIncoming,
  PhoneOutgoing,
  Phone,
  Clock,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
  Filter,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";

const calls = [
  { id: "50000000-0000-0000-0000-000000000001", name: "Rajesh Kumar", number: "+91 98765 43001", direction: "outbound", agent: "Priya", campaign: "Q1 Sales Blitz", duration: "2:55", status: "ended", disposition: "interested", sentiment: "positive", started: "2 days ago, 10:00 AM" },
  { id: "50000000-0000-0000-0000-000000000002", name: "Sunita Sharma", number: "+91 98765 43002", direction: "outbound", agent: "Priya", campaign: "Q1 Sales Blitz", duration: "2:20", status: "ended", disposition: "callback", sentiment: "neutral", started: "2 days ago, 11:00 AM" },
  { id: "50000000-0000-0000-0000-000000000003", name: "Amit Singh", number: "+91 98765 43003", direction: "outbound", agent: "Priya", campaign: "Q1 Sales Blitz", duration: "4:05", status: "ended", disposition: "completed", sentiment: "positive", started: "1 day ago, 10:00 AM" },
  { id: "50000000-0000-0000-0000-000000000004", name: "Deepa Nair", number: "+91 98765 43004", direction: "outbound", agent: "Priya", campaign: "Q1 Sales Blitz", duration: "—", status: "no_answer", disposition: "no_answer", sentiment: null, started: "1 day ago, 2:00 PM" },
  { id: "50000000-0000-0000-0000-000000000005", name: "Inbound Caller", number: "+91 98765 43001", direction: "inbound", agent: "Arjun", campaign: null, duration: "4:58", status: "ended", disposition: "completed", sentiment: "positive", started: "6 hours ago" },
];

const dispositionStyle: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  interested: { icon: TrendingUp, color: "text-[#00FF87]", label: "Interested" },
  completed: { icon: CheckCircle2, color: "text-[#00D4FF]", label: "Completed" },
  callback: { icon: Clock, color: "text-[#7B2FFF]", label: "Callback" },
  no_answer: { icon: XCircle, color: "text-white/40", label: "No Answer" },
  not_interested: { icon: XCircle, color: "text-[#FF3366]", label: "Not Interested" },
  failed: { icon: AlertCircle, color: "text-[#FF3366]", label: "Failed" },
};

const sentimentColor: Record<string, string> = {
  positive: "text-[#00FF87]",
  neutral: "text-[#FF6B35]",
  negative: "text-[#FF3366]",
};

export default function CallsPage() {
  const [search, setSearch] = useState("");
  const filtered = calls.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.number.includes(search) ||
      c.agent.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Call Log</h1>
          <p className="text-white/50 text-sm mt-0.5">All inbound and outbound calls across your agents.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/8 flex-1 min-w-[200px] max-w-sm">
          <Search className="w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search calls..."
            className="bg-transparent text-sm outline-none flex-1 text-white placeholder-white/30"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-sm text-white/60 hover:bg-white/8 transition-colors">
          <Filter className="w-4 h-4" /> Filter
        </button>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {["Contact", "Direction", "Agent", "Duration", "Disposition", "Sentiment", "Time", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((call, i) => {
                const d = dispositionStyle[call.disposition] ?? dispositionStyle.failed;
                return (
                  <motion.tr
                    key={call.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-white/5 hover:bg-white/3 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{call.name}</div>
                      <div className="text-white/40 text-xs">{call.number}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {call.direction === "inbound" ? (
                          <PhoneIncoming className="w-3.5 h-3.5 text-[#00D4FF]" />
                        ) : (
                          <PhoneOutgoing className="w-3.5 h-3.5 text-[#00FF87]" />
                        )}
                        <span className={`text-xs font-medium capitalize ${call.direction === "inbound" ? "text-[#00D4FF]" : "text-[#00FF87]"}`}>
                          {call.direction}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white/70">{call.agent}</div>
                      {call.campaign && <div className="text-white/30 text-xs truncate max-w-[120px]">{call.campaign}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-white/70">
                        <Clock className="w-3.5 h-3.5 text-white/30" />
                        {call.duration}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-1.5 font-medium ${d.color}`}>
                        <d.icon className="w-3.5 h-3.5" />
                        {d.label}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {call.sentiment ? (
                        <span className={`text-xs font-medium capitalize ${sentimentColor[call.sentiment]}`}>
                          {call.sentiment}
                        </span>
                      ) : (
                        <span className="text-white/20 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">{call.started}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/calls/${call.id}`}
                        className="flex items-center gap-1 text-xs text-[#00FF87] hover:underline"
                      >
                        View <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Phone className="w-10 h-10 text-white/10 mb-3" />
            <div className="text-white/40 text-sm">No calls found</div>
          </div>
        )}
      </div>
    </div>
  );
}
