"use client";

import { motion } from "framer-motion";
import {
  ChevronLeft,
  Phone,
  Clock,
  PhoneOutgoing,
  TrendingUp,
  Bot,
  User,
  FileText,
  Mic,
  Play,
  Pause,
  Volume2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const mockCall = {
  id: "50000000-0000-0000-0000-000000000001",
  contactName: "Rajesh Kumar",
  contactNumber: "+91 98765 43001",
  direction: "outbound",
  agent: "Priya - Sales Agent",
  campaign: "Q1 Sales Blitz",
  startedAt: "Jun 17, 2026 · 10:00 AM",
  duration: "2 min 55 sec",
  status: "ended",
  disposition: "interested",
  sentiment: "positive",
  summary: "Customer Rajesh expressed strong interest in the premium plan. He mentioned he has a team of 20 sales reps who make approximately 100 calls per day each. Key concern was pricing — wanted to understand the per-minute cost at scale. Scheduled a product demo for next Tuesday at 3 PM IST.",
  structuredData: {
    "Lead Score": "High (8/10)",
    "Team Size": "20 reps",
    "Call Volume": "~100 calls/day/rep",
    "Main Concern": "Pricing at scale",
    "Demo Scheduled": "Tuesday 3 PM IST",
    "Decision Maker": "Yes",
  },
  transcript: [
    { role: "agent", text: "Namaste! Main Priya bol rahi hoon Acme Corp se. Kya aap humare AI calling product ke baare mein jaanna chahenge?", ts: "0:00" },
    { role: "agent", text: "Disclosure: Yeh call ek automated AI assistant ki taraf se hai. Aap kabhi bhi 'goodbye' bol ke call end kar sakte hain.", ts: "0:05" },
    { role: "caller", text: "Haan, bol. Kya karta hai tumhara product exactly?", ts: "0:12" },
    { role: "agent", text: "Humara product AI-powered voice calling solution hai. Aapke sales agents ki jagah AI phone calls kar sakta hai — Hindi, English, Hinglish mein. 3 guna zyada calls, same cost.", ts: "0:18" },
    { role: "caller", text: "Interesting. Hamare paas 20 sales reps hain. Har ek din mein 100 calls karta hai. Kitna paisa lagega?", ts: "0:35" },
    { role: "agent", text: "Bilkul! 20 reps ke liye approximately ₹2-3 per minute ka rate aata hai scale pe. Exact pricing ke liye demo helpful hoga. Kya aap next Tuesday ko available hain?", ts: "0:50" },
    { role: "caller", text: "Haan, Tuesday 3 baje theek rahega.", ts: "1:15" },
    { role: "agent", text: "Perfect! Main aapko calendar invite bhejti hoon. Koi aur sawaal hai abhi ke liye?", ts: "1:20" },
    { role: "caller", text: "Nahi, shukriya.", ts: "1:30" },
    { role: "agent", text: "Bahut shukriya Rajesh ji! Tuesday ko milte hain. Namaste!", ts: "1:33" },
  ],
};

export default function CallDetailPage() {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/calls" className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">Call with {mockCall.contactName}</h1>
          <p className="text-white/40 text-sm">{mockCall.startedAt}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-[#00FF87]/10 border border-[#00FF87]/20 text-[#00FF87] text-xs font-medium flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Interested
          </span>
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: PhoneOutgoing, label: "Direction", value: "Outbound", color: "text-[#00FF87]" },
          { icon: Clock, label: "Duration", value: mockCall.duration, color: "text-[#00D4FF]" },
          { icon: Bot, label: "Agent", value: "Priya", color: "text-[#7B2FFF]" },
          { icon: Phone, label: "Number", value: "+91 98765 43001", color: "text-white/60" },
        ].map((item) => (
          <div key={item.label} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
              <span className="text-[11px] text-white/40 uppercase tracking-wide">{item.label}</span>
            </div>
            <div className="font-semibold text-sm truncate">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Transcript — 3 cols */}
        <div className="lg:col-span-3 space-y-4">
          {/* Recording */}
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mic className="w-4 h-4 text-[#00FF87]" />
              <h2 className="font-semibold text-sm">Recording</h2>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
              <button
                onClick={() => setPlaying(!playing)}
                className="w-9 h-9 rounded-full bg-[#00FF87] flex items-center justify-center text-[#050508] flex-shrink-0"
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[35%] bg-gradient-to-r from-[#00FF87] to-[#00D4FF] rounded-full" />
                </div>
                <div className="flex justify-between text-[10px] text-white/30 mt-1">
                  <span>1:02</span>
                  <span>2:55</span>
                </div>
              </div>
              <Volume2 className="w-4 h-4 text-white/40" />
            </div>
          </div>

          {/* Transcript */}
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#7B2FFF]" />
              <h2 className="font-semibold text-sm">Transcript</h2>
            </div>
            <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
              {mockCall.transcript.map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: t.role === "agent" ? -8 : 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`flex gap-2.5 ${t.role === "caller" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${t.role === "agent" ? "bg-[#00FF87]/15 text-[#00FF87]" : "bg-white/8 text-white/60"}`}>
                    {t.role === "agent" ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`max-w-[80%] ${t.role === "caller" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                    <div className={`px-3 py-2 rounded-xl text-sm ${t.role === "agent" ? "bg-[#00FF87]/8 border border-[#00FF87]/15 rounded-tl-sm" : "bg-white/8 border border-white/10 rounded-tr-sm"}`}>
                      {t.text}
                    </div>
                    <span className="text-[10px] text-white/25 px-1">{t.ts}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Analysis — 2 cols */}
        <div className="lg:col-span-2 space-y-4">
          {/* AI Summary */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-[#7B2FFF]" />
              <h2 className="font-semibold text-sm">AI Summary</h2>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[#00FF87]/10 text-[#00FF87] border border-[#00FF87]/15">Gemini</span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{mockCall.summary}</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-white/40">Sentiment:</span>
              <span className="text-xs font-semibold text-[#00FF87] flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Positive
              </span>
            </div>
          </div>

          {/* Structured Data */}
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-[#00D4FF]" />
              <h2 className="font-semibold text-sm">Extracted Data</h2>
            </div>
            <div className="space-y-2.5">
              {Object.entries(mockCall.structuredData).map(([key, value]) => (
                <div key={key} className="flex justify-between items-start gap-2">
                  <span className="text-xs text-white/40 flex-shrink-0">{key}</span>
                  <span className="text-xs font-medium text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
