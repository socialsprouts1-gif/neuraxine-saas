"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Palette,
  Receipt,
  Database,
  ScrollText,
  Settings,
  Shield,
  Ticket,
  Users,
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
      { icon: Palette, label: "Landing page", href: "/admin/landing" },
      { icon: LifeBuoy, label: "Support tickets", href: "/admin/tickets" },
      { icon: ScrollText, label: "Webhook logs", href: "/admin/webhook-logs" },
      { icon: Database, label: "Database", href: "/admin/database" },
      { icon: Settings, label: "Platform settings", href: "/admin/settings" },
    ],
  },
];

/** The brand block, shared by the rail and the drawer. */
export function AdminBrand() {
  return (
    <div className="flex items-center gap-2.5 px-4 h-16 border-b border-white/8 flex-shrink-0">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#A855F7] to-accent2 flex items-center justify-center shadow-[0_0_16px_rgba(168,85,247,0.35)] flex-shrink-0">
        <Shield className="w-4 h-4 text-[#050508]" />
      </div>
      <div className="min-w-0">
        <div className="font-bold text-sm leading-tight">Neura Chat</div>
        <div className="text-[10px] uppercase tracking-widest text-[#A855F7]">Admin</div>
      </div>
    </div>
  );
}

/**
 * The links, shared by the rail and the drawer so the two cannot drift.
 */
export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 overscroll-contain">
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
                    onClick={onNavigate}
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
          href="/overview"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to workspace
        </Link>
      </div>
    </>
  );
}

/** The permanent rail, from lg up. Below that AdminMobileNav takes over. */
export default function AdminSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-60 bg-[var(--surface-1)] border-r border-white/8 h-screen sticky top-0 flex-shrink-0">
      <AdminBrand />
      <AdminNav />
    </aside>
  );
}
