"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Heart,
  GraduationCap,
  Home,
  Building2,
  Users,
  Briefcase,
  Stethoscope,
} from "lucide-react";

const useCases = [
  {
    id: "ecommerce",
    icon: ShoppingCart,
    label: "Ecommerce",
    color: "#00FF87",
    title: "Automate Your Entire Store on WhatsApp",
    desc: "Send order confirmations, abandoned cart recovery messages, delivery updates, and product recommendations automatically.",
    metrics: [
      { value: "45%", label: "Cart Recovery Rate" },
      { value: "3x", label: "Repeat Purchases" },
      { value: "90%", label: "Support Automated" },
    ],
    flows: ["Order Confirmation", "Abandoned Cart", "Delivery Tracking", "Review Requests", "Upsell Campaigns"],
  },
  {
    id: "coaching",
    icon: GraduationCap,
    label: "Coaches",
    color: "#00D4FF",
    title: "Scale Your Coaching Business 10x",
    desc: "Automate lead qualification, free session bookings, follow-up sequences, and course delivery through WhatsApp.",
    metrics: [
      { value: "10x", label: "Lead Capacity" },
      { value: "80%", label: "Show-up Rate" },
      { value: "60%", label: "Booking Automation" },
    ],
    flows: ["Lead Qualification", "Free Session Booking", "Course Drip", "Payment Follow-up", "Community Onboarding"],
  },
  {
    id: "healthcare",
    icon: Stethoscope,
    label: "Healthcare",
    color: "#A855F7",
    title: "Streamline Patient Communication",
    desc: "Appointment reminders, post-visit follow-ups, prescription reminders, and patient support — fully automated.",
    metrics: [
      { value: "70%", label: "No-Show Reduction" },
      { value: "95%", label: "Reminder Delivery" },
      { value: "50%", label: "Admin Time Saved" },
    ],
    flows: ["Appointment Reminders", "Prescription Alerts", "Follow-up Care", "Lab Results", "Health Tips"],
  },
  {
    id: "realestate",
    icon: Home,
    label: "Real Estate",
    color: "#F59E0B",
    title: "Convert More Property Leads",
    desc: "AI qualifies buyer/seller leads, schedules viewings, sends property matches, and nurtures prospects to close.",
    metrics: [
      { value: "35%", label: "More Viewings" },
      { value: "4x", label: "Lead Response Speed" },
      { value: "55%", label: "Lead Qualification" },
    ],
    flows: ["Lead Qualification", "Property Matches", "Viewing Scheduling", "Price Updates", "Contract Follow-up"],
  },
  {
    id: "agencies",
    icon: Building2,
    label: "Agencies",
    color: "#EC4899",
    title: "Manage All Clients on One Platform",
    desc: "White-label Neura Chat for your clients. Create separate workspaces, manage billing, and scale your agency revenue.",
    metrics: [
      { value: "Unlimited", label: "Client Workspaces" },
      { value: "100%", label: "White-labeled" },
      { value: "5x", label: "Agency Revenue" },
    ],
    flows: ["Client Workspaces", "White Label", "Reseller Billing", "API Access", "Team Management"],
  },
  {
    id: "education",
    icon: GraduationCap,
    label: "Education",
    color: "#00FF87",
    title: "Keep Students Engaged & Informed",
    desc: "Admission follow-ups, class reminders, assignment notifications, and parent communication — automated via WhatsApp.",
    metrics: [
      { value: "85%", label: "Enrollment Rate" },
      { value: "90%", label: "Parent Engagement" },
      { value: "40%", label: "Admin Time Saved" },
    ],
    flows: ["Admission Follow-up", "Class Reminders", "Fee Reminders", "Results Notification", "Parent Updates"],
  },
];

export default function UseCases() {
  const [active, setActive] = useState(useCases[0]);

  return (
    <section id="use-cases" className="relative py-28">
      <div className="absolute inset-0 grid-pattern opacity-20" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center space-y-4 mb-14"
        >
          <span className="section-badge">Use Cases</span>
          <h2 className="text-4xl md:text-5xl font-bold">
            Built for every{" "}
            <span className="gradient-text-green">industry</span>
          </h2>
          <p className="text-lg text-white/60 max-w-xl mx-auto">
            Neura Chat adapts to your business type with pre-built flows and industry-specific templates.
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {useCases.map((uc) => (
            <motion.button
              key={uc.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActive(uc)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active.id === uc.id
                  ? "border"
                  : "bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/8"
              }`}
              style={
                active.id === uc.id
                  ? {
                      background: `${uc.color}15`,
                      color: uc.color,
                      borderColor: `${uc.color}40`,
                      boxShadow: `0 0 20px ${uc.color}20`,
                    }
                  : {}
              }
            >
              <uc.icon className="w-4 h-4" />
              {uc.label}
            </motion.button>
          ))}
        </div>

        {/* Active content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
            className="grid lg:grid-cols-2 gap-10 items-center"
          >
            {/* Left */}
            <div className="space-y-6">
              <h3 className="text-3xl font-bold">{active.title}</h3>
              <p className="text-white/60 leading-relaxed">{active.desc}</p>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-4">
                {active.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="glass-card p-4 text-center"
                    style={{ borderColor: `${active.color}20` }}
                  >
                    <div
                      className="text-2xl font-black mb-1"
                      style={{ color: active.color }}
                    >
                      {m.value}
                    </div>
                    <div className="text-xs text-white/50">{m.label}</div>
                  </div>
                ))}
              </div>

              <a href="/auth/register" className="btn-primary inline-flex">
                Start Free Trial
              </a>
            </div>

            {/* Right — flows */}
            <div className="glass-card p-6 space-y-3">
              <div className="text-sm text-white/50 mb-4 font-medium uppercase tracking-wider">
                Pre-built Automation Flows
              </div>
              {active.flows.map((flow, i) => (
                <motion.div
                  key={flow}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-black text-xs"
                    style={{ background: `${active.color}15`, color: active.color, border: `1px solid ${active.color}25` }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-sm font-medium group-hover:text-white transition-colors">
                    {flow}
                  </span>
                  <div className="ml-auto">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: `${active.color}10`, color: active.color }}
                    >
                      Ready
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
