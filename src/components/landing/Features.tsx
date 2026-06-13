"use client";

import { motion } from "framer-motion";
import { MessageSquare, Target, Eye, Sparkles, BarChart3, Wand2, ShieldCheck, Zap, Brain } from "lucide-react";

const features = [
  {
    icon: Wand2,
    color: "#C6FF00",
    bgColor: "rgba(198,255,0,0.1)",
    borderColor: "rgba(198,255,0,0.2)",
    title: "AI Campaign Builder",
    desc: "Type a natural language prompt and get a complete Meta ad campaign — objective, budget, audience, copy, and CTA — in under 60 seconds.",
    tags: ["GPT-4o", "Natural Language", "Auto-Structure"],
  },
  {
    icon: Target,
    color: "#00D4FF",
    bgColor: "rgba(0,212,255,0.1)",
    borderColor: "rgba(0,212,255,0.2)",
    title: "Meta Ads Integration",
    desc: "Direct MCP integration with Meta Business Suite. Fetch accounts, pages, pixels, and publish campaigns without leaving AdPilot.",
    tags: ["Meta API", "MCP Server", "Real-time"],
  },
  {
    icon: Eye,
    color: "#A855F7",
    bgColor: "rgba(168,85,247,0.1)",
    borderColor: "rgba(168,85,247,0.2)",
    title: "Ad Preview Studio",
    desc: "See exactly how your ads look before launch — Facebook Feed, Instagram Feed, Stories, and Reels previews in real time.",
    tags: ["FB Feed", "IG Stories", "Reels"],
  },
  {
    icon: Sparkles,
    color: "#C6FF00",
    bgColor: "rgba(198,255,0,0.1)",
    borderColor: "rgba(198,255,0,0.2)",
    title: "AI Suggestions Engine",
    desc: "Get smart recommendations for copy variations, UGC hooks, retargeting audiences, budget splits, and creative angles tailored to your business.",
    tags: ["Copy AI", "Targeting Tips", "Budget Reco"],
  },
  {
    icon: BarChart3,
    color: "#F59E0B",
    bgColor: "rgba(245,158,11,0.1)",
    borderColor: "rgba(245,158,11,0.2)",
    title: "Campaign Analytics",
    desc: "Track spend, leads, CTR, CPC, CPM, ROAS, and cost per lead. AI surfaces optimization tips when it detects anomalies.",
    tags: ["ROAS", "CPL", "CTR", "AI Insights"],
  },
  {
    icon: MessageSquare,
    color: "#00FF87",
    bgColor: "rgba(0,255,135,0.1)",
    borderColor: "rgba(0,255,135,0.2)",
    title: "Conversational Interface",
    desc: "Chat with AdPilot like ChatGPT. Pause ads, change budgets, request copy variations, and launch campaigns — all through chat.",
    tags: ["Chat UI", "AI Commands", "Live Control"],
  },
  {
    icon: Brain,
    color: "#00D4FF",
    bgColor: "rgba(0,212,255,0.1)",
    borderColor: "rgba(0,212,255,0.2)",
    title: "Smart Audience Builder",
    desc: "AI suggests custom audiences, lookalikes, retargeting pools from page engagers and WhatsApp contacts — no guesswork.",
    tags: ["Custom Audiences", "Lookalikes", "Retargeting"],
  },
  {
    icon: ShieldCheck,
    color: "#A855F7",
    bgColor: "rgba(168,85,247,0.1)",
    borderColor: "rgba(168,85,247,0.2)",
    title: "Policy Guard",
    desc: "Automatic Meta policy check before publishing. AdPilot flags potential violations and suggests compliant alternatives.",
    tags: ["Policy Check", "Compliance", "Auto-Fix"],
  },
  {
    icon: Zap,
    color: "#C6FF00",
    bgColor: "rgba(198,255,0,0.1)",
    borderColor: "rgba(198,255,0,0.2)",
    title: "One-Click Launch",
    desc: "Review campaign summary, approve with a click. AdPilot handles campaign → ad set → creative → ad creation via Meta API in seconds.",
    tags: ["Instant Launch", "Review Screen", "Meta API"],
  },
];

export default function Features() {
  return (
    <section id="features" className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-mesh-green opacity-40" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#C6FF00]/10 border border-[#C6FF00]/20 text-[#C6FF00] text-sm font-medium mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            Everything you need to win with Meta Ads
          </div>
          <h2 className="text-4xl sm:text-5xl font-black mb-4">
            The AI-native Meta Ads
            <br />
            <span className="gradient-text-green">operating system</span>
          </h2>
          <p className="text-lg text-white/50 max-w-2xl mx-auto">
            From prompt to published campaign in minutes. AdPilot AI handles targeting,
            copy, creatives, budgets, and optimization — you just describe the goal.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="glass-card p-6 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 group"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                style={{ background: f.bgColor, border: `1px solid ${f.borderColor}` }}
              >
                <f.icon className="w-5 h-5" style={{ color: f.color }} />
              </div>
              <h3 className="font-bold text-base mb-2">{f.title}</h3>
              <p className="text-sm text-white/50 leading-relaxed mb-4">{f.desc}</p>
              <div className="flex flex-wrap gap-1.5">
                {f.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: f.bgColor, color: f.color, border: `1px solid ${f.borderColor}` }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
