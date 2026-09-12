// The words on the marketing site.
//
// Every string here used to be a literal inside a React component, so
// changing a headline or a price meant a code change, a build and a deploy.
// The shapes below are what the admin editor writes and the landing page
// reads.
//
// Pure by design: no fetch, no env, no server-only, so it can be imported
// from a client component and tested. The loader lives in
// site-content-server.ts.
//
// DEFAULTS are the live site as it stands. They are not placeholders — an
// empty database has to render the real page, so a failed query or a section
// nobody has edited yet is invisible rather than blank.

export interface CtaContent {
  label: string;
  href: string;
}

export interface BrandContent {
  /** "Neura" — the part rendered in plain text. */
  name: string;
  /** "Chat" — the part rendered in the accent gradient. Blank for none. */
  nameAccent: string;
  /** Uploaded logo. Falls back to the wordmark when empty. */
  logoUrl: string;
  /** Uploaded favicon. Falls back to /icon.svg when empty. */
  faviconUrl: string;
  /** Browser tab title and the <title> tag. */
  siteTitle: string;
  /** Meta description, and the card text when a link is shared. */
  siteDescription: string;
}

export interface HeroContent {
  badge: string;
  headline: string;
  /** Second line, rendered in the accent gradient. */
  headlineAccent: string;
  subheadline: string;
  pills: string[];
  primaryCta: CtaContent;
  secondaryCta: CtaContent;
  /** The avatar row and rating under the buttons. */
  showSocialProof: boolean;
  rating: string;
  socialProofText: string;
  stats: Array<{ value: string; label: string }>;
  /** The cards that float around the dashboard preview. */
  floatingCards: Array<{ title: string; subtitle: string; color: string }>;
}

export interface SiteContent {
  brand: BrandContent;
  hero: HeroContent;
}

export const DEFAULT_BRAND: BrandContent = {
  name: "Neura",
  nameAccent: "Chat",
  logoUrl: "",
  faviconUrl: "",
  siteTitle: "Neura Chat — AI-Powered WhatsApp Automation Platform",
  siteDescription:
    "Automate customer support, lead generation, sales, follow-ups, and engagement with AI-powered WhatsApp workflows.",
};

export const DEFAULT_HERO: HeroContent = {
  badge: "AI-Powered WhatsApp Automation",
  headline: "Turn WhatsApp Into",
  headlineAccent: "Your Sales Machine",
  subheadline:
    "Automate customer support, lead generation, sales follow-ups, and marketing campaigns with AI-powered WhatsApp workflows. No code required.",
  pills: ["AI Chatbots", "Bulk Campaigns", "CRM Built-in", "Auto Follow-ups", "Analytics"],
  primaryCta: { label: "Start Free Trial", href: "/auth/register" },
  secondaryCta: { label: "Watch Demo", href: "#how-it-works" },
  // Off until there are real numbers to show. A customer count, a star
  // rating and a message total are all claims a buyer can check, and being
  // caught inventing one costs more than the section was ever worth.
  showSocialProof: false,
  rating: "",
  socialProofText: "",
  // Facts about how the product is built, not counts of who uses it. Each
  // of these is true today and stays true as the business grows.
  stats: [
    { value: "Direct", label: "Meta Cloud API" },
    { value: "Yours", label: "WhatsApp number & data" },
    { value: "0%", label: "Markup on messages" },
    { value: "24/7", label: "Automated replies" },
  ],
  floatingCards: [
    { title: "AI Reply Sent", subtitle: "Response time: 0.3s", color: "#00FF87" },
    { title: "Lead Converted", subtitle: "+$2,400 revenue", color: "#00D4FF" },
    { title: "Chatbot Active", subtitle: "1,247 chats handled", color: "#A855F7" },
    { title: "Campaign Sent", subtitle: "98.2% delivered", color: "#00FF87" },
  ],
};

export const DEFAULT_SITE_CONTENT: SiteContent = {
  brand: DEFAULT_BRAND,
  hero: DEFAULT_HERO,
};

/**
 * Lays a saved section over its defaults.
 *
 * Shallow on purpose, one level deep. A saved section that predates a new
 * field keeps rendering — the field falls back — and a saved array replaces
 * its default outright rather than merging element by element, which is what
 * anyone editing a list expects: delete an item and it is gone.
 */
export function mergeSection<T extends object>(defaults: T, saved: unknown): T {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return defaults;

  const merged = { ...defaults } as Record<string, unknown>;
  for (const [key, value] of Object.entries(saved as Record<string, unknown>)) {
    // A key the shape no longer has is dropped rather than carried through:
    // it would never render, and it makes the stored row harder to read.
    if (!(key in defaults)) continue;
    if (value === null || value === undefined) continue;
    merged[key] = value;
  }
  return merged as T;
}

/** Builds the whole content tree from whatever rows exist. */
export function buildSiteContent(rows: Array<{ key: string; value: unknown }>): SiteContent {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    brand: mergeSection(DEFAULT_BRAND, byKey.get("brand")),
    hero: mergeSection(DEFAULT_HERO, byKey.get("hero")),
  };
}

/** The full brand name, for a page title or an alt attribute. */
export function brandName(brand: BrandContent): string {
  return [brand.name, brand.nameAccent].filter(Boolean).join(" ").trim() || "Neura Chat";
}
