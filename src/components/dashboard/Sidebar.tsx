"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Zap,
  LayoutDashboard,
  Target,
  Wand2,
  Eye,
  Plug2,
  BarChart3,
  Settings,
  HelpCircle,
  CreditCard,
  ChevronLeft,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

const navSections = [
  {
    label: "Overview",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    label: "Meta Ads",
    items: [
      { icon: Wand2, label: "AI Builder", href: "/dashboard/ad-builder" },
      { icon: Target, label: "Campaigns", href: "/dashboard/campaigns" },
      { icon: Eye, label: "Ad Preview", href: "/dashboard/ad-preview" },
      { icon: Sparkles, label: "AI Suggestions", href: "/dashboard/ai-suggestions" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
    ],
  },
  {
    label: "Account",
    items: [
      { icon: Plug2, label: "Connect Meta", href: "/dashboard/meta-connect" },
      { icon: CreditCard, label: "Billing", href: "/dashboard/billing" },
      { icon: Settings, label: "Settings", href: "/dashboard/settings" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`relative flex flex-col bg-[#0A0A0F] border-r border-white/8 h-screen sticky top-0 transition-all duration-300 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-white/8 flex-shrink-0 ${collapsed ? "justify-center" : ""}`}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C6FF00] to-[#00FF87] flex items-center justify-center shadow-[0_0_16px_rgba(198,255,0,0.4)] flex-shrink-0">
          <Zap className="w-4 h-4 text-[#050508]" />
        </div>
        {!collapsed && (
          <span className="font-bold text-base whitespace-nowrap">
            AdPilot <span className="gradient-text-green">AI</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-3 mb-2">
                {section.label}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      collapsed ? "justify-center" : ""
                    } ${
                      isActive
                        ? "bg-[#C6FF00]/10 text-[#C6FF00] border border-[#C6FF00]/20"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-[#C6FF00]" : ""}`} />
                    {!collapsed && item.label}
                    {!collapsed && isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#C6FF00]" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-white/8 p-3 space-y-1 flex-shrink-0">
        <Link
          href="#"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          {!collapsed && "Help & Support"}
        </Link>

        {/* User avatar */}
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/3 border border-white/8 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C6FF00]/30 to-[#00FF87]/30 flex items-center justify-center text-xs font-bold flex-shrink-0">
            A
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">Alex Johnson</div>
              <div className="text-[10px] text-white/40">Growth Plan</div>
            </div>
          )}
        </div>
      </div>

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#141420] border border-white/15 flex items-center justify-center hover:border-[#C6FF00]/30 transition-colors"
      >
        <ChevronLeft className={`w-3 h-3 text-white/60 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
      </button>
    </aside>
  );
}
