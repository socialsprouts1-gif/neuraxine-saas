"use client";

// The comparison table.
//
// A grid rather than a <table>: the first column has to stay put while
// the rest scrolls sideways on a phone, and sticky positioning inside a
// table cell is the one place browsers still disagree.
//
// NeuraChat's column is built from the live plan rows, so it can never
// quote a price the pricing section does not charge. The competitors come
// from src/lib/comparison.ts, which carries the date they were last
// checked — and that date is printed under the table, because a claim
// about a named company with no date on it is one nobody can check.

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import {
  ROWS,
  COMPETITORS,
  ownColumn,
  ownPrices,
  CHECKED_ON,
  type Cell,
} from "@/lib/comparison";
import type { PricingTier } from "@/lib/pricing";

const COLUMN = "minmax(150px, 1fr)";

function CellMark({ value, own }: { value: Cell | undefined; own: boolean }) {
  if (value === true) {
    return (
      <Check
        className={`w-[18px] h-[18px] mx-auto ${own ? "text-accent-ink" : "text-[#16A34A]"}`}
        strokeWidth={3}
      />
    );
  }

  if (value === false) {
    // A dash, not a red cross. Six columns of red crosses is a chart that
    // reads as an attack, and the reader discounts the whole thing.
    return <Minus className="w-[18px] h-[18px] mx-auto text-white/25" strokeWidth={2.5} />;
  }

  if (!value) return <span className="text-white/25 text-xs">Not stated</span>;

  return (
    <span className={`text-[13.5px] ${own ? "font-semibold" : "text-white/70"}`}>{value}</span>
  );
}

export default function Comparison({
  tiers,
  trialDays,
}: {
  tiers: PricingTier[];
  trialDays: number;
}) {
  const own = ownColumn(ownPrices(tiers, trialDays));
  const columns = `minmax(190px, 1.25fr) minmax(165px, 1.1fr) repeat(${COMPETITORS.length}, ${COLUMN})`;

  return (
    <section id="compare" className="relative py-24 lg:py-28 overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[420px] bg-accent/6 rounded-full blur-[130px] pointer-events-none" />

      <div className="relative max-w-[1400px] mx-auto px-5 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4 mb-10"
        >
          <span className="section-badge">Compare</span>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            How NeuraChat <span className="gradient-text-green">compares</span>
          </h2>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            The same features, side by side, at the prices each provider publishes.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="rounded-3xl border border-[rgba(23,18,38,0.07)] bg-[#FFFFFF] shadow-[0_1px_2px_rgba(23,18,38,0.04),0_18px_44px_rgba(23,18,38,0.08)] overflow-hidden"
        >
          {/* The scroller. Only this scrolls, so the heading above and the
              note below stay where they are on a phone. */}
          <div className="overflow-x-auto">
            <div className="min-w-[1050px]">
              {/* Header */}
              <div
                className="grid items-stretch border-b border-[rgba(23,18,38,0.07)]"
                style={{ gridTemplateColumns: columns }}
              >
                <div className="sticky left-0 z-10 bg-[#FFFFFF] px-5 py-4 text-sm font-semibold text-white/45">
                  Feature
                </div>

                <div className="px-4 py-4 bg-accent/8 border-x border-accent/20 text-center">
                  <span className="inline-flex items-center gap-1.5 text-[15px] font-extrabold text-accent-ink">
                    NeuraChat
                  </span>
                  <span className="block text-[11px] text-white/45 mt-0.5">That&rsquo;s us</span>
                </div>

                {COMPETITORS.map((provider) => (
                  <div key={provider.id} className="px-4 py-4 text-center">
                    <span
                      className="inline-block px-3 py-1 rounded-lg text-[14px] font-bold"
                      style={{ background: `${provider.tint}14`, color: provider.tint }}
                    >
                      {provider.name}
                    </span>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {ROWS.map((row, index) => (
                <div
                  key={row.label}
                  className={`grid items-center ${
                    index % 2 === 1 ? "bg-[rgba(23,18,38,0.015)]" : ""
                  } ${index < ROWS.length - 1 ? "border-b border-[rgba(23,18,38,0.05)]" : ""}`}
                  style={{ gridTemplateColumns: columns }}
                >
                  <div
                    className={`sticky left-0 z-10 px-5 py-3.5 text-[14px] font-medium ${
                      index % 2 === 1 ? "bg-[#FCFBFD]" : "bg-[#FFFFFF]"
                    }`}
                  >
                    {row.label}
                  </div>

                  <div className="px-4 py-3.5 text-center bg-accent/6 border-x border-accent/20">
                    <CellMark value={own[row.label]} own />
                  </div>

                  {COMPETITORS.map((provider) => (
                    <div key={provider.id} className="px-4 py-3.5 text-center">
                      <CellMark value={row.values[provider.id]} own={false} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
        >
          {/* Dated and sourced, because every cell to the right of ours is
              a claim about somebody else's business. */}
          <p className="text-xs text-white/40 leading-relaxed max-w-2xl">
            Other providers&rsquo; prices and features are taken from their own public pricing
            pages and were last checked on{" "}
            <span className="text-white/60">
              {new Date(CHECKED_ON).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            . They change them without notice — check before you decide. Message rates are Meta&rsquo;s
            and vary by country and category.
          </p>

          <Link href="/#pricing" className="btn-primary text-sm shrink-0">
            See our plans
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
