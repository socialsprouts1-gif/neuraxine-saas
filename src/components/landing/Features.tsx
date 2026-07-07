"use client";

import { motion } from "framer-motion";
import {
  Bot,
  Languages,
  PhoneOutgoing,
  MessageSquare,
  BarChart3,
  Plug,
  ShieldCheck,
  Wallet,
  Mic,
} from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "No-code agent builder",
    desc: "Describe your business, pick a voice, paste your FAQs — your calling agent is live in under 10 minutes.",
  },
  {
    icon: Languages,
    title: "12 Indian languages",
    desc: "Hindi, Hinglish, Tamil, Telugu, Marathi, Bengali and more — with natural code-switching mid-sentence.",
  },
  {
    icon: PhoneOutgoing,
    title: "Outbound campaigns",
    desc: "Upload a CSV, set a call window and let the agent dial thousands of numbers with smart retries.",
  },
  {
    icon: Mic,
    title: "Human-like Indian voices",
    desc: "Voices trained on Indian accents that handle interruptions, background noise and 'hello? hello?' gracefully.",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp follow-ups",
    desc: "Automatically send payment links, brochures and booking confirmations on WhatsApp after every call.",
  },
  {
    icon: BarChart3,
    title: "Transcripts & analytics",
    desc: "Every call recorded, transcribed and scored for sentiment, outcome and conversion — in one dashboard.",
  },
  {
    icon: Plug,
    title: "CRM & webhooks",
    desc: "Push call outcomes to Zoho, HubSpot, Google Sheets or any webhook the moment a call ends.",
  },
  {
    icon: ShieldCheck,
    title: "TRAI & RBI compliant",
    desc: "Automatic DND scrubbing, consent logs, calling-hour limits and fair-practice scripts for collections.",
  },
  {
    icon: Wallet,
    title: "₹ wallet billing",
    desc: "Pay-as-you-go minutes with UPI/netbanking recharge and GST invoices. No dollar cards needed.",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <span className="section-badge">Everything you need</span>
          <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight">
            A full call centre, <span className="gradient-text">minus the call centre</span>
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-white/60">
            From dialer to analytics — every piece of voice infrastructure your business needs, in one platform.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
              className="glass-card p-6 hover:border-[#8B5CF6]/40 transition-colors group"
            >
              <div className="w-11 h-11 rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/25 flex items-center justify-center mb-4 group-hover:bg-[#8B5CF6]/25 transition-colors">
                <f.icon className="w-5 h-5 text-[#A78BFA]" />
              </div>
              <h3 className="font-semibold text-base mb-1.5">{f.title}</h3>
              <p className="text-sm text-white/55 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
