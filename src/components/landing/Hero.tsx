"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Play, Zap, Target, TrendingUp, DollarSign, CheckCircle, Sparkles } from "lucide-react";

const floatingCards = [
  {
    icon: <Target className="w-4 h-4 text-[#C6FF00]" />,
    title: "Campaign Launched",
    subtitle: "Gym promo · ₹500/day",
    color: "#C6FF00",
    pos: "top-16 -left-8",
    delay: 0,
  },
  {
    icon: <TrendingUp className="w-4 h-4 text-[#00D4FF]" />,
    title: "32 Leads Today",
    subtitle: "₹47 cost per lead",
    color: "#00D4FF",
    pos: "top-36 -right-12",
    delay: 0.5,
  },
  {
    icon: <Sparkles className="w-4 h-4 text-purple-400" />,
    title: "AI Suggestion",
    subtitle: "Use UGC video for 2x CTR",
    color: "#A855F7",
    pos: "bottom-24 -left-12",
    delay: 1,
  },
  {
    icon: <DollarSign className="w-4 h-4 text-[#C6FF00]" />,
    title: "ROAS: 4.8x",
    subtitle: "₹12,400 revenue generated",
    color: "#C6FF00",
    pos: "bottom-8 -right-8",
    delay: 1.5,
  },
];

const stats = [
  { value: "10K+", label: "Campaigns Launched" },
  { value: "4.8x", label: "Average ROAS" },
  { value: "₹47", label: "Avg Cost Per Lead" },
  { value: "3min", label: "Campaign Setup" },
];

const prompts = [
  "Create a lead gen campaign for my gym in Pune with ₹500/day budget",
  "Target clinic owners aged 35-55 within 10 km of Mumbai",
  "Write 3 ad copy variations with WhatsApp CTA",
  "Pause my low-performing ads and boost the top one",
];

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background glows */}
      <div className="absolute inset-0 bg-hero-glow" />
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-[#C6FF00]/5 rounded-full blur-3xl" />
      <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-[#00D4FF]/5 rounded-full blur-3xl" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left content */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#C6FF00]/10 border border-[#C6FF00]/20 text-[#C6FF00] text-sm font-medium mb-8"
            >
              <Zap className="w-3.5 h-3.5" />
              AI-Powered Meta Ads Platform
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight mb-6"
            >
              Create Meta Ads
              <br />
              <span className="gradient-text-green">with a Prompt</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-lg text-white/60 leading-relaxed mb-8 max-w-lg"
            >
              Type what you want. AdPilot AI converts your natural language into
              complete Meta ad campaigns — targeting, copy, creatives, and budgets —
              and launches them directly to Meta Ads Manager.
            </motion.p>

            {/* Prompt examples */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-4 mb-8 border-[#C6FF00]/15"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-[#C6FF00] animate-pulse" />
                <span className="text-xs text-white/50 font-medium">Try asking AdPilot...</span>
              </div>
              <div className="space-y-2">
                {prompts.map((p, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.08 }}
                    className="flex items-start gap-2 text-sm text-white/70 hover:text-white cursor-pointer group"
                  >
                    <ArrowRight className="w-3.5 h-3.5 mt-0.5 text-[#C6FF00] flex-shrink-0 group-hover:translate-x-1 transition-transform" />
                    {p}
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="flex flex-wrap items-center gap-3"
            >
              <Link href="/auth/register" className="btn-primary">
                Start Free — No Card Needed
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/15 text-sm font-medium text-white/70 hover:text-white hover:border-white/25 transition-all">
                <Play className="w-4 h-4" />
                Watch Demo
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center gap-4 mt-6"
            >
              {["No Meta experience needed", "Launch in 3 minutes", "Cancel anytime"].map((t) => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-white/50">
                  <CheckCircle className="w-3.5 h-3.5 text-[#C6FF00]" />
                  {t}
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — floating UI mock */}
          <div className="relative h-[520px] hidden lg:block">
            {/* Central mock screen */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="absolute inset-8 glass-card border-[#C6FF00]/20 overflow-hidden shadow-[0_0_80px_rgba(198,255,0,0.1)]"
            >
              {/* Mock header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 bg-white/3">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#C6FF00] to-[#00FF87] flex items-center justify-center">
                  <Zap className="w-3 h-3 text-[#050508]" />
                </div>
                <span className="text-xs font-semibold">AdPilot AI — Campaign Builder</span>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-[#C6FF00] animate-pulse" />
                  <span className="text-[10px] text-[#C6FF00]">Live</span>
                </div>
              </div>

              {/* Mock chat */}
              <div className="p-4 space-y-3">
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">U</div>
                  <div className="bg-white/8 rounded-xl rounded-tl-none px-3 py-2 text-xs text-white/80 max-w-xs">
                    Create a lead generation campaign for my gym in Pune with ₹500/day budget targeting people interested in fitness.
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#C6FF00]/20 border border-[#C6FF00]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-[#C6FF00]" />
                  </div>
                  <div className="bg-[#C6FF00]/5 border border-[#C6FF00]/15 rounded-xl rounded-tl-none px-3 py-2.5 text-xs text-white/80 max-w-xs space-y-1.5">
                    <p className="text-[#C6FF00] font-semibold">Campaign Ready ✓</p>
                    <p>📍 Pune, 15km radius</p>
                    <p>🎯 Fitness, Gym, Health & Wellness</p>
                    <p>💰 ₹500/day · Lead Generation</p>
                    <p>📱 Facebook + Instagram Feed, Reels</p>
                    <p className="text-white/50">CTA: "Get Free Trial →"</p>
                  </div>
                </div>

                {/* Campaign card */}
                <div className="mt-2 bg-white/5 rounded-xl p-3 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">Generated Campaign</span>
                    <span className="text-[10px] bg-[#C6FF00]/15 text-[#C6FF00] px-2 py-0.5 rounded-full">Ready to Launch</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {[
                      ["Objective", "Lead Generation"],
                      ["Budget", "₹500/day"],
                      ["Audience", "25-45, Fitness"],
                      ["Placements", "FB + IG + Reels"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div className="text-white/40">{k}</div>
                        <div className="text-white/80 font-medium">{v}</div>
                      </div>
                    ))}
                  </div>
                  <button className="mt-3 w-full py-1.5 rounded-lg bg-[#C6FF00] text-[#050508] text-xs font-bold">
                    Review & Launch →
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Floating cards */}
            {floatingCards.map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + card.delay, duration: 0.4 }}
                className={`absolute ${card.pos} glass-card px-3 py-2.5 flex items-center gap-2.5 shadow-lg animate-float`}
                style={{ animationDelay: `${card.delay}s` }}
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
          </div>
        </div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 pt-12 border-t border-white/8"
        >
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-black gradient-text-green mb-1">{s.value}</div>
              <div className="text-sm text-white/50">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
