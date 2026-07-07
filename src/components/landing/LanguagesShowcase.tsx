"use client";

import { motion } from "framer-motion";
import { LANGUAGES } from "@/lib/constants";

export default function LanguagesShowcase() {
  return (
    <section id="languages" className="py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
        <span className="section-badge">भाषा no bar</span>
        <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight">
          Speaks the language <span className="gradient-text-saffron">your customers trust</span>
        </h2>
        <p className="mt-4 max-w-xl mx-auto text-white/60">
          Your agent detects the caller&apos;s language and switches naturally — even mixing Hindi and English the way real conversations flow.
        </p>

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          {LANGUAGES.map((l, i) => (
            <motion.div
              key={l.code}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="glass-card !rounded-full px-5 py-2.5 flex items-center gap-2.5 hover:border-[#FF9D3C]/40 transition-colors"
            >
              <span className="text-base font-semibold">{l.native}</span>
              <span className="text-xs text-white/40">{l.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
