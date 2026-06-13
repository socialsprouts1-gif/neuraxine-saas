"use client";

import { motion } from "framer-motion";
import { CreditCard, Check, X, Zap, Rocket, Building2, ArrowRight, Star, Shield } from "lucide-react";
import { useState } from "react";
import Header from "@/components/dashboard/Header";

const plans = [
  {
    name: "Starter", icon: Zap, color: "#C6FF00", monthly: 999, yearly: 799,
    tagline: "Perfect for small businesses", current: false,
    features: ["1 Meta Ad Account", "5 Active Campaigns", "AI Campaign Builder", "Ad Preview Studio", "Basic Analytics", "AI Suggestions (10/month)", "Email Support"],
    missing: ["Custom Audiences", "A/B Testing", "White Label Reports", "API Access"],
  },
  {
    name: "Growth", icon: Rocket, color: "#C6FF00", monthly: 2999, yearly: 2399,
    tagline: "For growing brands & freelancers", current: true,
    features: ["3 Meta Ad Accounts", "Unlimited Campaigns", "AI Campaign Builder", "Ad Preview Studio", "Advanced Analytics + ROAS", "Unlimited AI Suggestions", "Custom Audiences + Lookalikes", "A/B Testing", "WhatsApp CTA Integration", "Priority Support"],
    missing: ["White Label Reports", "API Access"],
  },
  {
    name: "Agency", icon: Building2, color: "#A855F7", monthly: 7999, yearly: 6399,
    tagline: "For agencies managing multiple clients", current: false,
    features: ["Unlimited Ad Accounts", "Unlimited Campaigns", "Full AI Suite", "Advanced A/B Testing", "White Label Reports", "Full API Access", "Dedicated Account Manager"],
    missing: [],
  },
];

const invoices = [
  { date: "Jun 1, 2026", amount: "₹2,999", status: "Paid", plan: "Growth Monthly" },
  { date: "May 1, 2026", amount: "₹2,999", status: "Paid", plan: "Growth Monthly" },
  { date: "Apr 1, 2026", amount: "₹2,999", status: "Paid", plan: "Growth Monthly" },
  { date: "Mar 1, 2026", amount: "₹999", status: "Paid", plan: "Starter Monthly" },
];

export default function BillingPage() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Billing & Plans" subtitle="Manage your AdPilot AI subscription" />

      <div className="p-6 space-y-8">
        {/* Current plan */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 border-[#C6FF00]/20 bg-[#C6FF00]/3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#C6FF00]/15 border border-[#C6FF00]/25 flex items-center justify-center">
                <Rocket className="w-6 h-6 text-[#C6FF00]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-lg">Growth Plan</h2>
                  <span className="text-[10px] bg-[#C6FF00]/15 text-[#C6FF00] px-2 py-0.5 rounded-full font-semibold">CURRENT</span>
                </div>
                <p className="text-sm text-white/50">₹2,999/month · Renews Jul 1, 2026</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-black text-[#C6FF00]">₹2,999</div>
                <div className="text-xs text-white/40">per month</div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-white/8 grid grid-cols-3 gap-4 text-center">
            {[["3", "Ad Accounts"], ["∞", "Campaigns"], ["10", "Days Left"]].map(([val, label]) => (
              <div key={label}>
                <div className="text-xl font-black text-[#C6FF00]">{val}</div>
                <div className="text-xs text-white/40">{label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Billing toggle */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Change Plan</h2>
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-1">
              <button onClick={() => setYearly(false)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${!yearly ? "bg-white/10 text-white" : "text-white/50"}`}>Monthly</button>
              <button onClick={() => setYearly(true)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${yearly ? "bg-white/10 text-white" : "text-white/50"}`}>
                Yearly <span className="ml-1 text-[10px] bg-[#C6FF00]/20 text-[#C6FF00] px-1.5 py-0.5 rounded-full">-20%</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {plans.map((plan, i) => (
              <motion.div key={plan.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                className={`glass-card p-6 flex flex-col ${plan.current ? "border-[#C6FF00]/35 shadow-[0_0_40px_rgba(198,255,0,0.08)]" : "hover:border-white/20"}`}>
                {plan.current && (
                  <div className="text-[10px] bg-[#C6FF00] text-[#050508] px-2 py-0.5 rounded-full font-black w-fit mb-3">CURRENT PLAN</div>
                )}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${plan.color}15`, border: `1px solid ${plan.color}25` }}>
                  <plan.icon className="w-4 h-4" style={{ color: plan.color }} />
                </div>
                <h3 className="font-bold mb-1">{plan.name}</h3>
                <p className="text-xs text-white/50 mb-4">{plan.tagline}</p>
                <div className="mb-5">
                  <span className="text-3xl font-black">₹{yearly ? plan.yearly : plan.monthly}</span>
                  <span className="text-white/40 text-sm">/mo</span>
                </div>
                <div className="space-y-2 flex-1 mb-5">
                  {plan.features.slice(0, 5).map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs text-white/70">
                      <Check className="w-3.5 h-3.5 text-[#C6FF00] flex-shrink-0" />{f}
                    </div>
                  ))}
                  {plan.features.length > 5 && <div className="text-xs text-white/40">+{plan.features.length - 5} more features</div>}
                </div>
                {plan.current ? (
                  <div className="py-2.5 text-center text-sm text-[#C6FF00] border border-[#C6FF00]/25 rounded-xl">Current Plan</div>
                ) : (
                  <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-all">
                    {plan.monthly > 2999 ? "Upgrade" : "Downgrade"} <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Payment method */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4 text-[#C6FF00]" /> Payment Method
          </h3>
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/3 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 bg-gradient-to-r from-blue-600 to-purple-600 rounded-md flex items-center justify-center">
                <span className="text-white text-[8px] font-bold">VISA</span>
              </div>
              <div>
                <div className="text-sm font-medium">•••• •••• •••• 4242</div>
                <div className="text-xs text-white/40">Expires 12/27</div>
              </div>
            </div>
            <button className="text-xs text-[#C6FF00] hover:underline">Update</button>
          </div>
        </motion.div>

        {/* Invoice history */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass-card p-5">
          <h3 className="font-semibold mb-4">Invoice History</h3>
          <div className="space-y-2">
            {invoices.map((inv, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
                <div>
                  <div className="text-sm font-medium">{inv.plan}</div>
                  <div className="text-xs text-white/40">{inv.date}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold">{inv.amount}</span>
                  <span className="text-[10px] bg-[#C6FF00]/15 text-[#C6FF00] px-2 py-0.5 rounded-full">{inv.status}</span>
                  <button className="text-xs text-white/40 hover:text-white transition-colors">PDF</button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* GST note */}
        <p className="text-xs text-white/30 text-center flex items-center justify-center gap-2">
          <Shield className="w-3.5 h-3.5" />
          All prices in INR · GST @18% extra · Secure payments via Razorpay · Cancel anytime
        </p>
      </div>
    </div>
  );
}
