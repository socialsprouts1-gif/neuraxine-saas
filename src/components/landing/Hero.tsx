"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Phone, PhoneCall, Bot, TrendingUp, Mic, Shield } from "lucide-react";

const floatingCards = [
  {
    icon: <PhoneCall className="w-4 h-4 text-[#00FF87]" />,
    title: "Call Connected",
    subtitle: "Latency: 280ms",
    color: "#00FF87",
    pos: "top-16 -left-8",
    delay: 0,
  },
  {
    icon: <TrendingUp className="w-4 h-4 text-[#00D4FF]" />,
    title: "Lead Qualified",
    subtitle: "Demo scheduled ✓",
    color: "#00D4FF",
    pos: "top-36 -right-12",
    delay: 0.5,
  },
  {
    icon: <Bot className="w-4 h-4 text-purple-400" />,
    title: "Priya (AI Agent)",
    subtitle: "Hindi · Hinglish · EN",
    color: "#A855F7",
    pos: "bottom-24 -left-12",
    delay: 1,
  },
  {
    icon: <Shield className="w-4 h-4 text-[#00FF87]" />,
    title: "TRAI Compliant",
    subtitle: "DLT + 140-series ✓",
    color: "#00FF87",
    pos: "bottom-8 -right-8",
    delay: 1.5,
  },
];

const stats = [
  { value: "5K+", label: "Businesses" },
  { value: "1M+", label: "Calls Made" },
  { value: "82%", label: "Connect Rate" },
  { value: "3x", label: "More Calls / Rep" },
];

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background */}
      <div className="absolute inset-0 bg-hero-glow" />
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[#00FF87]/5 rounded-full blur-[150px]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#00FF87]/10 border border-[#00FF87]/20 text-[#00FF87] text-sm font-medium mb-8"
          >
            <Mic className="w-3.5 h-3.5 animate-pulse" />
            AI Voice Calling for India · Bolna + Plivo · Hindi, Hinglish & English
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] mb-6"
          >
            Your AI Sales Team
            <br />
            <span className="gradient-text-green">Makes Real Calls</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-white/60 max-w-2xl mx-auto mb-10"
          >
            Deploy AI voice agents that call your leads, handle inbound support, and qualify prospects — in Hindi, Hinglish, and English. TRAI-compliant, Indian telephony, sub-second response.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <Link href="/auth/register" className="btn-primary text-base px-7 py-3.5 group">
              Start Free Trial
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/dashboard" className="flex items-center gap-2 px-7 py-3.5 rounded-xl border border-white/15 text-white/80 hover:border-white/25 hover:text-white transition-all text-base font-medium">
              <Phone className="w-4 h-4" />
              View Live Demo
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto mb-20"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-black gradient-text-green">{stat.value}</div>
                <div className="text-white/40 text-sm mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Mock dashboard preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="relative max-w-4xl mx-auto"
        >
          <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.6)]">
            <div className="bg-[#0A0A0F] p-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
                </div>
                <div className="mx-auto text-xs text-white/30 font-mono">neuraxine.ai/dashboard</div>
              </div>
              {/* Mini dashboard UI */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Total Calls", value: "328", color: "text-[#00FF87]" },
                  { label: "Connect Rate", value: "82.6%", color: "text-[#00D4FF]" },
                  { label: "Avg Duration", value: "3m 14s", color: "text-[#7B2FFF]" },
                  { label: "Active", value: "2 agents", color: "text-[#FF6B35]" },
                ].map((s) => (
                  <div key={s.label} className="bg-white/4 rounded-xl p-3 border border-white/8">
                    <div className={`font-bold text-lg ${s.color}`}>{s.value}</div>
                    <div className="text-[10px] text-white/40">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white/3 rounded-xl p-3 border border-white/8">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-[#00FF87] animate-pulse" />
                  <span className="text-xs text-white/50">Live Calls</span>
                </div>
                {[
                  { name: "Rajesh Kumar", agent: "Priya", status: "In Progress", duration: "1:32" },
                  { name: "Sunita Sharma", agent: "Priya", status: "Ringing", duration: "0:08" },
                ].map((c) => (
                  <div key={c.name} className="flex items-center justify-between py-2 border-t border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#00FF87]/15 flex items-center justify-center text-[10px] font-bold">{c.name[0]}</div>
                      <span className="text-xs text-white/70">{c.name}</span>
                    </div>
                    <span className="text-[10px] text-[#00FF87]">{c.status} · {c.duration}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Floating cards */}
          {floatingCards.map((card) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + card.delay, duration: 0.4 }}
              className={`absolute ${card.pos} hidden lg:flex items-center gap-2.5 bg-[#0A0A0F]/95 border border-white/10 rounded-xl px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]`}
              style={{ boxShadow: `0 0 20px ${card.color}22, 0 8px 32px rgba(0,0,0,0.4)` }}
            >
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${card.color}18` }}>
                {card.icon}
              </div>
              <div>
                <div className="text-xs font-semibold">{card.title}</div>
                <div className="text-[10px] text-white/40">{card.subtitle}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
