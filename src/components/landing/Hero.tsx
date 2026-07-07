"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PhoneCall, Sparkles, IndianRupee, ShieldCheck, Bot } from "lucide-react";

const waveHeights = [14, 26, 38, 52, 40, 60, 46, 30, 44, 58, 36, 22, 34, 48, 28, 16];

export default function Hero() {
  return (
    <section className="relative pt-32 pb-24 overflow-hidden grid-pattern">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#8B5CF6]/20 rounded-full blur-[160px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center relative">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="section-badge">
            <Sparkles className="w-3.5 h-3.5" />
            Built for Indian businesses · TRAI DND compliant
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-6 text-4xl sm:text-6xl font-extrabold leading-tight tracking-tight"
        >
          AI voice agents that <span className="gradient-text">call your customers</span>
          <br className="hidden sm:block" /> in हिन्दी, English & 10+ bhashas
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 max-w-2xl mx-auto text-lg text-white/60"
        >
          Create your own calling agent in minutes — no code, no call centre. It qualifies leads,
          books appointments, reminds about EMIs and answers support calls 24×7. Billed in ₹, made for Bharat.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/auth/register" className="btn-primary text-base !px-7 !py-3.5">
            <Bot className="w-5 h-5" />
            Build your agent free
          </Link>
          <Link href="/auth/login" className="btn-secondary text-base !px-7 !py-3.5">
            <PhoneCall className="w-5 h-5" />
            Get a demo call
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="mt-14 max-w-3xl mx-auto"
        >
          <div className="glass-card p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#22D3EE] flex items-center justify-center">
                    <PhoneCall className="w-4.5 h-4.5 text-white w-4 h-4" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#34D399] border-2 border-[#0B0B14]" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold">Riya · Sales Agent</div>
                  <div className="text-xs text-white/40">Live call · Hinglish · 02:41</div>
                </div>
              </div>
              <span className="tag-green">● Connected</span>
            </div>

            <div className="flex items-end justify-center gap-1.5 h-16 mb-6">
              {waveHeights.map((h, i) => (
                <div
                  key={i}
                  className="wave-bar w-2 bg-gradient-to-t from-[#8B5CF6] to-[#22D3EE]"
                  style={{ height: `${h}px`, animationDelay: `${i * 0.08}s` }}
                />
              ))}
            </div>

            <div className="space-y-3 text-left text-sm">
              <div className="flex gap-3">
                <span className="tag-violet shrink-0">Riya</span>
                <p className="text-white/70">
                  &ldquo;Namaste Rahul ji! Aapne humari website par CRM ke liye enquiry ki thi — kya main 2 minute mein plans bata doon?&rdquo;
                </p>
              </div>
              <div className="flex gap-3">
                <span className="tag-cyan shrink-0">Rahul</span>
                <p className="text-white/70">&ldquo;Haan bataiye, pricing kya hai?&rdquo;</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-white/50"
        >
          <span className="flex items-center gap-2"><IndianRupee className="w-4 h-4 text-[#FF9D3C]" /> Pricing in rupees, UPI recharge</span>
          <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#34D399]" /> TRAI DND scrubbing built-in</span>
          <span className="flex items-center gap-2"><PhoneCall className="w-4 h-4 text-[#22D3EE]" /> Exotel · Plivo · Twilio telephony</span>
        </motion.div>
      </div>
    </section>
  );
}
