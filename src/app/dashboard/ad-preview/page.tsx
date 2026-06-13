"use client";

import { motion } from "framer-motion";
import { Eye, Smartphone, Monitor, Image, Play, ThumbsUp, MessageCircle, Share2, MoreHorizontal, Heart, Send, Bookmark, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import Header from "@/components/dashboard/Header";

const placements = [
  { id: "fb-feed", label: "Facebook Feed", icon: Monitor },
  { id: "ig-feed", label: "Instagram Feed", icon: Smartphone },
  { id: "ig-story", label: "Instagram Story", icon: Smartphone },
  { id: "ig-reels", label: "Instagram Reels", icon: Play },
];

const adData = {
  pageName: "Priya's Fitness Studio",
  pageAvatar: "P",
  sponsored: true,
  headline: "Transform Your Body in 30 Days 💪",
  primaryText: "Join Pune's #1 fitness studio. Expert trainers, modern equipment, and a community that keeps you motivated.\n\n✅ Free first week trial\n✅ No long-term contract\n✅ Results guaranteed",
  cta: "Get Free Trial",
  imageGradient: "from-[#C6FF00]/20 via-[#00FF87]/10 to-[#050508]",
  imagePlaceholder: "🏋️ Ad Creative",
  url: "priyas-fitness.com",
};

function FBFeedPreview() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-80">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-[#1877F2]">
        <div className="text-white font-black text-lg">f</div>
        <div className="flex-1 bg-white/20 rounded-full h-8 px-3 flex items-center">
          <span className="text-white/60 text-xs">Search Facebook</span>
        </div>
      </div>

      {/* Post */}
      <div className="bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C6FF00] to-[#00FF87] flex items-center justify-center text-[#050508] font-bold">
              {adData.pageAvatar}
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">{adData.pageName}</div>
              <div className="text-xs text-gray-400">Sponsored · 🌐</div>
            </div>
          </div>
          <MoreHorizontal className="w-5 h-5 text-gray-400" />
        </div>

        <p className="px-4 text-sm text-gray-800 leading-relaxed mb-3 whitespace-pre-line">{adData.primaryText}</p>

        {/* Ad image */}
        <div className={`bg-gradient-to-br ${adData.imageGradient} h-52 flex items-center justify-center border-y border-gray-100`}>
          <div className="text-center">
            <div className="text-5xl mb-2">{adData.imagePlaceholder}</div>
            <div className="text-xs text-white/60">1200 × 628 px</div>
          </div>
        </div>

        {/* CTA bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <div className="text-xs text-gray-400">{adData.url.toUpperCase()}</div>
            <div className="text-sm font-semibold text-gray-900">{adData.headline}</div>
          </div>
          <button className="bg-gray-100 text-gray-700 text-xs font-semibold px-4 py-2 rounded-md hover:bg-gray-200">
            {adData.cta}
          </button>
        </div>

        {/* Reactions */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1 text-gray-400 text-xs">
            <span>👍 ❤️</span><span>1.2K</span>
          </div>
          <div className="flex gap-4 text-xs text-gray-400">
            <span>48 comments</span>
            <span>12 shares</span>
          </div>
        </div>
        <div className="flex border-t border-gray-100">
          {[ThumbsUp, MessageCircle, Share2].map((Icon, i) => (
            <button key={i} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-gray-500 hover:bg-gray-50 text-xs">
              <Icon className="w-4 h-4" />{["Like", "Comment", "Share"][i]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function IGFeedPreview() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-72">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C6FF00] to-[#00FF87] p-0.5">
            <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-[#050508]">
              {adData.pageAvatar}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900">{adData.pageName.toLowerCase().replace(/\s/g, "_")}</div>
            <div className="text-[10px] text-gray-400">Sponsored</div>
          </div>
        </div>
        <MoreHorizontal className="w-4 h-4 text-gray-400" />
      </div>

      {/* Image */}
      <div className={`bg-gradient-to-br ${adData.imageGradient} h-64 flex items-center justify-center`}>
        <div className="text-center">
          <div className="text-5xl mb-2">{adData.imagePlaceholder}</div>
          <div className="text-xs text-white/60">1080 × 1080 px</div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Heart className="w-5 h-5 text-gray-700" />
            <MessageCircle className="w-5 h-5 text-gray-700" />
            <Send className="w-5 h-5 text-gray-700" />
          </div>
          <Bookmark className="w-5 h-5 text-gray-700" />
        </div>
        <div className="text-xs font-semibold text-gray-900 mb-1">1,247 likes</div>
        <div className="text-xs text-gray-700 leading-relaxed">
          <span className="font-semibold">{adData.pageName.toLowerCase().replace(/\s/g, "_")}</span>{" "}
          {adData.primaryText.split("\n")[0]}
        </div>
        <button className="mt-2 w-full py-2 rounded-xl bg-[#1877F2] text-white text-xs font-semibold">
          {adData.cta}
        </button>
      </div>
    </div>
  );
}

function IGStoryPreview() {
  return (
    <div className="bg-black rounded-3xl overflow-hidden shadow-2xl w-52 h-96 relative">
      {/* Story bg */}
      <div className={`absolute inset-0 bg-gradient-to-b ${adData.imageGradient}`} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-6xl">{adData.imagePlaceholder}</div>
      </div>

      {/* Top bar */}
      <div className="relative z-10 px-3 pt-3">
        <div className="flex gap-1 mb-2">
          <div className="flex-1 h-0.5 bg-white rounded-full" />
          <div className="flex-1 h-0.5 bg-white/40 rounded-full" />
          <div className="flex-1 h-0.5 bg-white/40 rounded-full" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C6FF00] to-[#00FF87] border-2 border-[#C6FF00] flex items-center justify-center text-[10px] font-bold text-[#050508]">
              {adData.pageAvatar}
            </div>
            <div>
              <div className="text-white text-[10px] font-semibold">{adData.pageName}</div>
              <div className="text-white/60 text-[8px]">Sponsored</div>
            </div>
          </div>
          <MoreHorizontal className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Headline overlay */}
      <div className="absolute bottom-16 left-3 right-3 z-10">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl p-3">
          <p className="text-white text-xs font-semibold">{adData.headline}</p>
          <p className="text-white/70 text-[10px] mt-1">Swipe up to {adData.cta}</p>
        </div>
      </div>

      {/* CTA */}
      <div className="absolute bottom-3 left-3 right-3 z-10">
        <button className="w-full py-2 rounded-xl bg-white text-[#050508] text-xs font-bold">
          {adData.cta} ↑
        </button>
      </div>
    </div>
  );
}

function ReelsPreview() {
  return (
    <div className="bg-black rounded-3xl overflow-hidden shadow-2xl w-52 h-96 relative">
      <div className={`absolute inset-0 bg-gradient-to-b from-[#050508] ${adData.imageGradient}`} />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-6xl">{adData.imagePlaceholder}</div>
      </div>

      {/* Play button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center ml-1">
          <Play className="w-5 h-5 text-white fill-white" />
        </div>
      </div>

      {/* Right actions */}
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-4 z-10">
        {[Heart, MessageCircle, Send, MoreHorizontal].map((Icon, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <Icon className="w-4 h-4 text-white" />
            </div>
            {i < 3 && <span className="text-white text-[8px]">{["1.2K", "48", "12"][i]}</span>}
          </div>
        ))}
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-3 left-3 right-12 z-10">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#C6FF00] to-[#00FF87] border border-white flex items-center justify-center text-[8px] font-bold text-[#050508]">
            {adData.pageAvatar}
          </div>
          <span className="text-white text-[10px] font-semibold">{adData.pageName.toLowerCase().replace(/\s/g, "_")}</span>
          <span className="text-white/60 text-[8px]">· Sponsored</span>
        </div>
        <p className="text-white text-[10px] leading-tight mb-2">{adData.primaryText.split("\n")[0]}</p>
        <button className="w-full py-1.5 rounded-lg bg-white text-[#050508] text-[10px] font-bold">
          {adData.cta}
        </button>
      </div>
    </div>
  );
}

export default function AdPreviewPage() {
  const [activePlacement, setActivePlacement] = useState("fb-feed");

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Ad Preview Studio" subtitle="See how your ad looks across all Meta placements" />

      <div className="p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Preview area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Placement tabs */}
            <div className="flex gap-2 flex-wrap">
              {placements.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePlacement(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    activePlacement === p.id
                      ? "bg-[#C6FF00]/15 text-[#C6FF00] border border-[#C6FF00]/30"
                      : "bg-white/5 border border-white/10 text-white/60 hover:text-white"
                  }`}
                >
                  <p.icon className="w-4 h-4" />
                  {p.label}
                </button>
              ))}
            </div>

            {/* Preview */}
            <motion.div
              key={activePlacement}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card p-8 flex items-center justify-center min-h-[480px]"
            >
              {activePlacement === "fb-feed" && <FBFeedPreview />}
              {activePlacement === "ig-feed" && <IGFeedPreview />}
              {activePlacement === "ig-story" && <IGStoryPreview />}
              {activePlacement === "ig-reels" && <ReelsPreview />}
            </motion.div>

            {/* All placements grid */}
            <div>
              <h3 className="text-sm font-semibold text-white/50 mb-3 uppercase tracking-wider">All Placements Preview</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {placements.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePlacement(p.id)}
                    className={`glass-card p-4 text-center hover:border-[#C6FF00]/30 transition-all ${
                      activePlacement === p.id ? "border-[#C6FF00]/30 bg-[#C6FF00]/5" : ""
                    }`}
                  >
                    <p.icon className="w-5 h-5 mx-auto mb-2 text-white/50" />
                    <div className="text-xs text-white/60">{p.label}</div>
                    <div className="w-2 h-2 rounded-full bg-[#C6FF00] mx-auto mt-2 opacity-60" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right panel — ad details */}
          <div className="space-y-4">
            <div className="glass-card p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#C6FF00]" /> Ad Details
              </h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: "Page", value: adData.pageName },
                  { label: "Headline", value: adData.headline },
                  { label: "CTA", value: adData.cta },
                  { label: "Destination", value: adData.url },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="text-xs text-white/40 mb-0.5">{item.label}</div>
                    <div className="text-white/80">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3 text-white/60">Primary Text</h3>
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{adData.primaryText}</p>
            </div>

            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3 text-white/60">Creative Specs</h3>
              <div className="space-y-2 text-xs">
                {[
                  { placement: "FB Feed", size: "1200×628 px", ratio: "1.91:1" },
                  { placement: "IG Feed", size: "1080×1080 px", ratio: "1:1" },
                  { placement: "Stories", size: "1080×1920 px", ratio: "9:16" },
                  { placement: "Reels", size: "1080×1920 px", ratio: "9:16" },
                ].map((s) => (
                  <div key={s.placement} className={`flex items-center justify-between p-2 rounded-lg ${activePlacement.includes(s.placement.toLowerCase().split(" ")[0]) ? "bg-[#C6FF00]/8 border border-[#C6FF00]/15" : "bg-white/3"}`}>
                    <span className="text-white/60">{s.placement}</span>
                    <span className="text-white/40">{s.size}</span>
                  </div>
                ))}
              </div>
            </div>

            <button className="w-full py-3 rounded-xl bg-[#C6FF00] text-[#050508] text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#b8f000] transition-colors">
              <Image className="w-4 h-4" /> Upload Creative
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
