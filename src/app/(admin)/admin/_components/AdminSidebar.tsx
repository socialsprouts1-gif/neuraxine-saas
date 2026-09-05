"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Package,
  Ticket,
  Receipt,
  LifeBuoy,
  ScrollText,
  Settings,
  ArrowLeft,
} from "lucide-react";

const SECTIONS = [
  {
    label: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/admin" }],
  },
  {
    label: "Tenants",
    items: [
      { icon: Users, label: "Users", href: "/admin/users" },
      { icon: Building2, label: "Organizations", href: "/admin/organizations" },
    ],
  },
  {
    label: "Billing",
    items: [
      { icon: CreditCard, label: "Plans", href: "/admin/plans" },
      { icon: Package, label: "Add-ons", href: "/admin/add-ons" },
      { icon: Ticket, label: "Coupons", href: "/admin/coupons" },
      { icon: Receipt, label: "Orders", href: "/admin/orders" },
    ],
  },
  {
    label: "Operations",
    items: [
      { icon: LifeBuoy, label: "Support tickets", href: "/admin/tickets" },
      { icon: ScrollText, label: "Webhook logs", href: "/admin/webhook-logs" },
      { icon: Settings, label: "Platform settings", href: "/admin/settings" },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-60 bg-[var(--surface-1)] border-r border-white/8 h-screen sticky top-0 flex-shrink-0">
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-white/8 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#A855F7] to-accent2 flex items-center justify-center shadow-[0_0_16px_rgba(168,85,247,0.35)] flex-shrink-0">
          <Shield className="w-4 h-4 text-[#050508]" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm leading-tight">Neura Chat</div>
          <div className="text-[10px] uppercase tracking-widest text-[#A855F7]">Admin</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-3 mb-2">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                // /admin would otherwise light up for every child route.
                const isActive =
                  item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? "bg-[#A855F7]/12 text-[#A855F7] border border-[#A855F7]/25"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/8 p-3 flex-shrink-0">
        <Link
          href="/inbox"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to workspace
        </Link>
      </div>
    </aside>
  );
}
