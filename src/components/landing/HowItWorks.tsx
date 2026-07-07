"use client";

import { motion } from "framer-motion";
import { UserPlus, Wand2, PhoneCall, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Create your agent",
    desc: "Pick a template — sales, support, reminders or bookings — and give it your business details.",
  },
  {
    icon: Wand2,
    step: "02",
    title: "Choose voice & language",
    desc: "Select from natural Indian voices and 12 languages. Test it with a call to your own number.",
  },
  {
    icon: PhoneCall,
    step: "03",
    title: "Connect a number & launch",
    desc: "Get a virtual Indian number or toll-free line, upload contacts and start the campaign.",
  },
  {
    icon: TrendingUp,
    step: "04",
    title: "Track every conversation",
    desc: "Watch live calls, read transcripts, and push outcomes to your CRM and WhatsApp automatically.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-[#0B0B14]/60 border-y border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <span className="section-badge">How it works</span>
          <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight">
            Live in <span className="gradient-text">4 simple steps</span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="glass-card p-6 relative overflow-hidden"
            >
              <span className="absolute top-4 right-5 text-4xl font-extrabold text-white/5">{s.step}</span>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#8B5CF6]/30 to-[#22D3EE]/20 border border-[#8B5CF6]/30 flex items-center justify-center mb-4">
                <s.icon className="w-5 h-5 text-[#A78BFA]" />
              </div>
              <h3 className="font-semibold mb-1.5">{s.title}</h3>
              <p className="text-sm text-white/55 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
