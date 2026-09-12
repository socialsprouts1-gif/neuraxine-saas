"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Building2, Star, ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  DEFAULT_TIERS,
  bestYearlySaving,
  hasYearly,
  monthlyEquivalent,
  yearlySavingPercent,
  type PricingTier,
} from "@/lib/pricing";

// The prices come from the `plans` table, loaded once on the page and handed
// down. Only the chrome lives here — icon and colour per position — because
// those are design, not catalogue, and a fourth plan should not need a code
// change to appear.
const CHROME = [
  { icon: Zap, color: "#00FF87" },
  { icon: Star, color: "#00D4FF" },
  { icon: Building2, color: "#A855F7" },
];

/** Whole rupees, grouped Indian-style. Paise are never shown: no plan has any. */
function rupees(paise: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export default function Pricing({
  tiers = DEFAULT_TIERS,
  trialDays = 14,
}: {
  tiers?: PricingTier[];
  trialDays?: number;
}) {
  const [yearly, setYearly] = useState(false);
  const yearlyOffered = hasYearly(tiers);
  const bestSaving = bestYearlySaving(tiers);
  // Nothing to toggle to if no plan is sold yearly.
  const showYearly = yearly && yearlyOffered;

  return (
    <section id="pricing" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-25" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4 mb-12"
        >
          <span className="section-badge">Pricing</span>
          <h2 className="text-4xl md:text-5xl font-bold">
            Simple,{" "}
            <span className="gradient-text-green">transparent pricing</span>
          </h2>
          <p className="text-lg text-white/60 max-w-xl mx-auto">
            Start free for {trialDays} days. No credit card required. Cancel anytime.
          </p>

          {/* Toggle */}
          {yearlyOffered && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <span className={`text-sm font-medium ${!yearly ? "text-white" : "text-white/50"}`}>
                Monthly
              </span>
              <button
                type="button"
                onClick={() => setYearly(!yearly)}
                aria-pressed={yearly}
                aria-label="Show yearly pricing"
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                  yearly ? "bg-accent" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    yearly ? "left-7" : "left-1"
                  }`}
                />
              </button>
              <span
                className={`text-sm font-medium flex items-center gap-2 ${
                  yearly ? "text-white" : "text-white/50"
                }`}
              >
                Yearly
                {bestSaving !== null && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent-ink font-semibold">
                    Save up to {bestSaving}%
                  </span>
                )}
              </span>
            </div>
          )}
        </motion.div>

        {/* Plans */}
        <div
          className={`grid gap-6 mb-12 ${
            tiers.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "lg:grid-cols-3"
          }`}
        >
          {tiers.map((tier, i) => {
            const chrome = CHROME[i % CHROME.length];
            const Icon = chrome.icon;
            const perMonth = showYearly ? monthlyEquivalent(tier) : tier.monthlyCents;
            // A tier sold only yearly has no monthly price to fall back to.
            const price = perMonth ?? tier.monthlyCents ?? tier.yearlyCents;
            const saving = yearlySavingPercent(tier);

            return (
              <motion.div
                key={tier.slug}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`relative glass-card p-7 flex flex-col ${
                  tier.popular ? "border-accent2/40 shadow-[0_0_50px_rgba(0,212,255,0.1)]" : ""
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-4 py-1 rounded-full text-xs font-bold bg-accent2 text-[#050508]">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Header */}
                <div className="mb-6">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{
                      background: `${chrome.color}15`,
                      border: `1px solid ${chrome.color}30`,
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: chrome.color }} />
                  </div>
                  <div className="text-xl font-bold">{tier.name}</div>
                  <div className="text-sm text-white/50 mt-0.5">{tier.tagline}</div>

                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-black" style={{ color: chrome.color }}>
                      {price === null ? "—" : rupees(price, tier.currency)}
                    </span>
                    <span className="text-white/50 mb-1 text-sm">/month</span>
                  </div>

                  {/* Kept at a fixed height so the feature lists below still
                      line up across cards when only some of them save. */}
                  <div className="text-xs mt-1 h-4">
                    {showYearly && tier.yearlyCents !== null ? (
                      <span className="text-white/40">
                        Billed {rupees(tier.yearlyCents, tier.currency)}/year
                        {saving !== null && (
                          <span className="text-accent-ink font-semibold"> · save {saving}%</span>
                        )}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 flex-1 mb-6">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-accent-ink flex-shrink-0" />
                      <span className="text-white/80">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href="/auth/register"
                  className={`flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200 ${
                    tier.popular ? "btn-primary" : "btn-secondary"
                  }`}
                  style={!tier.popular ? { borderColor: `${chrome.color}40`, color: chrome.color } : {}}
                >
                  Start free trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Enterprise CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="glass-card p-8 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div>
            <div className="text-xl font-bold mb-1">Need Enterprise-grade?</div>
            <div className="text-white/60">
              Custom pricing for large teams, dedicated infrastructure, SLA guarantees, and tailored onboarding.
            </div>
          </div>
          <Link href="/auth/register" className="btn-secondary whitespace-nowrap">
            Talk to Sales
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
