"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import BrandLogo from "@/components/ui/BrandLogo";

// Every tile here was an emoji — 💬 for WhatsApp, 🛍️ for Shopify, 🧠 for
// Claude. Emoji render differently on every operating system, carry none
// of the brand's colour, and read as a placeholder somebody meant to come
// back to. The dashboard already draws these marks properly, so this uses
// the same component rather than a second set that can drift from it.
const integrations = [
  { name: "WhatsApp", slug: "whatsapp", color: "#25D366", note: "Cloud API" },
  { name: "Meta", slug: "meta", color: "#0668E1", note: "Business Platform" },
  { name: "Claude", slug: "anthropic", color: "#D97757", note: "AI replies" },
  { name: "OpenAI", slug: "openai", color: "#10A37F", note: "AI replies" },
  { name: "Gemini", slug: "google", color: "#4285F4", note: "AI replies" },
  { name: "Shopify", slug: "shopify", color: "#95BF47", note: "Catalogue & orders" },
  { name: "WooCommerce", slug: "woocommerce", color: "#7F54B3", note: "Catalogue & orders" },
  { name: "Razorpay", slug: "razorpay", color: "#3395FF", note: "Payments" },
  { name: "Stripe", slug: "stripe", color: "#635BFF", note: "Payments" },
  { name: "Shiprocket", slug: "shiprocket", color: "#E94B3C", note: "Shipping" },
  { name: "Google Sheets", slug: "google-sheets", color: "#0F9D58", note: "Contacts" },
  { name: "HubSpot", slug: "hubspot", color: "#FF7A59", note: "CRM sync" },
  { name: "Salesforce", slug: "salesforce", color: "#00A1E0", note: "CRM sync" },
  { name: "Calendly", slug: "calendly", color: "#006BFF", note: "Bookings" },
  { name: "Zapier", slug: "zapier", color: "#FF4F00", note: "6,000+ apps" },
  { name: "n8n", slug: "n8n", color: "#EA4B71", note: "Self-hosted flows" },
  { name: "Twilio", slug: "twilio", color: "#F22F46", note: "SMS fallback" },
  { name: "Webhooks", slug: "webhooks", color: "#7C3AED", note: "Anything else" },
];

export default function Integrations() {
  return (
    <section id="integrations" className="relative py-24 lg:py-28 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[760px] h-[440px] bg-accent/6 rounded-full blur-[130px] pointer-events-none" />

      <div className="relative max-w-[1400px] mx-auto px-5 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4 mb-14"
        >
          <span className="section-badge">Integrations</span>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            Connects with your <span className="gradient-text-green">entire stack</span>
          </h2>
          <p className="text-lg text-white/60 max-w-xl mx-auto">
            Native integrations with the tools you already use. Plus 6,000+ more via Zapier.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {integrations.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: Math.min(i, 11) * 0.035 }}
              whileHover={{ y: -4 }}
              className="glass-card p-5 flex flex-col items-center text-center gap-3 shadow-[0_1px_2px_rgba(23,18,38,0.04),0_10px_26px_rgba(23,18,38,0.06)] hover:shadow-[0_2px_4px_rgba(23,18,38,0.05),0_18px_40px_rgba(23,18,38,0.10)] transition-shadow duration-200"
            >
              <BrandLogo slug={item.slug} brand={item.color} size={46} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{item.name}</span>
                {/* What it actually does for you. A wall of logos answers
                    "is my stack here"; this answers "and for what". */}
                <span className="block text-xs text-white/50 leading-tight mt-1">{item.note}</span>
              </span>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="text-center mt-12"
        >
          <p className="text-white/55 text-sm mb-5">
            Plus 6,000+ more tools via Zapier, and a REST API for everything else.
          </p>
          <Link href="/auth/register" className="btn-secondary text-sm py-2.5 px-6">
            Start connecting
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
