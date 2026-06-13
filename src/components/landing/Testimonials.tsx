"use client";

import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Priya Sharma",
    role: "Gym Owner, Pune",
    avatar: "P",
    color: "#C6FF00",
    rating: 5,
    text: "AdPilot AI is insane. I described my gym campaign in one line and it built the entire thing — targeting, copy, budget, everything. ₹47 cost per lead, 32 leads in the first week. I've never had results like this.",
    metric: "₹47 CPL",
  },
  {
    name: "Rahul Mehta",
    role: "Digital Marketing Agency, Mumbai",
    avatar: "R",
    color: "#00D4FF",
    rating: 5,
    text: "As an agency managing 15 clients, AdPilot saves me 3 hours per campaign. The AI builder generates what would take me 30 minutes in just 60 seconds. My clients see 4-6x ROAS consistently.",
    metric: "4-6x ROAS",
  },
  {
    name: "Sunita Joshi",
    role: "Dental Clinic Owner, Bangalore",
    avatar: "S",
    color: "#A855F7",
    rating: 5,
    text: "I was paying a marketing agency ₹25,000/month for Meta ads. Now I use AdPilot at ₹2,999 and get better results. The AI suggestions alone saved me ₹8,000 in wasted spend last month.",
    metric: "₹8K Saved",
  },
  {
    name: "Arjun Reddy",
    role: "Real Estate Developer, Hyderabad",
    avatar: "A",
    color: "#F59E0B",
    rating: 5,
    text: "₹320 cost per qualified property lead. That's unheard of in real estate Meta advertising. AdPilot's targeting suggestions (income-based, location pincode) are incredibly precise.",
    metric: "₹320 per Lead",
  },
  {
    name: "Kavita Nair",
    role: "Restaurant Owner, Bandra",
    avatar: "K",
    color: "#00FF87",
    rating: 5,
    text: "Set up a weekend dinner promotion campaign in 3 minutes — wrote one sentence, AdPilot built the entire ad. We were fully booked that Saturday. The ad preview feature is chef's kiss.",
    metric: "Fully Booked",
  },
  {
    name: "Vikram Singh",
    role: "EdTech Founder, Delhi",
    avatar: "V",
    color: "#C6FF00",
    rating: 5,
    text: "Running 8 campaigns simultaneously for our courses. The AI score feature instantly shows which campaigns need attention. Avg CPL dropped from ₹380 to ₹140 in 2 weeks.",
    metric: "CPL ₹380→₹140",
  },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="relative py-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0A0A14]/40 to-transparent" />
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#00FF87]/4 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#00D4FF]/4 rounded-full blur-[100px]" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4 mb-16"
        >
          <span className="section-badge">Testimonials</span>
          <h2 className="text-4xl md:text-5xl font-bold">
            Businesses{" "}
            <span className="gradient-text-green">love AdPilot AI</span>
          </h2>
          <p className="text-lg text-white/60 max-w-xl mx-auto">
            Real results from real businesses. Join 50,000+ companies automating their growth.
          </p>
        </motion.div>

        {/* Reviews grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="glass-card p-6 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 relative group"
            >
              {/* Quote icon */}
              <Quote
                className="absolute top-4 right-4 w-8 h-8 opacity-5 group-hover:opacity-10 transition-opacity"
                style={{ color: t.color }}
              />

              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.rating }).map((_, s) => (
                  <Star key={s} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>

              {/* Text */}
              <p className="text-sm text-white/70 leading-relaxed mb-6">"{t.text}"</p>

              {/* Metric badge */}
              <div
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold mb-4"
                style={{ background: `${t.color}15`, color: t.color, border: `1px solid ${t.color}30` }}
              >
                {t.metric}
              </div>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-white/8">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                  style={{ background: `${t.color}20`, color: t.color, border: `1px solid ${t.color}30` }}
                >
                  {t.avatar}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-white/50">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Social proof bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 flex flex-wrap justify-center items-center gap-8 py-8 border-t border-white/8"
        >
          {[
            { value: "50K+", label: "Active Businesses" },
            { value: "4.9/5", label: "Average Rating" },
            { value: "2.4B+", label: "Messages Sent" },
            { value: "140+", label: "Countries" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-black gradient-text-green">{s.value}</div>
              <div className="text-sm text-white/50">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
