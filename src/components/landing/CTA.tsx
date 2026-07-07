"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Bot, PhoneCall } from "lucide-react";

export default function CTA() {
  return (
    <section className="py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="glass-card !rounded-3xl p-10 sm:p-16 text-center relative overflow-hidden animate-glow-pulse"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#8B5CF6]/15 via-transparent to-[#22D3EE]/10 pointer-events-none" />
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight relative">
            Your first AI call is <span className="gradient-text">10 minutes away</span>
          </h2>
          <p className="mt-4 text-white/60 max-w-lg mx-auto relative">
            Create an agent, hear it speak, and call your own number — free. No credit card, no sales call (unless our agent makes it 😉).
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 relative">
            <Link href="/auth/register" className="btn-primary text-base !px-7 !py-3.5">
              <Bot className="w-5 h-5" /> Build your agent free
            </Link>
            <Link href="/auth/login" className="btn-secondary text-base !px-7 !py-3.5">
              <PhoneCall className="w-5 h-5" /> Sign in to dashboard
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
