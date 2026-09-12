"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandMark from "@/components/ui/BrandMark";
import { pathAllowed } from "@/lib/features";
import { useState } from "react";
import {
  LayoutDashboard,
  MessageCircle,
  Bell,
  LifeBuoy,
  Users,
  Bot,
  Sparkles,
  HelpCircle,
  Plug,
  ShoppingBag,
  Image as ImageIcon,
  Building2,
  Code2,
  CreditCard,
  Settings,
  Shield,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  DollarSign,
  Wallet,
  Phone,
} from "lucide-react";

// The navigation, in the order the product presents it. One heading, then
// a flat list in which Leads, Manage and Invoice expand in place. Anything
// not built yet is listed where it belongs and marked, rather than being
// left out of the sequence or linked to a page that does nothing.

interface NavChild {
  label: string;
  href: string;
  soon?: boolean;
}

interface NavItem {
  icon: typeof LayoutDashboard;
  label: string;
  href: string;
  soon?: boolean;
  children?: NavChild[];
}

const PLATFORM: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/overview" },
  { icon: MessageCircle, label: "Inbox", href: "/inbox" },
  { icon: Phone, label: "WhatsApp Numbers", href: "/numbers" },
  {
    icon: Users,
    label: "Leads",
    href: "/leads/board",
    children: [
      { label: "Board", href: "/leads/board" },
      { label: "Lead Status", href: "/leads/status" },
    ],
  },
  { icon: Bell, label: "Reminders", href: "/reminders" },
  { icon: CalendarCheck, label: "Appointments", href: "/appointments" },
  { icon: CalendarDays, label: "Meetings", href: "/meetings" },
  { icon: LifeBuoy, label: "My support", href: "/support" },
];

const MAIN: NavItem[] = [
  {
    icon: Settings,
    label: "Manage",
    href: "/templates",
    children: [
      { label: "Whatsapp Templates", href: "/templates" },
      { label: "Groups", href: "/groups" },
      { label: "Contacts", href: "/contacts" },
      { label: "Transactions", href: "/transactions" },
      { label: "Campaigns", href: "/campaigns" },
      { label: "Whatsapp Forms", href: "/forms" },
      { label: "Canned Messages", href: "/canned-messages" },
      { label: "Tags", href: "/tags" },
      { label: "Columns", href: "/columns" },
      { label: "Opts Management", href: "/opts" },
      { label: "Automations", href: "/automations" },
    ],
  },
  {
    icon: DollarSign,
    label: "Invoice",
    href: "/invoice/list",
    children: [
      { label: "Invoices", href: "/invoice/list" },
      { label: "Recurring", href: "/invoice/recurring" },
      { label: "Settings", href: "/invoice/settings" },
    ],
  },
  { icon: Plug, label: "Integrations", href: "/integrations" },
  { icon: ShoppingBag, label: "Commerce", href: "/commerce" },
  { icon: Wallet, label: "WA Pay", href: "/wa-pay" },
  { icon: ImageIcon, label: "Gallery", href: "/gallery" },
  { icon: HelpCircle, label: "FAQ Bot", href: "/faq-bot" },
  { icon: Bot, label: "Chatbot", href: "/chatbot" },
  { icon: Sparkles, label: "AI Assistant", href: "/ai-assistant" },
  { icon: Building2, label: "Organizations", href: "/organizations" },
  { icon: Code2, label: "API Endpoints", href: "/api-endpoints" },
  { icon: CreditCard, label: "Billing", href: "/billing" },
  { icon: Wallet, label: "WhatsApp Wallet", href: "/wallet", soon: true },
  { icon: Settings, label: "Settings", href: "/settings" },
];

/**
 * Everything below the brand mark. Shared by the desktop rail and the
 * mobile drawer so the two can never drift — one list, rendered twice.
 */
