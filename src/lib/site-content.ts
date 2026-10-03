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
  /**
   * The number the "chat with us" button on the site opens.
   *
   * Written however it is said — 8767512569, +91 87675 12569 — and
   * normalised at the link. Empty hides the button rather than rendering
   * one that opens WhatsApp on an error.
   */
  whatsappNumber: string;
  /**
   * Where "Book a demo" goes — a Calendly link, or any booking page.
   *
   * Empty falls back to WhatsApp, which is the right default for a
   * product that sells WhatsApp automation: the demo starts in the
   * channel it is about.
   */
  demoUrl: string;
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
  whatsappNumber: "8237982569",
  demoUrl: "",
};

export const DEFAULT_HERO: HeroContent = {
  badge: "AI-Powered WhatsApp Automation",
  headline: "Turn WhatsApp Into",
  headlineAccent: "Your Sales Machine",
  subheadline:
    "Automate customer support, lead generation, sales follow-ups, and marketing campaigns with AI-powered WhatsApp workflows. No code required.",
  pills: ["AI Chatbots", "Bulk Campaigns", "CRM Built-in", "Auto Follow-ups", "Analytics"],
  // Not "Start Free Trial". The trial is what every sign-up gets anyway,
  // so a button promising it sent people who were ready to pay into a
  // fourteen-day holding pattern instead of to a payment window.
  primaryCta: { label: "Choose a plan", href: "/#pricing" },
  // Booking, not a video. "Watch Demo" promised one and scrolled the
  // page; the href here is only a fallback — the button resolves to a
  // configured booking page, or to WhatsApp.
  secondaryCta: { label: "Book a demo", href: "#pricing" },
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

/**
 * The two hero buttons, as they were saved before plans went straight to
 * payment.
 *
 * A stored row always wins over the default, which is correct — it is
 * somebody's edit. But these two particular values are not an edit: they
 * are what the defaults used to be, saved the first time anybody pressed
 * Save on the landing editor. Leaving them meant the live site kept
 * offering a free trial button that was deliberately removed, and kept
 * sending that click to sign-up rather than to the gateway.
 *
 * So exactly these are corrected, once, and anything else anybody has
 * actually typed is left alone.
 */
const STALE_CTA: Array<{ label: string; href: string }> = [
  { label: "Start Free Trial", href: "/auth/register" },
  { label: "Watch Demo", href: "#how-it-works" },
];

function freshenCta(
  saved: { label: string; href: string },
  fallback: { label: string; href: string }
): { label: string; href: string } {
  const stale = STALE_CTA.some(
    (old) =>
      old.label.toLowerCase() === (saved.label ?? "").trim().toLowerCase() &&
      old.href === (saved.href ?? "").trim()
  );
  return stale ? fallback : saved;
}

/** Builds the whole content tree from whatever rows exist. */
export function buildSiteContent(rows: Array<{ key: string; value: unknown }>): SiteContent {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const hero = mergeSection(DEFAULT_HERO, byKey.get("hero"));

  return {
    brand: mergeSection(DEFAULT_BRAND, byKey.get("brand")),
    hero: {
      ...hero,
      primaryCta: freshenCta(hero.primaryCta, DEFAULT_HERO.primaryCta),
      secondaryCta: freshenCta(hero.secondaryCta, DEFAULT_HERO.secondaryCta),
    },
  };
}

/** The full brand name, for a page title or an alt attribute. */
export function brandName(brand: BrandContent): string {
  return [brand.name, brand.nameAccent].filter(Boolean).join(" ").trim() || "Neura Chat";
}
