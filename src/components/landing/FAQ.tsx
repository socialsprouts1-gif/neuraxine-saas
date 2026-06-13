"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "Do I need Meta Ads Manager experience to use AdPilot AI?",
    a: "No experience needed. AdPilot AI converts natural language prompts into complete Meta ad campaigns. Just describe your goal and we handle the technical setup — objectives, targeting, ad sets, creatives, and publishing.",
  },
  {
    q: "How does the Meta account connection work?",
    a: "AdPilot uses Meta's official Marketing API via our MCP server integration. You authorize AdPilot via OAuth — we get read/write access to your ad accounts, pages, and pixels. Your credentials are encrypted and never shared.",
  },
  {
    q: "Will ads be published without my approval?",
    a: "Never. AdPilot always shows a review screen before publishing. You see the full campaign structure, ad copy, targeting, and budget. You must explicitly click 'Publish to Meta' to launch anything.",
  },
  {
    q: "What does the AI Suggestions feature do?",
    a: "The AI Suggestions engine analyzes your campaign performance and gives actionable recommendations: better targeting, UGC creative ideas, hook copy, budget optimization, retargeting audiences, and landing page or WhatsApp CTA suggestions.",
  },
  {
    q: "Can I manage multiple client accounts as an agency?",
    a: "Yes, the Agency plan (₹7,999/month) supports unlimited ad accounts, white-label reports, and client workspace management. Manage all your clients from one AdPilot dashboard.",
  },
  {
    q: "Does AdPilot check Meta's ad policies?",
    a: "Yes. Before every campaign review, AdPilot runs a policy check against Meta's advertising policies. If potential violations are detected, we flag them and suggest compliant alternatives before you publish.",
  },
  {
    q: "What ad formats and placements are supported?",
    a: "AdPilot supports all major Meta placements: Facebook Feed, Instagram Feed, Instagram Stories, Instagram Reels, Facebook Stories, Messenger, and Audience Network. Ad preview shows how your ad looks on each placement.",
  },
  {
    q: "How does the free trial work?",
    a: "You get full access to all features for 14 days — no credit card required. After the trial, choose the plan that fits your business. You'll never be charged without your consent. All prices in INR, GST extra.",
  },
  {
    q: "Can multiple agents handle the same WhatsApp account?",
    a: "Yes. You can add multiple team members, assign roles, set permissions, assign conversations to specific agents, add internal notes, and track performance — all within one dashboard.",
  },
  {
    q: "Is my data secure?",
    a: "Absolutely. We use enterprise-grade encryption (AES-256 at rest, TLS 1.3 in transit), SOC 2 compliance, GDPR compliance, and store data in ISO 27001-certified data centers.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-28">
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4 mb-14"
        >
          <span className="section-badge">FAQ</span>
          <h2 className="text-4xl md:text-5xl font-bold">
            Common <span className="gradient-text-green">questions</span>
          </h2>
          <p className="text-white/60">
            Everything you need to know before getting started.
          </p>
        </motion.div>

        {/* FAQ items */}
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
            >
              <button
                className="w-full glass-card p-5 text-left hover:border-white/20 transition-all duration-200 group"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-semibold text-sm sm:text-base pr-4 group-hover:text-[#00FF87] transition-colors">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-white/40 flex-shrink-0 transition-transform duration-300 ${
                      open === i ? "rotate-180 text-[#00FF87]" : ""
                    }`}
                  />
                </div>

                <AnimatePresence>
                  {open === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <p className="pt-4 text-sm text-white/60 leading-relaxed border-t border-white/8 mt-4">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </motion.div>
          ))}
        </div>

        {/* Still have questions? */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-12 text-center glass-card p-8"
        >
          <h3 className="text-xl font-bold mb-2">Still have questions?</h3>
          <p className="text-white/60 mb-6 text-sm">
            Our team is available 24/7 to answer any questions about WhatsFlow AI.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a href="#" className="btn-primary text-sm py-2.5 px-5">
              Chat with Support
            </a>
            <a href="#" className="btn-secondary text-sm py-2.5 px-5">
              View Documentation
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