export function SidebarNav({
  isPlatformAdmin = false,
  features = {},
  onNavigate,
}: {
  isPlatformAdmin?: boolean;
  /** Feature key → allowed. A key that is absent counts as allowed. */
  features?: Record<string, boolean>;
  /** Called when a link is followed, so the drawer can shut behind it. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  // Hidden here and refused on the page itself. Hiding alone would leave a
  // bookmarked URL working, which is not what "off" means to anyone.
  const visible = (items: NavItem[]): NavItem[] =>
    items
      .filter((item) => pathAllowed(item.href, features))
      .map((item) =>
        item.children
          ? { ...item, children: item.children.filter((child) => pathAllowed(child.href, features)) }
          : item
      )
      // A parent whose every child is switched off has nothing left to open.
      .filter((item) => !item.children || item.children.length > 0);

  const platform = visible(PLATFORM);
  const main = visible(MAIN);

  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4 overscroll-contain">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-3 mb-2">
          Platform
        </div>
        <div className="space-y-0.5 mb-4">
          {platform.map((item) => (
            <NavEntry key={item.label} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="space-y-0.5">
          {main.map((item) => (
            <NavEntry key={item.label} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>

      {/* Only rendered for platform staff. Hiding it is a convenience, not the
          control — /admin re-checks server-side and RLS enforces the rest. */}
      {isPlatformAdmin && (
        <div className="border-t border-white/8 p-3 flex-shrink-0">
          <Link
            href="/admin"
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#A855F7] hover:bg-[#A855F7]/10 transition-all"
          >
            <Shield className="w-4 h-4 flex-shrink-0" />
            Admin panel
          </Link>
        </div>
      )}
    </>
  );
}

/** The brand block at the top of both the rail and the drawer. */
export function SidebarBrand() {
  return (
    <div className="flex items-center gap-2.5 px-4 h-16 border-b border-white/8 flex-shrink-0">
      <BrandMark size={34} />
      <div className="min-w-0">
        <div className="font-bold text-sm leading-tight whitespace-nowrap">
          Neura <span className="gradient-text-green">Chat</span>
        </div>
        <div className="text-[9px] uppercase tracking-widest text-white/30">Business inbox</div>
      </div>
    </div>
  );
}

/**
 * The permanent rail, on screens wide enough to spare 240px for it.
 *
 * Below that it is not rendered at all rather than hidden with CSS — on a
 * phone it was taking most of the screen and pushing every page off the
 * right edge, which is what made the whole product unusable on a phone.
 * The same list appears in MobileNav's drawer instead.
 */
export default function Sidebar({
  isPlatformAdmin = false,
  features = {},
}: {
  isPlatformAdmin?: boolean;
  features?: Record<string, boolean>;
}) {
  return (
    <aside className="hidden lg:flex flex-col w-60 bg-[var(--surface-1)] border-r border-white/8 h-screen sticky top-0 flex-shrink-0">
      <SidebarBrand />
      <SidebarNav isPlatformAdmin={isPlatformAdmin} features={features} />
    </aside>
  );
}

/**
 * One nav row. A parent stays open while you are anywhere inside it, so the
 * child you came from is still on screen when you land.
 *
 * An item marked `soon` is rendered in place but not linked: leaving it out
 * would break the sequence, and linking it would promise a page that does
 * nothing.
 */
function NavEntry({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const inside = item.children?.some((child) => pathname === child.href) ?? false;
  const [open, setOpen] = useState(inside);

  if (item.children) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open || inside}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            inside ? "text-accent-ink" : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          <item.icon className={`w-4 h-4 flex-shrink-0 ${inside ? "text-accent-ink" : ""}`} />
          {item.label}
          <ChevronRight
            className={`ml-auto w-3.5 h-3.5 transition-transform ${
              open || inside ? "rotate-90" : ""
            }`}
          />
        </button>

        {(open || inside) && (
          <div className="ml-4 pl-3 border-l border-white/8 space-y-0.5 mt-0.5 mb-1">
            {item.children.map((child) =>
              child.soon ? (
                <SoonRow key={child.label} label={child.label} />
              ) : (
                <Link
                  key={child.href}
                  href={child.href}
                  onClick={onNavigate}
                  className={`block px-3 py-2 rounded-lg text-[13px] transition-colors ${
                    pathname === child.href
                      ? "text-accent-ink bg-accent/8"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {child.label}
                </Link>
              )
            )}
          </div>
        )}
      </div>
    );
  }

  if (item.soon) {
    return <SoonRow label={item.label} icon={item.icon} />;
  }

  const isActive = pathname === item.href;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-accent/10 text-accent-ink border border-accent/20"
          : "text-white/60 hover:text-white hover:bg-white/5"
      }`}
    >
      <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-accent-ink" : ""}`} />
      {item.label}
      {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent" />}
    </Link>
  );
}

/** Holds an unbuilt item's place without pretending it is clickable. */
function SoonRow({
  label,
  icon: Icon,
}: {
  label: string;
  icon?: typeof LayoutDashboard;
}) {
  return (
    <div
      title="Not built yet"
      aria-disabled="true"
      className={`flex items-center gap-3 px-3 rounded-xl text-white/25 cursor-default ${
        Icon ? "py-2 text-sm font-medium" : "py-1.5 text-[13px]"
      }`}
    >
      {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
      {label}
      <span className="ml-auto text-[9px] uppercase tracking-wider text-white/20">soon</span>
    </div>
  );
}
