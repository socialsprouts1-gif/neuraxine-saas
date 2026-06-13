"use client";

import { motion } from "framer-motion";

const integrations = [
  { name: "Meta Ads", icon: "📢", color: "#0668E1" },
  { name: "Facebook Pages", icon: "👍", color: "#1877F2" },
  { name: "Instagram", icon: "📸", color: "#E1306C" },
  { name: "Meta Pixel", icon: "🔍", color: "#0668E1" },
  { name: "WhatsApp Business", icon: "💬", color: "#25D366" },
  { name: "GPT-4o", icon: "🤖", color: "#C6FF00" },
  { name: "Claude AI", icon: "🧠", color: "#A855F7" },
  { name: "Razorpay", icon: "💳", color: "#2D81F7" },
  { name: "Google Analytics", icon: "📊", color: "#F4B400" },
  { name: "Shopify", icon: "🛍️", color: "#96BF48" },
  { name: "Zapier", icon: "⚡", color: "#FF4F00" },
  { name: "Webhooks", icon: "🔗", color: "#C6FF00" },
  { name: "Meta Business Suite", icon: "💼", color: "#0668E1" },
  { name: "Canva", icon: "🎨", color: "#00C4CC" },
  { name: "n8n", icon: "⚙️", color: "#EA4B71" },
  { name: "Slack", icon: "💜", color: "#4A154B" },
];

export default function Integrations() {
  return (
    <section id="integrations" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-[#00FF87]/4 rounded-full blur-[120px]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4 mb-16"
        >
          <span className="section-badge">Integrations</span>
          <h2 className="text-4xl md:text-5xl font-bold">
            Connects with your{" "}
            <span className="gradient-text-green">entire stack</span>
          </h2>
          <p className="text-lg text-white/60 max-w-xl mx-auto">
            Native integrations with the tools you already use. Plus 6,000+ more via Zapier.
          </p>
        </motion.div>

        {/* Integrations grid */}
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
          {integrations.map((intg, i) => (
            <motion.div
              key={intg.name}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              whileHover={{ scale: 1.08, y: -4 }}
              className="glass-card p-3 flex flex-col items-center gap-2 cursor-pointer hover:border-white/25 transition-all duration-200 aspect-square justify-center"
            >
              <span className="text-2xl">{intg.icon}</span>
              <span className="text-[10px] text-white/60 text-center leading-tight font-medium">
                {intg.name}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mt-12"
        >
          <p className="text-white/50 text-sm mb-4">
            Plus 6,000+ more tools via Zapier and our REST API
          </p>
          <a href="#" className="btn-secondary text-sm py-2.5 px-6">
            View All Integrations
          </a>
        </motion.div>
      </div>
    </section>
  );
}
