"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Zap, Building2, Star, ArrowRight, Rocket } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Starter",
    icon: Zap,
    color: "#C6FF00",
    monthly: 999,
    yearly: 799,
    tagline: "Perfect for small businesses",
    popular: false,
    features: [
      { text: "1 Meta Ad Account", included: true },
      { text: "5 Active Campaigns", included: true },
      { text: "AI Campaign Builder", included: true },
      { text: "Ad Preview Studio", included: true },
      { text: "Basic Analytics", included: true },
      { text: "AI Suggestions (10/month)", included: true },
      { text: "Email Support", included: true },
      { text: "Custom Audiences", included: false },
      { text: "A/B Testing", included: false },
      { text: "White Label Reports", included: false },
      { text: "API Access", included: false },
      { text: "Priority Support", included: false },
    ],
  },
  {
    name: "Growth",
    icon: Rocket,
    color: "#C6FF00",
    monthly: 2999,
    yearly: 2399,
    tagline: "For growing brands & freelancers",
    popular: true,
    features: [
      { text: "3 Meta Ad Accounts", included: true },
      { text: "Unlimited Campaigns", included: true },
      { text: "AI Campaign Builder", included: true },
      { text: "Ad Preview Studio", included: true },
      { text: "Advanced Analytics + ROAS", included: true },
      { text: "Unlimited AI Suggestions", included: true },
      { text: "Custom Audiences + Lookalikes", included: true },
      { text: "A/B Testing", included: true },
      { text: "WhatsApp CTA Integration", included: true },
      { text: "White Label Reports", included: false },
      { text: "API Access", included: false },
      { text: "Priority Support", included: true },
    ],
  },
  {
    name: "Agency",
    icon: Building2,
    color: "#A855F7",
    monthly: 7999,
    yearly: 6399,
    tagline: "For agencies managing multiple clients",
    popular: false,
    features: [
      { text: "Unlimited Ad Accounts", included: true },
      { text: "Unlimited Campaigns", included: true },
      { text: "AI Campaign Builder", included: true },
      { text: "Ad Preview Studio", included: true },
      { text: "Full Analytics Suite", included: true },
      { text: "Unlimited AI Suggestions", included: true },
      { text: "Custom Audiences + Lookalikes", included: true },
      { text: "Advanced A/B Testing", included: true },
      { text: "WhatsApp CTA Integration", included: true },
      { text: "White Label Reports", included: true },
      { text: "Full API Access", included: true },
      { text: "Dedicated Account Manager", included: true },
    ],
  },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="pricing" className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-mesh-green opacity-30" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C6FF00]/10 border border-[#C6FF00]/20 text-[#C6FF00] text-sm font-medium mb-6">
            <Star className="w-3.5 h-3.5" />
            Simple, transparent pricing
          </div>
          <h2 className="text-4xl sm:text-5xl font-black mb-4">
            Plans for every
            <span className="gradient-text-green"> stage of growth</span>
          </h2>
          <p className="text-white/50 mb-8">
            All plans include 14-day free trial. No credit card required.
          </p>

          {/* Toggle */}
          <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setYearly(false)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                !yearly ? "bg-white/10 text-white" : "text-white/50"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                yearly ? "bg-white/10 text-white" : "text-white/50"
              }`}
            >
              Yearly
              <span className="ml-2 text-[10px] bg-[#C6FF00]/20 text-[#C6FF00] px-2 py-0.5 rounded-full">Save 20%</span>
            </button>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative glass-card p-7 flex flex-col ${
                plan.popular
                  ? "border-[#C6FF00]/40 shadow-[0_0_60px_rgba(198,255,0,0.12)] scale-[1.02]"
                  : "hover:border-white/20"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#C6FF00] text-[#050508] text-xs font-black">
                  MOST POPULAR
                </div>
              )}

              <div className="mb-6">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4`}
                  style={{ background: `${plan.color}15`, border: `1px solid ${plan.color}25` }}>
                  <plan.icon className="w-5 h-5" style={{ color: plan.color }} />
                </div>
                <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                <p className="text-sm text-white/50">{plan.tagline}</p>
              </div>

              <div className="mb-7">
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-black">₹{yearly ? plan.yearly : plan.monthly}</span>
                  <span className="text-white/40 mb-1">/month</span>
                </div>
                {yearly && (
                  <div className="text-xs text-[#C6FF00] mt-1">
                    Save ₹{(plan.monthly - plan.yearly) * 12}/year
                  </div>
                )}
              </div>

              <div className="space-y-3 flex-1 mb-7">
                {plan.features.map((f) => (
                  <div key={f.text} className="flex items-center gap-2.5 text-sm">
                    {f.included ? (
                      <Check className="w-4 h-4 text-[#C6FF00] flex-shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-white/20 flex-shrink-0" />
                    )}
                    <span className={f.included ? "text-white/80" : "text-white/30"}>{f.text}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/auth/register"
                className={`flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-bold transition-all ${
                  plan.popular
                    ? "bg-[#C6FF00] text-[#050508] hover:bg-[#b8f000] shadow-[0_0_30px_rgba(198,255,0,0.3)]"
                    : "border border-white/15 text-white hover:bg-white/5"
                }`}
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-sm text-white/40 mt-8"
        >
          All prices in INR · GST extra · Cancel anytime · 14-day money-back guarantee
        </motion.p>
      </div>
    </section>
  );
}
