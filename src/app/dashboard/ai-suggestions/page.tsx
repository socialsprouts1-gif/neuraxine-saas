"use client";

import { motion } from "framer-motion";
import {
  Sparkles, Target, DollarSign, Users, Film, MessageSquare,
  TrendingUp, RefreshCw, ThumbsUp, ThumbsDown, Zap, ArrowRight,
  Copy, CheckCircle, Lightbulb, BarChart3,
} from "lucide-react";
import { useState } from "react";
import Header from "@/components/dashboard/Header";

type Suggestion = {
  id: number;
  category: string;
  categoryColor: string;
  icon: React.ElementType;
  title: string;
  description: string;
  impact: "High" | "Medium" | "Low";
  effort: string;
  actionLabel: string;
  tags: string[];
};

const suggestions: Suggestion[] = [
  {
    id: 1, category: "Creative", categoryColor: "#C6FF00", icon: Film,
    title: "Use UGC testimonial video for 2x better CTR",
    description: "User-generated content videos showing real customer results perform 2-3x better than studio ads for local fitness businesses. Ask your members to record 30-second transformation stories.",
    impact: "High", effort: "Medium", actionLabel: "Generate UGC Script",
    tags: ["Video", "UGC", "Trust"],
  },
  {
    id: 2, category: "Targeting", categoryColor: "#00D4FF", icon: Target,
    title: "Target gym-interested people within 5km radius",
    description: "For local service businesses, hyperlocal targeting (3-5km) reduces wasted impressions significantly. Your current 15km radius is too broad — you're paying to show ads to people who won't commute.",
    impact: "High", effort: "Low", actionLabel: "Update Targeting",
    tags: ["Local", "Radius", "Efficiency"],
  },
  {
    id: 3, category: "Retargeting", categoryColor: "#A855F7", icon: RefreshCw,
    title: "Create retargeting campaign for page engagers",
    description: "People who liked, commented, or messaged your Facebook Page in the last 30 days are 5x more likely to convert. Create a custom audience from page engagement and retarget with a special offer.",
    impact: "High", effort: "Low", actionLabel: "Create Retargeting",
    tags: ["Custom Audience", "Warm Traffic", "Conversion"],
  },
  {
    id: 4, category: "CTA", categoryColor: "#F59E0B", icon: MessageSquare,
    title: "Use WhatsApp CTA for local service business",
    description: "For gyms, salons, clinics, and restaurants — WhatsApp CTA generates 40% lower cost per lead compared to website CTAs. People trust messaging over form fills for local services.",
    impact: "High", effort: "Low", actionLabel: "Switch to WhatsApp CTA",
    tags: ["WhatsApp", "Lead Gen", "Local"],
  },
  {
    id: 5, category: "Budget", categoryColor: "#00FF87", icon: DollarSign,
    title: "Increase retargeting budget — it has 6.4x ROAS",
    description: "Your retargeting campaign is your best performer at 6.4x ROAS. Allocating 30% more budget here could generate ₹15,000+ additional revenue this month based on current CPL trends.",
    impact: "High", effort: "Low", actionLabel: "Optimize Budget",
    tags: ["ROAS", "Budget", "Scaling"],
  },
  {
    id: 6, category: "Copy", categoryColor: "#C6FF00", icon: Lightbulb,
    title: "A/B test urgency vs. social proof headlines",
    description: "Try testing \"Limited Slots — Join Now\" (urgency) against \"500+ Members Trust Us\" (social proof). Social proof typically wins for fitness businesses. Run 3-day test with equal budget split.",
    impact: "Medium", effort: "Low", actionLabel: "Generate Copy Variants",
    tags: ["A/B Test", "Headlines", "Copy"],
  },
  {
    id: 7, category: "Audience", categoryColor: "#00D4FF", icon: Users,
    title: "Build lookalike from top 20 converted leads",
    description: "Upload your best customer list (20+ contacts) to Meta and create a 1% lookalike audience. This consistently outperforms interest-based targeting for service businesses.",
    impact: "High", effort: "Medium", actionLabel: "Build Lookalike",
    tags: ["Lookalike", "Custom Audience", "Scale"],
  },
  {
    id: 8, category: "Creative", categoryColor: "#A855F7", icon: Film,
    title: "Add hook text overlay on first 3 seconds of video",
    description: "\"Are you spending ₹5,000/month on gym fees with ZERO results?\" — Scroll-stopping hooks in the first 3 seconds increase video watch rate by 60%. Add text overlay on your video creatives.",
    impact: "Medium", effort: "Medium", actionLabel: "Generate Hook Ideas",
    tags: ["Video Hook", "Scroll Stop", "Engagement"],
  },
];

