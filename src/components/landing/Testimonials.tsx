"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    quote:
      "Humne 4 telecallers ki jagah ek Neuraxine agent lagaya. Lead response time 4 ghante se 4 minute ho gaya — demo bookings 3x badh gayi.",
    name: "Nikhil Sharma",
    role: "Founder, SharmaTech Solutions · Mumbai",
    initials: "NS",
  },
  {
    quote:
      "Our EMI reminder calls are now fully RBI-compliant and never miss the calling window. Collections improved 22% in the first quarter itself.",
    name: "Ritu Malhotra",
    role: "COO, FinServe NBFC · Delhi",
    initials: "RM",
  },
  {
    quote:
      "Marathi-speaking receptionist that never takes a lunch break! Patients book appointments at 11 PM and the clinic calendar just fills up.",
    name: "Dr. Anish Mehta",
    role: "Mehta Dental Clinic · Pune",
    initials: "AM",
  },
];

export default function Testimonials() {
  return (
    <section className="py-24 bg-[#0B0B14]/60 border-y border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <span className="section-badge">Loved across India</span>
          <h2 className="mt-5 text-3xl sm:text-5xl font-extrabold tracking-tight">
            From Mumbai to <span className="gradient-text">Madurai</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="glass-card p-6 flex flex-col"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star key={s} className="w-4 h-4 fill-[#FBBF24] text-[#FBBF24]" />
                ))}
              </div>
              <p className="text-sm text-white/70 leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8B5CF6]/40 to-[#22D3EE]/30 flex items-center justify-center text-xs font-bold">
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-white/40">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
