"use client";

// The right-hand half of the hero: the handset, and the numbers floating
// around it.
//
// The cards are what turn a screenshot into a claim. The phone says "this
// runs inside WhatsApp"; the cards say "and here is what it did today".
// They sit at three different distances from the page — different shadow
// depths, different float delays — because a row of cards all at the same
// height reads as a table someone has rotated.
//
// Below xl they come out from around the phone and sit under it in a row.
// Hanging off negative offsets on a laptop put half of each card past the
// edge of the screen, with the numbers cut mid-digit.

import { motion } from "framer-motion";
import { Users, ShoppingCart, IndianRupee } from "lucide-react";
import PhoneMockup from "./PhoneMockup";

const METRICS = [
  {
    label: "Leads Captured",
    value: "+1,248 today",
    icon: Users,
    tint: "#4F46E5",
    delay: 0.5,
    float: "float-mid",
  },
  {
    label: "Orders Placed",
    value: "+892 today",
    icon: ShoppingCart,
    tint: "#7C3AED",
    delay: 0.65,
    float: "float-fast",
  },
  {
    label: "Revenue Generated",
    value: "+₹24,300 today",
    icon: IndianRupee,
    tint: "#C026D3",
    delay: 0.8,
    float: "float-slow",
  },
];

function MetricCard({ metric }: { metric: (typeof METRICS)[number] }) {
  const Icon = metric.icon;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#FFFFFF] pl-3 pr-5 py-3 border border-[rgba(23,18,38,0.06)] shadow-[0_1px_2px_rgba(23,18,38,0.05),0_14px_34px_rgba(23,18,38,0.09)] min-w-[204px]">
      <span
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${metric.tint}1A` }}
      >
        <Icon className="w-[18px] h-[18px]" style={{ color: metric.tint }} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold leading-tight">{metric.label}</span>
        <span className="block text-xs text-white/50 leading-tight mt-0.5">{metric.value}</span>
      </span>
    </div>
  );
}

/**
 * Conversations, with the shape of the last few weeks under the number.
 *
 * The figure is set in proportional digits, not tabular: tabular widths
 * exist so a column of numbers lines up, and at this size they leave a
 * visible gap after the 1. Nothing is lining up with this.
 */
function ConversationsCard() {
  return (
    <div className="rounded-2xl bg-[#FFFFFF] px-5 py-4 border border-[rgba(23,18,38,0.06)] shadow-[0_1px_2px_rgba(23,18,38,0.05),0_18px_40px_rgba(23,18,38,0.10)] w-[214px]">
      <p className="text-[13px] text-white/55 font-medium">Total Conversations</p>
      <p className="text-[32px] font-extrabold leading-none tracking-tight mt-1.5">12,482</p>
      <p className="flex items-center gap-1 text-[13px] font-semibold text-[#15803D] mt-1.5">
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor" aria-hidden="true">
          <path d="M6 1.5 10.5 8H1.5z" />
        </svg>
        +42%
      </p>

      <svg viewBox="0 0 180 54" className="w-full h-[54px] mt-2.5 overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="convFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 46 L22 42 L44 44 L66 33 L88 36 L110 24 L132 27 L154 12 L180 4 L180 54 L0 54 Z"
          fill="url(#convFill)"
        />
        <path
          d="M0 46 L22 42 L44 44 L66 33 L88 36 L110 24 L132 27 L154 12 L180 4"
          fill="none"
          stroke="#22C55E"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The last point, marked. A sparkline without it makes the reader
            hunt for where "now" is. */}
        <circle cx="180" cy="4" r="4" fill="#22C55E" stroke="#FFFFFF" strokeWidth="2.4" />
      </svg>
    </div>
  );
}

export default function HeroShowcase() {
  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex justify-center xl:justify-end xl:pr-[252px]"
      >
        <PhoneMockup />

        {/* Around the handset, from xl up. */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="hidden xl:block absolute left-0 top-[148px] z-10 float-mid"
        >
          <ConversationsCard />
        </motion.div>

        <div className="hidden xl:flex absolute right-0 top-[132px] flex-col gap-4 z-10">
          {METRICS.map((metric) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: metric.delay }}
              className={metric.float}
            >
              <MetricCard metric={metric} />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Below xl the same facts sit under the handset, in normal flow.
          Floated onto negative offsets they ran off the side of a laptop. */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="xl:hidden mt-10 flex flex-wrap items-start justify-center gap-3"
      >
        <ConversationsCard />
        <div className="flex flex-col gap-3">
          {METRICS.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
