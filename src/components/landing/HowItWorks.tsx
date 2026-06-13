"use client";

import { motion } from "framer-motion";
import { Plug2, Wand2, Eye, Rocket, ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01", icon: Plug2, color: "#C6FF00", bgColor: "rgba(198,255,0,0.1)",
    title: "Connect Meta Account",
    desc: "Link your Meta Business Suite account via our secure MCP integration. AdPilot fetches your ad accounts, pages, pixels, and custom audiences instantly.",
    highlights: ["Meta MCP", "Secure OAuth", "All accounts synced"],
  },
  {
    number: "02", icon: Wand2, color: "#00D4FF", bgColor: "rgba(0,212,255,0.1)",
    title: "Describe Your Campaign",
    desc: "Type what you want in plain language. \"Lead gen for my gym in Pune, ₹500/day, targeting fitness lovers.\" AdPilot AI converts it into a complete campaign structure.",
    highlights: ["Natural language", "GPT-4o powered", "Full campaign structure"],
  },
  {
    number: "03", icon: Eye, color: "#A855F7", bgColor: "rgba(168,85,247,0.1)",
    title: "Review & Preview",
    desc: "See your ad previewed across Facebook Feed, Instagram Feed, Stories, and Reels. Review targeting, copy, budget, and UTMs. Make tweaks via chat before publishing.",
    highlights: ["Live ad preview", "Policy check", "Edit via chat"],
  },
  {
    number: "04", icon: Rocket, color: "#C6FF00", bgColor: "rgba(198,255,0,0.1)",
    title: "Launch & Optimize",
    desc: "One click to publish. AdPilot creates the campaign → ad set → creative → ad directly in Meta Ads Manager. Monitor performance and let AI suggest optimizations.",
    highlights: ["One-click launch", "Real-time analytics", "AI optimization"],
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C6FF00]/10 border border-[#C6FF00]/20 text-[#C6FF00] text-sm font-medium mb-6">
            <Rocket className="w-3.5 h-3.5" /> From prompt to live campaign in minutes
          </div>
          <h2 className="text-4xl sm:text-5xl font-black mb-4">
            How AdPilot <span className="gradient-text-green">works</span>
          </h2>
          <p className="text-white/50 max-w-xl mx-auto">
            Four steps from zero to a live Meta campaign. No ads manager experience required.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <motion.div key={step.number} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="relative">
              <div className="glass-card p-6 h-full hover:border-white/20 transition-all hover:-translate-y-1">
                <div className="text-5xl font-black opacity-10 mb-4" style={{ color: step.color }}>{step.number}</div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: step.bgColor, border: `1px solid ${step.color}30` }}>
                  <step.icon className="w-5 h-5" style={{ color: step.color }} />
                </div>
                <h3 className="font-bold text-base mb-2">{step.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed mb-4">{step.desc}</p>
                <div className="space-y-1.5">
                  {step.highlights.map((h) => (
                    <div key={h} className="flex items-center gap-2 text-xs text-white/60">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: step.color }} />
                      {h}
                    </div>
                  ))}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden lg:flex absolute top-1/2 -right-3 -translate-y-1/2 z-10">
                  <ArrowRight className="w-5 h-5 text-white/20" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
