"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dumbbell, Heart, GraduationCap, Home, Building2, Stethoscope, ShoppingBag, Utensils,
} from "lucide-react";

const useCases = [
  {
    id: "gym",
    icon: Dumbbell,
    label: "Gyms & Fitness",
    color: "#C6FF00",
    headline: "Fill your gym with quality leads",
    desc: "Hyperlocal campaigns targeting fitness enthusiasts within 5km. WhatsApp CTA for instant inquiries. UGC testimonial ads that build trust.",
    prompt: "Create a lead gen campaign for my gym in Pune with ₹500/day targeting people interested in fitness aged 22-40",
    result: {
      objective: "Lead Generation",
      audience: "Fitness, Gym, Health — 22-40 — Pune 5km",
      budget: "₹500/day",
      cta: "Message on WhatsApp",
      expectedCPL: "₹150-250",
    },
    tags: ["Local targeting", "WhatsApp leads", "UGC creatives"],
  },
  {
    id: "clinic",
    icon: Stethoscope,
    label: "Clinics & Doctors",
    color: "#00D4FF",
    headline: "Get patients, not just clicks",
    desc: "Reach patients actively looking for healthcare. Compliant ad copy. Location-based targeting for your clinic catchment area.",
    prompt: "Target people looking for dental services in Mumbai aged 25-55 with appointment booking CTA",
    result: {
      objective: "Lead Generation",
      audience: "Dental care, Healthcare — 25-55 — Mumbai 10km",
      budget: "₹800/day",
      cta: "Book Appointment",
      expectedCPL: "₹200-400",
    },
    tags: ["Healthcare compliant", "Appointment leads", "Local reach"],
  },
  {
    id: "ecommerce",
    icon: ShoppingBag,
    label: "E-Commerce",
    color: "#A855F7",
    headline: "Drive sales with dynamic ads",
    desc: "Catalog ads, dynamic retargeting, lookalike audiences from buyers. Full-funnel campaigns from awareness to conversion.",
    prompt: "Run a conversion campaign for my clothing store targeting fashion-interested women 18-35, ₹2000/day",
    result: {
      objective: "Conversions",
      audience: "Fashion, Shopping — Women 18-35 — India",
      budget: "₹2000/day",
      cta: "Shop Now",
      expectedCPL: "₹80-150",
    },
    tags: ["Catalog ads", "Dynamic retargeting", "ROAS focused"],
  },
  {
    id: "restaurant",
    icon: Utensils,
    label: "Restaurants",
    color: "#F59E0B",
    headline: "Fill tables and boost orders",
    desc: "Geo-fenced ads within 3km. Food photography creatives. Drive reservations and online orders via WhatsApp or website.",
    prompt: "Promote my restaurant in Bandra for weekend dinner bookings with ₹300/day",
    result: {
      objective: "Brand Awareness + Traffic",
      audience: "Food lovers — All ages — Bandra 3km",
      budget: "₹300/day",
      cta: "Reserve Table",
      expectedCPL: "₹40-80",
    },
    tags: ["Geo-fenced", "Food creatives", "Reservation CTA"],
  },
  {
    id: "realestate",
    icon: Home,
    label: "Real Estate",
    color: "#00FF87",
    headline: "Generate qualified property leads",
    desc: "Target high-income earners in specific pincodes. Showcase properties with carousel ads. Capture leads via WhatsApp or phone CTA.",
    prompt: "Generate leads for 2BHK apartments in Wakad, Pune for buyers aged 28-50 with ₹3000/day",
    result: {
      objective: "Lead Generation",
      audience: "Property buyers — 28-50 — Wakad, Pune",
      budget: "₹3000/day",
      cta: "Call Now / WhatsApp",
      expectedCPL: "₹300-800",
    },
    tags: ["Carousel ads", "High-intent targeting", "WhatsApp + Call"],
  },
  {
    id: "education",
    icon: GraduationCap,
    label: "Education",
    color: "#C6FF00",
    headline: "Enroll students for your courses",
    desc: "Target students and parents by age group, interest, and location. Drive applications and demo registrations at low cost.",
    prompt: "Create a lead gen campaign for my online coding bootcamp for students 18-28, India-wide, ₹1000/day",
    result: {
      objective: "Lead Generation",
      audience: "Students, Tech interested — 18-28 — India",
      budget: "₹1000/day",
      cta: "Apply Now",
      expectedCPL: "₹100-200",
    },
    tags: ["Student targeting", "Demo registrations", "India-wide"],
  },
];

export default function UseCases() {
  const [active, setActive] = useState("gym");
  const current = useCases.find((u) => u.id === active)!;

  return (
    <section id="use-cases" className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-mesh-green opacity-30" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
          <h2 className="text-4xl sm:text-5xl font-black mb-4">
            Built for every <span className="gradient-text-green">business type</span>
          </h2>
          <p className="text-white/50">AdPilot AI knows what works for your industry.</p>
        </motion.div>

        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {useCases.map((u) => (
            <button key={u.id} onClick={() => setActive(u.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${active === u.id ? "bg-[#C6FF00]/15 text-[#C6FF00] border border-[#C6FF00]/25" : "bg-white/5 border border-white/10 text-white/60 hover:text-white"}`}>
              <u.icon className="w-4 h-4" style={{ color: active === u.id ? "#C6FF00" : undefined }} />
              {u.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }}
            className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-4" style={{ background: `${current.color}15`, color: current.color, border: `1px solid ${current.color}25` }}>
                <current.icon className="w-4 h-4" />{current.label}
              </div>
              <h3 className="text-3xl font-black mb-3">{current.headline}</h3>
              <p className="text-white/60 leading-relaxed mb-5">{current.desc}</p>
              <div className="flex flex-wrap gap-2 mb-6">
                {current.tags.map((t) => (
                  <span key={t} className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">{t}</span>
                ))}
              </div>
              <div className="glass-card p-4 border-[#C6FF00]/15 bg-[#C6FF00]/3">
                <div className="text-[10px] text-[#C6FF00] font-semibold mb-2 flex items-center gap-1">
                  <span>💬</span> Example Prompt
                </div>
                <p className="text-sm text-white/70 italic">"{current.prompt}"</p>
              </div>
            </div>

            <div className="glass-card p-6 border-[#C6FF00]/15">
              <div className="text-xs font-semibold text-[#C6FF00] mb-4 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#C6FF00] animate-pulse" /> Generated Campaign Preview
              </div>
              <div className="space-y-3">
                {Object.entries(current.result).map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0">
                    <span className="text-xs text-white/40 capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                    <span className="text-xs font-medium text-white/80 text-right">{v}</span>
                  </div>
                ))}
              </div>
              <button className="mt-4 w-full py-2.5 rounded-xl bg-[#C6FF00] text-[#050508] text-sm font-bold">
                Try This Campaign →
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
