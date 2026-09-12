"use client";

import { motion } from "framer-motion";
import { Link2, GitBranch, TrendingUp, ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Link2,
    color: "#00FF87",
    bgColor: "rgba(0,255,135,0.1)",
    title: "Connect WhatsApp",
    desc: "Link your WhatsApp Business number via the official Meta Cloud API in under 5 minutes. No technical setup needed.",
    highlights: ["Meta Cloud API", "Official WhatsApp", "Instant setup"],
  },
  {
    number: "02",
    icon: GitBranch,
    color: "#00D4FF",
    bgColor: "rgba(0,212,255,0.1)",
    title: "Build Your Automation",
    desc: "Use our visual drag-and-drop builder to create workflows — chatbots, campaigns, follow-ups, CRM rules, and more.",
    highlights: ["No-code builder", "AI chatbots", "Smart triggers"],
  },
  {
    number: "03",
    icon: TrendingUp,
    color: "#A855F7",
    bgColor: "rgba(168,85,247,0.1)",
    title: "Grow with AI",
    desc: "Watch AI engage, qualify, and convert your leads 24/7. Track everything in real-time with our analytics dashboard.",
    highlights: ["24/7 automation", "AI qualification", "Revenue tracking"],
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0A0A14]/50 to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/4 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4 mb-20"
        >
          <span className="section-badge">How It Works</span>
          <h2 className="text-4xl md:text-5xl font-bold">
            Live in{" "}
            <span className="gradient-text-green">3 simple steps</span>
          </h2>
          <p className="text-lg text-white/60 max-w-xl mx-auto">
            From zero to fully automated WhatsApp business in minutes — no developers needed.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[70%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent hidden lg:block" />

          <div className="grid lg:grid-cols-3 gap-10">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className="relative text-center space-y-5"
              >
                {/* Step number + icon */}
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <div
                      className="w-20 h-20 rounded-2xl flex items-center justify-center border"
                      style={{
                        background: step.bgColor,
                        borderColor: `${step.color}30`,
                        boxShadow: `0 0 40px ${step.color}15`,
                      }}
                    >
                      <step.icon className="w-9 h-9" style={{ color: step.color }} />
                    </div>
                    <span
                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border"
                      style={{
                        background: step.color,
                        color: "#050508",
                        borderColor: "#050508",
                      }}
                    >
                      {i + 1}
                    </span>
                  </div>

                  {/* Step num label */}
                  <div className="text-6xl font-black" style={{ color: `${step.color}10` }}>
                    {step.number}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-2xl font-bold">{step.title}</h3>
                  <p className="text-white/55 leading-relaxed">{step.desc}</p>

                  {/* Highlights */}
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {step.highlights.map((h) => (
                      <span
                        key={h}
                        className="px-3 py-1 rounded-full text-xs font-medium"
                        style={{
                          background: step.bgColor,
                          color: step.color,
                          border: `1px solid ${step.color}30`,
                        }}
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Arrow connector */}
                {i < steps.length - 1 && (
                  <div className="lg:hidden flex justify-center mt-4">
                    <ArrowRight className="w-6 h-6 text-white/20 rotate-90" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-16"
        >
          <a href="/auth/register" className="btn-primary text-base px-8 py-4">
            Get Started Free
            <ArrowRight className="w-5 h-5" />
          </a>
        </motion.div>
      </div>
    </section>
  );
}
