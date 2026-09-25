"use client";

import { motion } from "framer-motion";
import {
  Bot,
  GitBranch,
  Megaphone,
  Users,
  Brain,
  BarChart3,
  ShoppingCart,
  Wand2,
  Plug,
  Globe,
  Mic,
  Calendar,
} from "lucide-react";

const features = [
  {
    icon: Bot,
    color: "#00FF87",
    bgColor: "rgba(0,255,135,0.1)",
    borderColor: "rgba(0,255,135,0.2)",
    title: "AI Chatbot Builder",
    desc: "Train AI chatbots on your business data — FAQs, products, policies. Deploy multilingual bots with human handoff in minutes.",
    tags: ["GPT-4", "Claude", "Gemini"],
  },
  {
    icon: GitBranch,
    color: "#00D4FF",
    bgColor: "rgba(0,212,255,0.1)",
    borderColor: "rgba(0,212,255,0.2)",
    title: "Visual Workflow Builder",
    desc: "Drag-and-drop automation builder. Create follow-up sequences, abandoned cart recovery, and onboarding flows without code.",
    tags: ["No-Code", "Zapier-like", "n8n"],
  },
  {
    icon: Megaphone,
    color: "#A855F7",
    bgColor: "rgba(168,85,247,0.1)",
    borderColor: "rgba(168,85,247,0.2)",
    title: "Bulk Campaigns",
    desc: "Broadcast personalized messages to thousands. Schedule campaigns, segment audiences, track opens and conversions.",
    tags: ["Broadcast", "Scheduling", "Templates"],
  },
  {
    icon: Users,
    color: "#F59E0B",
    bgColor: "rgba(245,158,11,0.1)",
    borderColor: "rgba(245,158,11,0.2)",
    title: "Built-in CRM",
    desc: "Full lead pipeline with tags, notes, scores, and stages. AI predicts conversion probability for every lead.",
    tags: ["Pipeline", "Lead Scoring", "AI Insights"],
  },
  {
    icon: Brain,
    color: "#EC4899",
    bgColor: "rgba(236,72,153,0.1)",
    borderColor: "rgba(236,72,153,0.2)",
    title: "AI Sales Assistant",
    desc: "AI qualifies leads, recommends replies, summarizes conversations, and detects purchase intent in real time.",
    tags: ["Intent Detection", "Reply AI", "Summaries"],
  },
  {
    icon: BarChart3,
    color: "#00D4FF",
    bgColor: "rgba(0,212,255,0.1)",
    borderColor: "rgba(0,212,255,0.2)",
    title: "Analytics Dashboard",
    desc: "Real-time insights on response rates, conversion, revenue, campaign performance, and chatbot effectiveness.",
    tags: ["Real-time", "Revenue", "Funnels"],
  },
  {
    icon: ShoppingCart,
    color: "#00FF87",
    bgColor: "rgba(0,255,135,0.1)",
    borderColor: "rgba(0,255,135,0.2)",
    title: "WhatsApp Commerce",
    desc: "Product catalogs, order tracking, payment links, automated invoices, and COD support directly in WhatsApp.",
    tags: ["Shopify", "WooCommerce", "Payments"],
  },
  {
    icon: Wand2,
    color: "#A855F7",
    bgColor: "rgba(168,85,247,0.1)",
    borderColor: "rgba(168,85,247,0.2)",
    title: "AI Content Generator",
    desc: "Generate marketing messages, sales copy, follow-up scripts, and campaign hooks with AI — tailored to your brand.",
    tags: ["Copywriting", "Templates", "Brand Voice"],
  },
  {
    icon: Plug,
    color: "#F59E0B",
    bgColor: "rgba(245,158,11,0.1)",
    borderColor: "rgba(245,158,11,0.2)",
    title: "Powerful Integrations",
    desc: "Connect to Shopify, HubSpot, Stripe, Calendly, Google Sheets, Zapier, Slack, and WhatsApp Cloud API natively.",
    tags: ["Zapier", "Stripe", "HubSpot"],
  },
  {
    icon: Globe,
    color: "#00D4FF",
    bgColor: "rgba(0,212,255,0.1)",
    borderColor: "rgba(0,212,255,0.2)",
    title: "White Label",
    desc: "Agencies can white-label the entire platform — custom domains, branding, client workspaces, and reseller billing.",
    tags: ["Agencies", "Custom Domain", "Resell"],
  },
  {
    icon: Mic,
    color: "#EC4899",
    bgColor: "rgba(236,72,153,0.1)",
    borderColor: "rgba(236,72,153,0.2)",
    title: "AI Voice Agent",
    desc: "Understand voice notes, respond with text-to-speech, and handle multilingual voice conversations automatically.",
    tags: ["STT", "TTS", "Multilingual"],
  },
  {
    icon: Calendar,
    color: "#00FF87",
    bgColor: "rgba(0,255,135,0.1)",
    borderColor: "rgba(0,255,135,0.2)",
    title: "Appointment Booking",
    desc: "Let AI schedule, confirm, and remind clients of appointments. Integrated with Calendly and Google Calendar.",
    tags: ["Calendly", "Reminders", "AI Scheduling"],
  },
];

export default function Features() {
  return (
    <section id="features" className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 dot-pattern opacity-30" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4 mb-16"
        >
          <span className="section-badge">Platform Features</span>
          <h2 className="text-4xl md:text-5xl font-bold">
            Everything you need to{" "}
            <span className="gradient-text-green">automate growth</span>
          </h2>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            From AI chatbots to full CRM pipelines — Neura Chat is the complete
            WhatsApp automation stack for modern businesses.
          </p>
        </motion.div>

        {/* Features grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat, i) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group relative glass-card p-6 hover:border-white/20 transition-all duration-300 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)] cursor-pointer"
            >
              {/* Hover glow */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: `radial-gradient(ellipse at top left, ${feat.bgColor}, transparent 60%)`,
                }}
              />

              <div className="relative">
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: feat.bgColor, border: `1px solid ${feat.borderColor}` }}
                >
                  <feat.icon className="w-6 h-6" style={{ color: feat.color }} />
                </div>

                {/* Title & desc */}
                <h3 className="text-lg font-semibold mb-2 group-hover:text-white transition-colors">
                  {feat.title}
                </h3>
                <p className="text-sm text-white/55 leading-relaxed mb-4">{feat.desc}</p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5">
                  {feat.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md text-xs font-medium border"
                      style={{
                        background: feat.bgColor,
                        color: feat.color,
                        borderColor: feat.borderColor,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
