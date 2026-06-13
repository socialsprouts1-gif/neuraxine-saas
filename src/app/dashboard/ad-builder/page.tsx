"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Send, Wand2, Target, DollarSign, Users, Image,
  FileText, Eye, Rocket, CheckCircle, AlertTriangle, Zap,
  RotateCcw, Copy, ChevronDown, Plus, X,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Header from "@/components/dashboard/Header";

type Message = {
  id: number;
  role: "user" | "ai";
  content: string;
  campaign?: Campaign;
  suggestions?: string[];
};

type Campaign = {
  name: string;
  objective: string;
  budget: string;
  budgetType: string;
  audience: string;
  ageRange: string;
  location: string;
  interests: string[];
  placements: string[];
  headline: string;
  primaryText: string;
  cta: string;
  utmSource: string;
};

const initialMessages: Message[] = [
  {
    id: 1,
    role: "ai",
    content: "Hi! I'm AdPilot AI. Tell me about the campaign you want to create. You can say something like:\n\n• \"Create a lead gen campaign for my gym in Pune with ₹500/day\"\n• \"Run a brand awareness campaign for my clothing store\"\n• \"Target clinic owners in Mumbai aged 35-55\"",
    suggestions: [
      "Lead gen for local gym · ₹500/day",
      "E-commerce sales campaign · ₹2000/day",
      "WhatsApp CTA for a salon",
      "Retargeting campaign for website visitors",
    ],
  },
];

const generateCampaign = (prompt: string): Campaign => ({
  name: `AI Campaign — ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`,
  objective: prompt.toLowerCase().includes("lead") ? "Lead Generation" : prompt.toLowerCase().includes("sale") ? "Conversions" : "Brand Awareness",
  budget: "₹500",
  budgetType: "Daily Budget",
  audience: "Adults interested in fitness, wellness & health",
  ageRange: "25–45",
  location: prompt.toLowerCase().includes("pune") ? "Pune, Maharashtra (15km radius)" : prompt.toLowerCase().includes("mumbai") ? "Mumbai, Maharashtra (10km radius)" : "India",
  interests: ["Fitness & Wellness", "Gym & Exercise", "Health Conscious", "Sports & Recreation"],
  placements: ["Facebook Feed", "Instagram Feed", "Instagram Reels", "Facebook Stories"],
  headline: "Transform Your Body in 30 Days 💪",
  primaryText: "Join Pune's #1 fitness studio. Expert trainers, modern equipment, and a community that keeps you motivated.\n\n✅ Free first week trial\n✅ No long-term contract\n✅ Results guaranteed\n\nLimited slots — grab yours now!",
  cta: "Get Free Trial",
  utmSource: "utm_source=meta&utm_medium=paid_social&utm_campaign=lead_gen_gym",
});

