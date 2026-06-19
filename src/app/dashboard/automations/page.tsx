"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Webhook, Zap, Activity, Copy, Trash2, Toggle, Info } from "lucide-react";

const webhooks = [
  {
    id: "1",
    url: "https://n8n.example.com/webhook/call-ended",
    events: ["call.ended", "call.recording_ready"],
    active: true,
    lastDelivery: "2 min ago",
    successRate: "99.1%",
  },
];

const EVENT_TYPES = [
  { value: "call.started", label: "Call Started" },
  { value: "call.answered", label: "Call Answered" },
  { value: "call.ended", label: "Call Ended" },
  { value: "call.failed", label: "Call Failed" },
  { value: "call.recording_ready", label: "Recording Ready" },
  { value: "campaign.started", label: "Campaign Started" },
  { value: "campaign.paused", label: "Campaign Paused" },
  { value: "campaign.completed", label: "Campaign Completed" },
];

export default function AutomationsPage() {
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const toggleEvent = (v: string) =>
    setSelectedEvents((prev) => prev.includes(v) ? prev.filter((e) => e !== v) : [...prev, v]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-white/50 text-sm mt-0.5">Outbound webhooks and n8n triggers for every call event.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00FF87] text-[#050508] text-sm font-semibold hover:bg-[#00FF87]/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Webhook
        </button>
      </div>

      {/* Info card */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-[#7B2FFF]/8 border border-[#7B2FFF]/20">
        <Info className="w-5 h-5 text-[#7B2FFF] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-white/60">
          Every call event is delivered to your webhook URLs with an HMAC-SHA256 signature. Use n8n to trigger CRM updates, send Slack alerts, or push outcomes to your data warehouse.
        </div>
      </div>

      {/* Add webhook form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5 space-y-4"
        >
          <h2 className="font-semibold">New Webhook</h2>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Endpoint URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-[#00FF87]/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-2 block">Events to subscribe</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {EVENT_TYPES.map((e) => (
                <button
                  key={e.value}
                  onClick={() => toggleEvent(e.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-all ${
                    selectedEvents.includes(e.value)
                      ? "bg-[#00FF87]/10 border border-[#00FF87]/20 text-[#00FF87]"
                      : "bg-white/4 border border-white/8 text-white/50 hover:border-white/15"
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl bg-white/5 text-sm font-medium hover:bg-white/8 transition-colors"
            >
              Cancel
            </button>
            <button className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#00FF87] text-[#050508] text-sm font-semibold hover:bg-[#00FF87]/90 transition-colors">
              <Webhook className="w-4 h-4" /> Create Webhook
            </button>
          </div>
        </motion.div>
      )}

      {/* Webhook list */}
      <div className="space-y-3">
        {webhooks.map((wh) => (
          <motion.div
            key={wh.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Webhook className="w-4 h-4 text-[#7B2FFF]" />
                  <code className="text-sm font-mono text-white/80 truncate">{wh.url}</code>
                  <button className="text-white/30 hover:text-white/60 flex-shrink-0">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {wh.events.map((e) => (
                    <span key={e} className="px-2 py-0.5 rounded-full bg-[#7B2FFF]/10 border border-[#7B2FFF]/20 text-[#7B2FFF] text-[10px] font-medium">
                      {e}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs text-white/40">
                  <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Last: {wh.lastDelivery}</span>
                  <span className="flex items-center gap-1 text-[#00FF87]"><Zap className="w-3 h-3" /> {wh.successRate} success</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button className={`w-10 h-5 rounded-full transition-colors ${wh.active ? "bg-[#00FF87]" : "bg-white/15"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${wh.active ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
                <button className="p-1.5 rounded-lg bg-white/5 hover:bg-[#FF3366]/10 text-white/30 hover:text-[#FF3366] transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {webhooks.length === 0 && (
          <div className="glass-card flex flex-col items-center justify-center py-16 text-center">
            <Webhook className="w-10 h-10 text-white/10 mb-3" />
            <div className="text-white/40 text-sm">No webhooks yet. Add one to start automating.</div>
          </div>
        )}
      </div>
    </div>
  );
}
