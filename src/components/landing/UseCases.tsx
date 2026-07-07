"use client";

import { motion } from "framer-motion";
import { AGENT_TEMPLATES } from "@/lib/constants";

const industries = [
  "Real Estate", "NBFC & Lending", "Clinics & Hospitals", "EdTech", "D2C Brands",
  "Insurance", "Travel", "Salons", "Logistics", "Automobile Dealers",
];

export default function UseCases() {
  return (
    <section id="use-cases" className="py-24 bg-[#0B0B14]/60 border-y border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <span className="section-badge">Use cases</span>
          <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight">
            One platform, <span className="gradient-text">every calling job</span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
          {AGENT_TEMPLATES.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
              className="glass-card p-6"
            >
              <div className="text-3xl mb-3">{t.emoji}</div>
              <h3 className="font-semibold mb-1.5">{t.label}</h3>
              <p className="text-sm text-white/55 leading-relaxed mb-4">{t.description}</p>
              <div className="text-xs text-white/40 bg-white/4 border border-white/8 rounded-lg p-3 italic">
                &ldquo;{t.greeting.replace("{{company}}", "your company")}&rdquo;
              </div>
            </motion.div>
          ))}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, delay: 0.16 }}
            className="glass-card p-6 border-dashed !border-[#8B5CF6]/30 flex flex-col items-start justify-center"
          >
            <div className="text-3xl mb-3">✨</div>
            <h3 className="font-semibold mb-1.5">Or build your own</h3>
            <p className="text-sm text-white/55 leading-relaxed">
              Start from a blank prompt and design any conversation you can imagine — the agent follows your script.
            </p>
          </motion.div>
        </div>

        <div className="flex flex-wrap justify-center gap-2.5">
          {industries.map((ind) => (
            <span key={ind} className="tag-violet !rounded-full !px-4 !py-1.5">{ind}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