const categoryFilters = ["All", "Creative", "Targeting", "Budget", "Copy", "Retargeting", "CTA", "Audience"];

export default function AISuggestionsPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [applied, setApplied] = useState<number[]>([]);
  const [dismissed, setDismissed] = useState<number[]>([]);

  const filtered = suggestions.filter(
    (s) => !dismissed.includes(s.id) && (activeFilter === "All" || s.category === activeFilter)
  );

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="AI Suggestions" subtitle="Smart recommendations to improve your Meta ad performance" />

      <div className="p-6 space-y-6">
        {/* Score overview */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "High Impact", count: suggestions.filter((s) => s.impact === "High").length, color: "#C6FF00", icon: TrendingUp },
            { label: "Quick Wins", count: suggestions.filter((s) => s.effort === "Low").length, color: "#00D4FF", icon: Zap },
            { label: "Creative Tips", count: suggestions.filter((s) => s.category === "Creative").length, color: "#A855F7", icon: Sparkles },
          ].map((item, i) => (
            <motion.div key={item.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="glass-card p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${item.color}15`, border: `1px solid ${item.color}25` }}>
                <item.icon className="w-5 h-5" style={{ color: item.color }} />
              </div>
              <div>
                <div className="text-2xl font-black" style={{ color: item.color }}>{item.count}</div>
                <div className="text-xs text-white/50">{item.label}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Category filters */}
        <div className="flex gap-2 flex-wrap">
          {categoryFilters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${
                activeFilter === f
                  ? "bg-[#C6FF00]/15 text-[#C6FF00] border border-[#C6FF00]/25"
                  : "bg-white/5 border border-white/10 text-white/50 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Suggestions grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`glass-card p-5 transition-all ${applied.includes(s.id) ? "border-[#C6FF00]/30 bg-[#C6FF00]/3" : "hover:border-white/20"}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: `${s.categoryColor}15`, border: `1px solid ${s.categoryColor}25` }}>
                    <s.icon className="w-4 h-4" style={{ color: s.categoryColor }} />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${s.categoryColor}15`, color: s.categoryColor }}>
                      {s.category}
                    </span>
                    <h3 className="text-sm font-semibold mt-1.5 leading-snug">{s.title}</h3>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 font-semibold ${
                  s.impact === "High" ? "bg-[#C6FF00]/15 text-[#C6FF00]" :
                  s.impact === "Medium" ? "bg-amber-500/15 text-amber-400" : "bg-white/10 text-white/40"
                }`}>{s.impact} Impact</span>
              </div>

              <p className="text-xs text-white/55 leading-relaxed mb-4">{s.description}</p>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {s.tags.map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{t}</span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {applied.includes(s.id) ? (
                  <div className="flex-1 flex items-center gap-2 text-xs text-[#C6FF00]">
                    <CheckCircle className="w-4 h-4" /> Applied!
                  </div>
                ) : (
                  <button
                    onClick={() => setApplied((prev) => [...prev, s.id])}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all"
                    style={{ background: `${s.categoryColor}15`, color: s.categoryColor, border: `1px solid ${s.categoryColor}25` }}
                  >
                    <ArrowRight className="w-3.5 h-3.5" /> {s.actionLabel}
                  </button>
                )}
                <button className="p-2 rounded-xl border border-white/10 text-white/40 hover:text-white/60 transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDismissed((prev) => [...prev, s.id])}
                  className="p-2 rounded-xl border border-white/10 text-white/40 hover:text-red-400 transition-colors"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle className="w-12 h-12 text-[#C6FF00] mx-auto mb-3" />
            <h3 className="font-semibold mb-1">All caught up!</h3>
            <p className="text-sm text-white/40">No suggestions in this category. Check back after running campaigns for a few days.</p>
          </div>
        )}
      </div>
    </div>
  );
}
