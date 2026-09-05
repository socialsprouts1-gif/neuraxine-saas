"use client";

import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Priya Sharma",
    role: "Founder, StyleHouse India",
    avatar: "P",
    color: "#00FF87",
    rating: 5,
    text: "Neura Chat transformed our Shopify store's customer service. We automated 90% of support queries and recovered 3x more abandoned carts. Revenue jumped 42% in the first month.",
    metric: "+42% Revenue",
  },
  {
    name: "David Chen",
    role: "Digital Marketing Agency, Singapore",
    avatar: "D",
    color: "#00D4FF",
    rating: 5,
    text: "As an agency, the white-label feature is gold. We onboarded 12 new clients in one month, each with their own branded WhatsApp automation. The ROI is incredible.",
    metric: "12 New Clients",
  },
  {
    name: "Marcus Johnson",
    role: "Life Coach, Austin TX",
    avatar: "M",
    color: "#A855F7",
    rating: 5,
    text: "My discovery call bookings tripled after setting up the AI qualification bot. It handles 200+ conversations daily and only sends me the truly hot leads. Game changer.",
    metric: "3x Bookings",
  },
  {
    name: "Aisha Okafor",
    role: "Real Estate Broker, Lagos",
    avatar: "A",
    color: "#F59E0B",
    rating: 5,
    text: "We close deals faster now. The AI qualifies buyers, sends property matches, and schedules viewings automatically. Our team focuses on closing, not chasing leads.",
    metric: "35% More Closings",
  },
  {
    name: "Carlos Rivera",
    role: "Restaurant Chain Owner, Mexico",
    avatar: "C",
    color: "#EC4899",
    rating: 5,
    text: "Neura Chat handles reservations, menu inquiries, and order updates across 8 locations. Response time went from 4 hours to 3 seconds. Customer satisfaction is at 98%.",
    metric: "98% CSAT Score",
  },
  {
    name: "Sophie Laurent",
    role: "E-Learning Platform, Paris",
    avatar: "S",
    color: "#00FF87",
    rating: 5,
    text: "Student enrollment automation saved us 60% in marketing costs. The drip sequences keep learners engaged and the completion rate improved dramatically.",
    metric: "60% Cost Savings",
  },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="relative py-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0A0A14]/40 to-transparent" />
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-accent/4 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-accent2/4 rounded-full blur-[100px]" />

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
            <span className="gradient-text-green">love Neura Chat</span>
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
