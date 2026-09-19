"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "Is WhatsApp Cloud API officially supported?",
    a: "Yes. Neura Chat connects directly to the official Meta WhatsApp Cloud API — not through a reseller — so the WhatsApp Business Account and the phone number stay yours, registered in your own name with Meta. Following WhatsApp's messaging policy is still what keeps a number in good standing; no platform can promise otherwise.",
  },
  {
    q: "Can I use AI chatbots with my own data?",
    a: "Absolutely. You can upload PDFs, documents, FAQs, and even connect your website URL to train the AI on your specific business data. The chatbot will answer questions using your knowledge base.",
  },
  {
    q: "Is coding knowledge required?",
    a: "No. Neura Chat is entirely no-code. Our visual drag-and-drop workflow builder lets you create complex automations without writing a single line of code.",
  },
  {
    q: "Can I send bulk campaigns to my contacts?",
    a: "Yes. You can broadcast messages to your entire contact list or specific segments. WhatsApp-approved message templates ensure high deliverability and compliance.",
  },
  {
    q: "Can agencies run this for their clients?",
    a: "Each client gets their own workspace, with its own WhatsApp number, contacts, team and billing, and nothing crosses between them. Full white-labelling — your branding on the platform and your own domain — is something we agree case by case rather than sell as a plan; write to us and we will tell you plainly what is and is not possible today.",
  },
  {
    q: "Which AI models are supported?",
    a: "OpenAI, Anthropic and Google. You pick the model that powers your chatbots and AI replies, and you bring your own API key — so you pay the model provider directly, with no markup from us.",
  },
  {
    q: "What integrations are available?",
    a: "We natively integrate with Shopify, WooCommerce, HubSpot, Stripe, Razorpay, Calendly, Google Sheets, Zapier, n8n, Slack, and many more. Our Zapier integration unlocks 6,000+ additional tools.",
  },
  {
    q: "Do I need a card to start?",
    a: "No. Create an account, connect your WhatsApp number and use the product — there is no card on file and nothing is charged automatically. When you are ready to move onto a paid plan we will set it up with you, and you will never be billed without agreeing to it first.",
  },
  {
    q: "Can multiple agents handle the same WhatsApp account?",
    a: "Yes. You can add multiple team members, assign roles, set permissions, assign conversations to specific agents, add internal notes, and track performance — all within one dashboard.",
  },
  {
    q: "Is my data secure?",
    a: "Your WhatsApp access tokens and API keys are encrypted with AES-256-GCM before they are stored, and every request travels over TLS. Each workspace's data is isolated at the database level by row-level security, so one account cannot read another's. Hosting is on Supabase and Vercel, whose own infrastructure carries SOC 2 and ISO 27001 certification; Neura Chat has not yet completed an audit of its own, and we will say so here when it has.",
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
                  <span className="font-semibold text-sm sm:text-base pr-4 group-hover:text-accent-ink transition-colors">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-white/40 flex-shrink-0 transition-transform duration-300 ${
                      open === i ? "rotate-180 text-accent-ink" : ""
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
            Our team is available 24/7 to answer any questions about Neura Chat.
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