export default function AdBuilderPage() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const msg = text || input;
    if (!msg.trim()) return;

    setInput("");
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: msg }]);
    setLoading(true);

    await new Promise((r) => setTimeout(r, 1200));

    const campaign = generateCampaign(msg);
    setActiveCampaign(campaign);
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + 1,
        role: "ai",
        content: "I've built your campaign structure. Here's what I've prepared:",
        campaign,
        suggestions: [
          "Use UGC testimonial video for 2x better CTR",
          "Add WhatsApp CTA to capture leads directly",
          "Create 3 ad copy variations for A/B testing",
          "Target 5km radius for local service businesses",
        ],
      },
    ]);
    setLoading(false);
  };

  return (
    <div className="bg-[#050508] min-h-full flex flex-col">
      <Header title="AI Campaign Builder" subtitle="Describe your campaign in plain language" />

      <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 73px)" }}>
        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "ai" && (
                    <div className="w-8 h-8 rounded-xl bg-[#C6FF00]/15 border border-[#C6FF00]/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-[#C6FF00]" />
                    </div>
                  )}

                  <div className={`max-w-xl space-y-3 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                        msg.role === "user"
                          ? "bg-[#C6FF00]/15 border border-[#C6FF00]/20 text-white rounded-tr-sm"
                          : "bg-white/5 border border-white/10 text-white/80 rounded-tl-sm"
                      }`}
                    >
                      {msg.content}
                    </div>

                    {/* Campaign card */}
                    {msg.campaign && (
                      <div className="w-full glass-card border-[#C6FF00]/20 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#C6FF00]/5">
                          <span className="text-xs font-semibold text-[#C6FF00] flex items-center gap-1.5">
                            <CheckCircle className="w-3.5 h-3.5" /> Campaign Generated
                          </span>
                          <span className="text-[10px] text-white/40">{msg.campaign.objective}</span>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-3 text-xs">
                          {[
                            { icon: Target, label: "Objective", val: msg.campaign.objective, color: "#C6FF00" },
                            { icon: DollarSign, label: "Budget", val: `${msg.campaign.budget} / day`, color: "#00FF87" },
                            { icon: Users, label: "Audience", val: msg.campaign.ageRange, color: "#00D4FF" },
                            { icon: Target, label: "Location", val: msg.campaign.location, color: "#A855F7" },
                          ].map((item) => (
                            <div key={item.label} className="flex items-start gap-2">
                              <item.icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: item.color }} />
                              <div>
                                <div className="text-white/40">{item.label}</div>
                                <div className="text-white/80 font-medium">{item.val}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="px-4 pb-4 space-y-2">
                          <div className="bg-white/3 rounded-lg p-3 border border-white/8">
                            <div className="text-[10px] text-white/40 mb-1">Ad Headline</div>
                            <div className="text-sm font-semibold">{msg.campaign.headline}</div>
                          </div>
                          <div className="bg-white/3 rounded-lg p-3 border border-white/8">
                            <div className="text-[10px] text-white/40 mb-1">CTA Button</div>
                            <div className="text-sm font-semibold text-[#C6FF00]">{msg.campaign.cta}</div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => { setActiveCampaign(msg.campaign!); setReviewMode(true); }}
                              className="flex-1 py-2 rounded-xl bg-[#C6FF00] text-[#050508] text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#b8f000] transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" /> Review & Launch
                            </button>
                            <button className="px-3 py-2 rounded-xl border border-white/15 text-white/60 hover:text-white hover:bg-white/5 transition-all">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* AI suggestions */}
                    {msg.suggestions && (
                      <div className="w-full">
                        {msg.role === "ai" && msg.campaign ? (
                          <div className="space-y-1.5">
                            <div className="text-[10px] text-white/40 mb-2 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> AI Suggestions
                            </div>
                            {msg.suggestions.map((s) => (
                              <button
                                key={s}
                                onClick={() => handleSend(s)}
                                className="w-full text-left text-xs px-3 py-2 rounded-lg bg-white/3 border border-white/8 hover:border-[#C6FF00]/30 hover:bg-[#C6FF00]/5 text-white/60 hover:text-white transition-all"
                              >
                                💡 {s}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {msg.suggestions.map((s) => (
                              <button
                                key={s}
                                onClick={() => handleSend(s)}
                                className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-[#C6FF00]/30 hover:bg-[#C6FF00]/5 text-white/60 hover:text-white transition-all"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5 text-sm font-bold">
                      A
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#C6FF00]/15 border border-[#C6FF00]/25 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-[#C6FF00]" />
                </div>
                <div className="glass-card px-4 py-3 rounded-2xl rounded-tl-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-1">
                      {[0, 0.2, 0.4].map((d) => (
                        <div key={d} className="w-1.5 h-1.5 rounded-full bg-[#C6FF00] animate-bounce" style={{ animationDelay: `${d}s` }} />
                      ))}
                    </div>
                    <span className="text-xs text-white/50">Building your campaign...</span>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-white/8 p-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1 glass-card flex items-end gap-2 px-4 py-3 border-[#C6FF00]/15 focus-within:border-[#C6FF00]/30 transition-colors">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Describe your campaign... e.g. 'Create a lead gen campaign for my salon in Delhi with ₹800/day'"
                  className="flex-1 bg-transparent text-sm text-white placeholder-white/30 resize-none outline-none min-h-[40px] max-h-[120px]"
                  rows={1}
                />
              </div>
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="w-11 h-11 rounded-xl bg-[#C6FF00] text-[#050508] flex items-center justify-center hover:bg-[#b8f000] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-white/30 mt-2 text-center">
              AdPilot AI • Powered by GPT-4o • Always review before launching
            </p>
          </div>
        </div>

        {/* Right panel — quick actions */}
        <div className="w-72 border-l border-white/8 p-4 space-y-4 overflow-y-auto hidden xl:block">
          <div>
            <h4 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Quick Prompts</h4>
            <div className="space-y-2">
              {[
                { icon: Target, label: "Lead Gen Campaign", prompt: "Create a lead generation campaign for my business with ₹500/day budget" },
                { icon: DollarSign, label: "Sales Campaign", prompt: "Create a conversion campaign to drive sales with ₹1500/day" },
                { icon: Users, label: "Brand Awareness", prompt: "Run a brand awareness campaign to reach new audiences in my city" },
                { icon: RotateCcw, label: "Retargeting", prompt: "Create a retargeting campaign for people who visited my website" },
                { icon: Image, label: "Instagram Reels Ad", prompt: "Create an Instagram Reels ad campaign for my local business" },
              ].map((q) => (
                <button
                  key={q.label}
                  onClick={() => handleSend(q.prompt)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/3 border border-white/8 hover:border-[#C6FF00]/25 hover:bg-[#C6FF00]/5 transition-all text-left group"
                >
                  <q.icon className="w-3.5 h-3.5 text-[#C6FF00] flex-shrink-0" />
                  <span className="text-xs text-white/60 group-hover:text-white">{q.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-card p-4 border-[#C6FF00]/15 bg-[#C6FF00]/3">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-[#C6FF00]" />
              <span className="text-xs font-semibold text-[#C6FF00]">AI Tip</span>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              For local businesses, always include your city name and "radius" in the prompt for better targeting accuracy.
            </p>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      <AnimatePresence>
        {reviewMode && activeCampaign && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card w-full max-w-2xl max-h-[90vh] overflow-y-auto border-[#C6FF00]/20"
            >
              <div className="flex items-center justify-between p-5 border-b border-white/8">
                <div>
                  <h2 className="font-bold text-lg">Review Campaign</h2>
                  <p className="text-sm text-white/50">Confirm details before publishing to Meta</p>
                </div>
                <button onClick={() => setReviewMode(false)} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Policy warning */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300/80">
                    AdPilot has checked this ad against Meta policies. No violations detected. Review the copy one more time before publishing.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Campaign Name", value: activeCampaign.name },
                    { label: "Objective", value: activeCampaign.objective },
                    { label: "Daily Budget", value: activeCampaign.budget },
                    { label: "Location", value: activeCampaign.location },
                    { label: "Age Range", value: activeCampaign.ageRange },
                    { label: "CTA", value: activeCampaign.cta },
                  ].map((item) => (
                    <div key={item.label} className="bg-white/3 rounded-xl p-3 border border-white/8">
                      <div className="text-[10px] text-white/40 mb-1">{item.label}</div>
                      <div className="text-sm font-medium">{item.value}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-white/3 rounded-xl p-3 border border-white/8">
                  <div className="text-[10px] text-white/40 mb-2">Interests Targeting</div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeCampaign.interests.map((i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#C6FF00]/10 text-[#C6FF00] border border-[#C6FF00]/20">{i}</span>
                    ))}
                  </div>
                </div>

                <div className="bg-white/3 rounded-xl p-3 border border-white/8">
                  <div className="text-[10px] text-white/40 mb-1">Ad Headline</div>
                  <div className="text-sm font-semibold">{activeCampaign.headline}</div>
                </div>

                <div className="bg-white/3 rounded-xl p-3 border border-white/8">
                  <div className="text-[10px] text-white/40 mb-1">Primary Ad Text</div>
                  <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{activeCampaign.primaryText}</div>
                </div>

                <div className="bg-white/3 rounded-xl p-3 border border-white/8">
                  <div className="text-[10px] text-white/40 mb-1">UTM Parameters</div>
                  <div className="text-xs font-mono text-[#C6FF00]/80">{activeCampaign.utmSource}</div>
                </div>
              </div>

              <div className="p-5 border-t border-white/8 flex gap-3">
                <button onClick={() => setReviewMode(false)} className="flex-1 py-3 rounded-xl border border-white/15 text-sm text-white/60 hover:text-white hover:bg-white/5 transition-all">
                  Edit Campaign
                </button>
                <button
                  onClick={() => { setReviewMode(false); alert("Campaign published to Meta Ads! (Demo mode)"); }}
                  className="flex-1 py-3 rounded-xl bg-[#C6FF00] text-[#050508] text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#b8f000] transition-colors"
                >
                  <Rocket className="w-4 h-4" /> Publish to Meta
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
