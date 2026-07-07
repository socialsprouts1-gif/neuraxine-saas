"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Zap } from "lucide-react";
import { PLANS } from "@/lib/constants";
import { formatINR } from "@/lib/utils";

export default function Pricing() {
  return (
    <section id="pricing" className="py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <span className="section-badge">Simple ₹ pricing</span>
          <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight">
            Pay in rupees, <span className="gradient-text">grow in minutes</span>
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-white/60">
            All plans include recordings, transcripts and GST invoices. Recharge extra minutes anytime via UPI.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={`glass-card p-7 relative flex flex-col ${
                p.popular ? "!border-[#8B5CF6]/60 shadow-[0_0_60px_rgba(139,92,246,0.25)]" : ""
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE] text-white px-3 py-1 rounded-full">
                  <Zap className="w-3 h-3" /> Most popular
                </span>
              )}
              <h3 className="font-bold text-lg">{p.name}</h3>
              <p className="text-xs text-white/45 mt-1">{p.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold">{formatINR(p.priceInr)}</span>
                <span className="text-sm text-white/40">/month</span>
              </div>
              <p className="text-xs text-white/45 mt-1.5">
                {p.minutes.toLocaleString("en-IN")} minutes included · then ₹{p.overage}/min
              </p>

              <ul className="mt-6 space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-white/70">
                    <Check className="w-4 h-4 text-[#34D399] shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/auth/register"
                className={`mt-7 w-full text-sm ${p.popular ? "btn-primary" : "btn-secondary"}`}
              >
                Start 7-day free trial
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-sm text-white/40 mt-8">
          Need more than 8,000 minutes or on-prem telephony?{" "}
          <a href="#" className="text-[#A78BFA] hover:underline">Talk to us about Enterprise →</a>
        </p>
      </div>
    </section>
  );
}
