"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldCheck,
  LayoutDashboard,
  Building2,
  Bot,
  Layers,
  Server,
  IndianRupee,
  LifeBuoy,
  Settings,
  LogOut,
} from "lucide-react";

const navSections = [
  {
    label: "Platform",
    items: [
      { icon: LayoutDashboard, label: "Overview", href: "/admin" },
      { icon: Building2, label: "Clients", href: "/admin/clients" },
      { icon: Bot, label: "All Agents", href: "/admin/agents" },
    ],
  },
  {
    label: "Business",
    items: [
      { icon: Layers, label: "Plans & Pricing", href: "/admin/plans" },
      { icon: IndianRupee, label: "Payments", href: "/admin/payments" },
    ],
  },
  {
    label: "Operations",
    items: [
      { icon: Server, label: "Providers", href: "/admin/providers" },
      { icon: LifeBuoy, label: "Support", href: "/admin/support" },
      { icon: Settings, label: "Settings", href: "/admin/settings" },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = () => {
    localStorage.removeItem("nx_admin");
    router.push("/admin/login");
  };

  return (
    <aside className="flex flex-col bg-[#0B0B14] border-r border-white/8 h-screen sticky top-0 w-60 flex-shrink-0">
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-white/8 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF9D3C] to-[#FBBF24] flex items-center justify-center shadow-[0_0_16px_rgba(255,157,60,0.35)]">
          <ShieldCheck className="w-4 h-4 text-[#06060B]" />
        </div>
        <div>
          <div className="font-bold text-sm leading-tight">
            Neuraxine <span className="gradient-text-saffron">Admin</span>
          </div>
          <div className="text-[10px] text-white/35">Platform control panel</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-3 mb-2">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-[#FF9D3C]/12 text-[#FF9D3C] border border-[#FF9D3C]/25"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-[#FF9D3C]" : ""}`} />
                    {item.label}
                    {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FF9D3C]" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/8 p-3 space-y-1 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/3 border border-white/8">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#FF9D3C]/50 to-[#FBBF24]/30 flex items-center justify-center text-xs font-bold text-[#06060B] bg-[#FF9D3C]">
            O
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">Platform Owner</div>
            <div className="text-[10px] text-white/40">admin@neuraxine.in</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-[#F87171] hover:bg-[#F87171]/5 transition-all"
        >
          <LogOut className="w-4 h-4" /> Sign out
        </button>
      </div>
    </aside>
  );
}
