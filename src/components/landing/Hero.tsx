"use client";

import { motion } from "framer-motion";
import { DEFAULT_HERO, type HeroContent } from "@/lib/site-content";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Bot, Send, Database, Clock, BarChart3 } from "lucide-react";
import { WhatsAppGlyph } from "./BrandGlyphs";
import HeroShowcase from "./HeroShowcase";
import { demoTarget, demoHint } from "@/lib/book-demo";
import { ctaForTrial } from "@/lib/site-content";
import { DEFAULT_TRIAL_DAYS } from "@/lib/trial";

// Icon and tint are layout, not copy, so they stay here and pair with the
// editable pills by position — the same arrangement the floating cards
// used. A sixth pill would have no chrome to sit in, so the list is capped
// at what exists rather than rendering a chip with a blank tile in it.
const pillChrome = [
  { icon: Bot, tint: "#7C3AED" },
  { icon: Send, tint: "#4F46E5" },
  { icon: Database, tint: "#C026D3" },
  { icon: Clock, tint: "#2563EB" },
  { icon: BarChart3, tint: "#9333EA" },
];

export default function Hero({
  trialDays = DEFAULT_TRIAL_DAYS,
  content = DEFAULT_HERO,
  demoUrl = "",
  whatsappNumber = "",
}: {
  trialDays?: number;
  content?: HeroContent;
  /** A Calendly or other booking page. Empty falls back to WhatsApp. */
  demoUrl?: string;
  whatsappNumber?: string;
}) {
  const demo = demoTarget({ demoUrl, whatsappNumber });

  const pills = content.pills
    .slice(0, pillChrome.length)
    .map((label, i) => ({ label, ...pillChrome[i] }));

  // The number in the default button follows the trial length that is

  // actually configured; wording somebody typed themselves is untouched.

  const cta = ctaForTrial(content.primaryCta, trialDays);


  return (
    <section className="relative overflow-hidden pt-28 pb-16 lg:pt-32 lg:pb-24">
      {/* A soft violet bloom behind the handset, and a warm one behind the
          headline. The cards are white on a near-white page: without
          something brighter behind them their shadows have nothing to sit
          against and they flatten into the background. */}
      <div className="absolute top-[-6rem] right-[-8rem] w-[780px] h-[680px] rounded-full bg-[#A78BFA]/18 blur-[130px] pointer-events-none" />
      <div className="absolute top-[4rem] left-[-10rem] w-[560px] h-[520px] rounded-full bg-[#FDBA74]/16 blur-[130px] pointer-events-none" />

      <div className="relative max-w-[1400px] mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-2 xl:grid-cols-[minmax(0,500px)_minmax(0,1fr)] gap-14 lg:gap-8 items-center">
          {/* ---------------------------------------------------------- */}
          <div className="space-y-7 max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="section-badge normal-case sm:uppercase">
                <span className="w-6 h-6 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
                  <WhatsAppGlyph className="w-3.5 h-3.5 text-[#FFFFFF]" />
                </span>
                {content.badge}
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="text-[2.75rem] sm:text-6xl xl:text-[4.25rem] font-black leading-[1.03] tracking-[-0.035em]"
            >
              {content.headline}{" "}
              <span className="gradient-text-green">{content.headlineAccent}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16 }}
              className="text-[17px] sm:text-lg text-white/55 leading-relaxed max-w-lg"
            >
              {content.subheadline}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24 }}
              className="flex flex-wrap gap-3.5 pt-1"
            >
              <Link
                href={cta.href}
                data-track="hero:primary"
                className="btn-primary text-[15px] group"
              >
                <WhatsAppGlyph className="w-[18px] h-[18px]" />
                {cta.label}
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              {/* Booking, not a video. Opens the configured booking page
                  when there is one, and WhatsApp when there is not —
                  which for a WhatsApp automation product is not a
                  second-best, it is the demo. */}
              {demo.kind !== "none" && (
                <a
                  href={demo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-[15px]"
                  title={demoHint(demo)}
                >
                  <span className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center shrink-0">
                    {demo.kind === "booking" ? (
                      <CalendarCheck className="w-[15px] h-[15px]" />
                    ) : (
                      <WhatsAppGlyph className="w-[15px] h-[15px]" />
                    )}
                  </span>
                  {content.secondaryCta.label}
                </a>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.32 }}
              className="flex flex-wrap gap-2.5 pt-2"
            >
              {pills.map((pill) => {
                const Icon = pill.icon;
                return (
                  <span
                    key={pill.label}
                    className="flex items-center gap-2.5 rounded-2xl bg-[#FFFFFF] pl-2 pr-4 py-2 border border-[rgba(23,18,38,0.06)] shadow-[0_1px_2px_rgba(23,18,38,0.04),0_6px_18px_rgba(23,18,38,0.05)] text-[13.5px] font-semibold"
                  >
                    <span
                      className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${pill.tint}18` }}
                    >
                      <Icon className="w-[15px] h-[15px]" style={{ color: pill.tint }} strokeWidth={2.2} />
                    </span>
                    {pill.label}
                  </span>
                );
              })}
            </motion.div>

            {/* A customer count and a star rating are claims a buyer can
                check, so they stay switched off until they are true. */}
            {content.showSocialProof && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="flex items-center gap-4 pt-2"
              >
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span
                      key={i}
                      className="w-9 h-9 rounded-full border-2 border-[#FFFFFF] bg-gradient-to-br from-[#7C3AED] to-[#C026D3] text-[#FFFFFF] flex items-center justify-center text-xs font-bold"
                    >
                      {String.fromCharCode(64 + i)}
                    </span>
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span key={s} className="text-[#F59E0B] text-sm">
                        ★
                      </span>
                    ))}
                    <span className="text-sm font-semibold ml-1">{content.rating}</span>
                  </div>
                  <p className="text-xs text-white/50">{content.socialProofText}</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* ---------------------------------------------------------- */}
          <HeroShowcase />
        </div>
      </div>
    </section>
  );
}
