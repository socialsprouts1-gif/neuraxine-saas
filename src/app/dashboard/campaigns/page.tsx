"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Megaphone,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Phone,
  Bot,
  Lock,
  Info,
} from "lucide-react";
import Link from "next/link";

const campaigns = [
  {
    id: "1",
    name: "Q1 Sales Blitz",
    agent: "Priya - Sales Agent",
    list: "Q1 Leads",
    category: "transactional",
    status: "done",
    dltApproved: true,
    numberSeries: "140",
    total: 4,
    completed: 3,
    failed: 1,
    connectRate: "75%",
    avgDuration: "3m 6s",
    createdAt: "Jun 15, 2026",
  },
];

const statusStyle: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  draft: { icon: Clock, color: "text-white/50", bg: "bg-white/8", label: "Draft" },
  running: { icon: Play, color: "text-[#00FF87]", bg: "bg-[#00FF87]/10", label: "Running" },
  paused: { icon: Pause, color: "text-[#FF6B35]", bg: "bg-[#FF6B35]/10", label: "Paused" },
  done: { icon: CheckCircle2, color: "text-[#00D4FF]", bg: "bg-[#00D4FF]/10", label: "Completed" },
  failed: { icon: AlertTriangle, color: "text-[#FF3366]", bg: "bg-[#FF3366]/10", label: "Failed" },
};

const categoryColor: Record<string, string> = {
  promotional: "text-[#FF6B35] border-[#FF6B35]/30 bg-[#FF6B35]/5",
  transactional: "text-[#00D4FF] border-[#00D4FF]/30 bg-[#00D4FF]/5",
  service: "text-[#7B2FFF] border-[#7B2FFF]/30 bg-[#7B2FFF]/5",
};

export default function CampaignsPage() {
  const [showDltWarning, setShowDltWarning] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-white/50 text-sm mt-0.5">Manage outbound calling campaigns.</p>
        </div>
        <Link
          href="/dashboard/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00FF87] text-[#050508] text-sm font-semibold hover:bg-[#00FF87]/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </Link>
      </div>

      {/* TRAI Compliance Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#FF6B35]/8 border border-[#FF6B35]/20">
        <Info className="w-5 h-5 text-[#FF6B35] flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-semibold text-[#FF6B35]">India Calling Compliance (TRAI/DLT):</span>
          <span className="text-white/60 ml-2">
            Promotional campaigns require a 140-series number with approved DLT registration. Transactional campaigns use 160/1600-series. The system enforces this automatically — campaigns cannot launch without DLT approval.
          </span>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#00FF87]/10 flex items-center justify-center mb-4">
            <Megaphone className="w-8 h-8 text-[#00FF87]" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No campaigns yet</h2>
          <p className="text-white/40 text-sm mb-6 max-w-sm">Create your first outbound campaign. Pick an agent, upload contacts, set a schedule, and launch.</p>
          <Link href="/dashboard/campaigns/new" className="btn-primary text-sm px-5 py-2.5 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign, i) => {
            const s = statusStyle[campaign.status];
            const progress = campaign.total > 0 ? Math.round((campaign.completed / campaign.total) * 100) : 0;
            return (
              <motion.div
                key={campaign.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="glass-card p-5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-semibold text-base">{campaign.name}</h3>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${categoryColor[campaign.category]}`}>
                        {campaign.category}
                      </span>
                      {!campaign.dltApproved && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FF3366]/10 border border-[#FF3366]/30 text-[#FF3366]">
                          <Lock className="w-2.5 h-2.5" /> DLT Pending
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40">
                      <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> {campaign.agent}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {campaign.list}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {campaign.numberSeries}-series</span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.color}`}>
                    <s.icon className="w-3.5 h-3.5" />
                    {s.label}
                  </div>
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-white/40 mb-1.5">
                    <span>{campaign.completed} / {campaign.total} calls</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#00FF87] to-[#00D4FF]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Connect Rate", value: campaign.connectRate },
                    { label: "Avg Duration", value: campaign.avgDuration },
                    { label: "Failed", value: campaign.failed },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-white/4 p-3 text-center">
                      <div className="font-semibold text-sm">{stat.value}</div>
                      <div className="text-white/40 text-[10px] mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
