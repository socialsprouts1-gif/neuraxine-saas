"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Play,
  Zap,
  MessageCircle,
  Bot,
  TrendingUp,
  Users,
  CheckCircle,
} from "lucide-react";

const floatingCards = [
  {
    icon: <MessageCircle className="w-4 h-4 text-accent-ink" />,
    title: "AI Reply Sent",
    subtitle: "Response time: 0.3s",
    color: "#00FF87",
    pos: "top-16 -left-8",
    delay: 0,
  },
  {
    icon: <TrendingUp className="w-4 h-4 text-accent2-ink" />,
    title: "Lead Converted",
    subtitle: "+$2,400 revenue",
    color: "#00D4FF",
    pos: "top-36 -right-12",
    delay: 0.5,
  },
  {
    icon: <Bot className="w-4 h-4 text-purple-400" />,
    title: "Chatbot Active",
    subtitle: "1,247 chats handled",
    color: "#A855F7",
    pos: "bottom-24 -left-12",
    delay: 1,
  },
  {
    icon: <Users className="w-4 h-4 text-accent-ink" />,
    title: "Campaign Sent",
    subtitle: "98.2% delivered",
    color: "#00FF87",
    pos: "bottom-8 -right-8",
    delay: 1.5,
  },
];

const stats = [
  { value: "50K+", label: "Active Businesses" },
  { value: "2.4B", label: "Messages Automated" },
  { value: "98.2%", label: "Delivery Rate" },
  { value: "12x", label: "Faster Response" },
];

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background effects */}
      <div className="absolute inset-0 grid-pattern opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--app-bg)]/50 to-[var(--app-bg)]" />

      {/* Radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-accent/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-accent2/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-purple-500/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="section-badge">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                AI-Powered WhatsApp Automation
              </span>
            </motion.div>

            {/* Headline */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="space-y-2"
            >
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight">
                Turn WhatsApp Into
              </h1>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight gradient-text-green">
                Your Sales Machine
              </h1>
            </motion.div>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg text-white/60 max-w-lg leading-relaxed"
            >
              Automate customer support, lead generation, sales follow-ups, and
              marketing campaigns with AI-powered WhatsApp workflows. No code required.
            </motion.p>

            {/* Feature pills */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="flex flex-wrap gap-2"
            >
              {["AI Chatbots", "Bulk Campaigns", "CRM Built-in", "Auto Follow-ups", "Analytics"].map((f) => (
                <span key={f} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70">
                  <CheckCircle className="w-3 h-3 text-accent-ink" />
                  {f}
                </span>
              ))}
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <Link href="/auth/register" className="btn-primary text-base px-7 py-3.5 animate-glow-pulse">
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button className="btn-secondary text-base px-7 py-3.5">
                <Play className="w-4 h-4 fill-current" />
                Watch Demo
              </button>
            </motion.div>

            {/* Social proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex items-center gap-4 pt-2"
            >
              <div className="flex -space-x-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-[var(--app-bg)] bg-gradient-to-br from-accent/30 to-accent2/30 flex items-center justify-center text-xs font-bold"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span key={s} className="text-yellow-400 text-sm">★</span>
                  ))}
                  <span className="text-sm font-semibold ml-1">4.9/5</span>
                </div>
                <p className="text-xs text-white/50">Trusted by 50,000+ businesses worldwide</p>
              </div>
            </motion.div>
          </div>

          {/* Right — Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative"
          >
            {/* Main dashboard card */}
            <div className="relative animate-float">
              <div className="glass-card p-1 shadow-[0_30px_80px_rgba(0,0,0,0.6)] border-[rgba(0,255,135,0.15)]">
                {/* Dashboard header */}
                <div className="bg-[#0F0F18] rounded-xl p-4 space-y-4">
                  {/* Top bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-accent" />
                    </div>
                    <div className="text-xs text-white/40 font-mono">Neura Chat — Dashboard</div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      <span className="text-xs text-accent-ink">Live</span>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Messages Today", value: "12,847", change: "+24%" },
                      { label: "Leads Captured", value: "342", change: "+18%" },
                      { label: "Revenue", value: "$48.2K", change: "+31%" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/5 rounded-lg p-3 border border-white/8">
                        <div className="text-xs text-white/50 mb-1">{s.label}</div>
                        <div className="text-lg font-bold">{s.value}</div>
                        <div className="text-xs text-accent-ink font-medium mt-0.5">{s.change}</div>
                      </div>
                    ))}
                  </div>

                  {/* Chart area */}
                  <div className="bg-white/3 rounded-lg p-3 border border-white/6 h-32 relative overflow-hidden">
                    <div className="text-xs text-white/40 mb-2">Message Volume (7 days)</div>
                    <svg viewBox="0 0 300 70" className="w-full h-full">
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00FF87" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#00FF87" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path
                        d="M0,50 C20,45 40,30 60,35 C80,40 100,20 120,15 C140,10 160,25 180,20 C200,15 220,5 240,10 C260,15 280,8 300,5 L300,70 L0,70 Z"
                        fill="url(#chartGrad)"
                      />
                      <path
                        d="M0,50 C20,45 40,30 60,35 C80,40 100,20 120,15 C140,10 160,25 180,20 C200,15 220,5 240,10 C260,15 280,8 300,5"
                        fill="none"
                        stroke="#00FF87"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>

                  {/* Chat preview */}
                  <div className="bg-white/3 rounded-lg p-3 border border-white/6 space-y-2">
                    <div className="text-xs text-white/40 mb-1">Live Conversations</div>
                    {[
                      { name: "Sarah M.", msg: "Hi! I'd like to order 3 units", time: "now", status: "AI Replying" },
                      { name: "James K.", msg: "What's the delivery time?", time: "2m", status: "Resolved" },
                    ].map((c) => (
                      <div key={c.name} className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/30 to-accent2/30 flex-shrink-0 flex items-center justify-center text-xs font-bold">
                          {c.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">{c.name}</span>
                            <span className="text-[10px] text-white/40">{c.time}</span>
                          </div>
                          <div className="text-[10px] text-white/50 truncate">{c.msg}</div>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.status === "AI Replying" ? "bg-accent/10 text-accent-ink" : "bg-white/5 text-white/40"}`}>
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating notification cards */}
            {floatingCards.map((card) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + card.delay, duration: 0.4 }}
                className={`absolute ${card.pos} glass-card px-3 py-2.5 flex items-center gap-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] min-w-[170px]`}
                style={{ zIndex: 10 }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${card.color}20`, border: `1px solid ${card.color}30` }}
                >
                  {card.icon}
                </div>
                <div>
                  <div className="text-xs font-semibold">{card.title}</div>
                  <div className="text-[10px] text-white/50">{card.subtitle}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/10"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="bg-[var(--surface-1)] px-8 py-6 text-center hover:bg-white/5 transition-colors">
              <div className="text-3xl font-black gradient-text-green mb-1">{stat.value}</div>
              <div className="text-sm text-white/50">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
