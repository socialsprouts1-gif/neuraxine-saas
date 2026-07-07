"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  LayoutDashboard,
  Bot,
  PhoneCall,
  Megaphone,
  Users,
  Hash,
  BarChart3,
  Wallet,
  Settings,
  HelpCircle,
  ChevronLeft,
} from "lucide-react";
import { useState } from "react";

const navSections = [
  {
    label: "Main",
    items: [
      { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
      { icon: Bot, label: "Voice Agents", href: "/dashboard/agents" },
      { icon: PhoneCall, label: "Call Logs", href: "/dashboard/calls" },
      { icon: Megaphone, label: "Campaigns", href: "/dashboard/campaigns" },
    ],
  },
  {
    label: "Audience",
    items: [
      { icon: Users, label: "Contacts", href: "/dashboard/contacts" },
      { icon: Hash, label: "Phone Numbers", href: "/dashboard/numbers" },
    ],
  },
  {
    label: "Insights",
    items: [{ icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" }],
  },
  {
    label: "Account",
    items: [
      { icon: Wallet, label: "Billing & Wallet", href: "/dashboard/billing" },
      { icon: Settings, label: "Settings", href: "/dashboard/settings" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`relative flex flex-col bg-[#0B0B14] border-r border-white/8 h-screen sticky top-0 transition-all duration-300 ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className={`flex items-center gap-2.5 px-4 h-16 border-b border-white/8 flex-shrink-0 ${collapsed ? "justify-center" : ""}`}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#8B5CF6] to-[#22D3EE] flex items-center justify-center shadow-[0_0_16px_rgba(139,92,246,0.4)] flex-shrink-0">
          <AudioLines className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-base whitespace-nowrap">
            Neuraxine <span className="gradient-text">Voice</span>
          </span>
        )}
      </div>

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
                const isActive =
                  item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      collapsed ? "justify-center" : ""
                    } ${
                      isActive
                        ? "bg-[#8B5CF6]/12 text-[#A78BFA] border border-[#8B5CF6]/25"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-[#A78BFA]" : ""}`} />
                    {!collapsed && item.label}
                    {!collapsed && isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#A78BFA]" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

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

        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/3 border border-white/8 ${collapsed ? "justify-center" : ""}`}>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8B5CF6]/40 to-[#22D3EE]/30 flex items-center justify-center text-xs font-bold flex-shrink-0">
            N
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">Nikhil Sharma</div>
              <div className="text-[10px] text-white/40">Growth Plan</div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-[#10101C] border border-white/15 flex items-center justify-center hover:border-[#8B5CF6]/40 transition-colors"
      >
        <ChevronLeft className={`w-3 h-3 text-white/60 transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
      </button>
    </aside>
  );
}
