"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Zap, Building2, Star, ArrowRight } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Starter",
    icon: Zap,
    color: "#00FF87",
    monthly: 29,
    yearly: 19,
    tagline: "Perfect for small businesses",
    popular: false,
    features: [
      { text: "1 WhatsApp Number", included: true },
      { text: "1,000 Messages/month", included: true },
      { text: "AI Chatbot (GPT-4 powered)", included: true },
      { text: "3 Automation Workflows", included: true },
      { text: "Basic CRM (500 contacts)", included: true },
      { text: "Campaign Broadcasts", included: true },
      { text: "Analytics Dashboard", included: true },
      { text: "Email Support", included: true },
      { text: "Bulk Campaigns", included: false },
      { text: "White Label", included: false },
      { text: "API Access", included: false },
      { text: "Multi-Agent Support", included: false },
    ],
    cta: "Start Free Trial",
  },
  {
    name: "Growth",
    icon: Star,
    color: "#00D4FF",
    monthly: 79,
    yearly: 59,
    tagline: "For growing businesses",
    popular: true,
    features: [
      { text: "3 WhatsApp Numbers", included: true },
      { text: "10,000 Messages/month", included: true },
      { text: "AI Chatbot (All Models)", included: true },
      { text: "Unlimited Workflows", included: true },
      { text: "Full CRM (10K contacts)", included: true },
      { text: "Bulk Campaigns + Scheduling", included: true },
      { text: "Advanced Analytics", included: true },
      { text: "Priority Support", included: true },
      { text: "AI Content Generator", included: true },
      { text: "Appointment Booking", included: true },
      { text: "White Label", included: false },
      { text: "API Access", included: false },
    ],
    cta: "Start Free Trial",
  },
  {
    name: "Agency",
    icon: Building2,
    color: "#A855F7",
    monthly: 199,
    yearly: 149,
    tagline: "For agencies & teams",
    popular: false,
    features: [
      { text: "Unlimited WhatsApp Numbers", included: true },
      { text: "Unlimited Messages", included: true },
      { text: "All AI Models Included", included: true },
      { text: "Unlimited Workflows", included: true },
      { text: "Unlimited CRM Contacts", included: true },
      { text: "Advanced Campaigns + A/B Test", included: true },
      { text: "White Label Platform", included: true },
      { text: "API Access + Webhooks", included: true },
      { text: "Multi-Agent (20 seats)", included: true },
      { text: "Client Workspaces", included: true },
      { text: "Custom Domain", included: true },
      { text: "Dedicated Account Manager", included: true },
    ],
    cta: "Start Free Trial",
  },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);

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
            Start free for 14 days. No credit card required. Cancel anytime.
          </p>

          {/* Toggle */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <span className={`text-sm font-medium ${!yearly ? "text-white" : "text-white/50"}`}>Monthly</span>
            <button
              onClick={() => setYearly(!yearly)}
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
            <span className={`text-sm font-medium flex items-center gap-2 ${yearly ? "text-white" : "text-white/50"}`}>
              Yearly
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent-ink font-semibold">
                Save 30%
              </span>
            </span>
          </div>
        </motion.div>

        {/* Plans */}
        <div className="grid lg:grid-cols-3 gap-6 mb-12">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`relative glass-card p-7 flex flex-col ${
                plan.popular ? "border-accent2/40 shadow-[0_0_50px_rgba(0,212,255,0.1)]" : ""
              }`}
            >
              {plan.popular && (
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
                  style={{ background: `${plan.color}15`, border: `1px solid ${plan.color}30` }}
                >
                  <plan.icon className="w-5 h-5" style={{ color: plan.color }} />
                </div>
                <div className="text-xl font-bold">{plan.name}</div>
                <div className="text-sm text-white/50 mt-0.5">{plan.tagline}</div>

                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-black" style={{ color: plan.color }}>
                    ${yearly ? plan.yearly : plan.monthly}
                  </span>
                  <span className="text-white/50 mb-1 text-sm">/month</span>
                </div>
                {yearly && (
                  <div className="text-xs text-white/40 mt-1">
                    Billed ${(plan.yearly * 12).toLocaleString()}/year
                  </div>
                )}
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex items-center gap-2.5 text-sm">
                    {f.included ? (
                      <Check className="w-4 h-4 text-accent-ink flex-shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-white/20 flex-shrink-0" />
                    )}
                    <span className={f.included ? "text-white/80" : "text-white/30"}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href="/auth/register"
                className={`flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200 ${
                  plan.popular
                    ? "btn-primary"
                    : "btn-secondary"
                }`}
                style={
                  !plan.popular
                    ? { borderColor: `${plan.color}40`, color: plan.color }
                    : {}
                }
              >
                {plan.cta}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          ))}
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
          <a
            href="#"
            className="btn-secondary whitespace-nowrap"
          >
            Talk to Sales
          </a>
        </motion.div>
      </div>
    </section>
  );
}
