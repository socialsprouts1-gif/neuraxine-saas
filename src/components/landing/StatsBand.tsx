"use client";

// Four facts about how the product is built.
//
// These used to sit inside the hero, under the handset, where they were
// the fifth thing competing for the same glance. They say something worth
// reading — direct Cloud API, your number, no markup — so they get a band
// of their own between the hero and the features.
//
// Every one of them is true today and stays true as the business grows,
// which is the test that keeps a stat on this page.

import { motion } from "framer-motion";
import type { HeroContent } from "@/lib/site-content";

export default function StatsBand({ stats }: { stats: HeroContent["stats"] }) {
  if (stats.length === 0) return null;

  return (
    <section className="relative">
      <div className="max-w-[1400px] mx-auto px-5 sm:px-8 py-14 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="grid grid-cols-2 lg:grid-cols-4 rounded-3xl bg-[#FFFFFF] border border-[rgba(23,18,38,0.06)] shadow-[0_1px_2px_rgba(23,18,38,0.04),0_18px_44px_rgba(23,18,38,0.07)] overflow-hidden"
        >
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={`px-7 py-8 text-center ${
                i % 2 === 1 ? "border-l border-[rgba(23,18,38,0.06)]" : ""
              } ${i >= 2 ? "border-t lg:border-t-0 border-[rgba(23,18,38,0.06)]" : ""} ${
                i === 2 ? "lg:border-l lg:border-[rgba(23,18,38,0.06)]" : ""
              }`}
            >
              <div className="text-[2rem] lg:text-[2.25rem] font-extrabold gradient-text-green leading-none tracking-tight">
                {stat.value}
              </div>
              <div className="text-sm text-white/50 mt-2.5 font-medium">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
