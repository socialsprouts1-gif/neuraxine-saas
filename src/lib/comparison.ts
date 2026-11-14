// How NeuraChat compares to the other WhatsApp API providers.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Two warnings, because this table is the one part of the site that makes
// factual claims about other named companies.
//
// 1. Every competitor figure below has to be checked against that
//    company's own public pricing page, and CHECKED_ON updated when it
//    is. They were seeded from a comparison chart published by a rival,
//    which is a starting point and not a source. A wrong price about a
//    named business is a misleading advertisement, and under India's
//    Consumer Protection Act that lands on the advertiser.
//
// 2. NeuraChat's own column is not written here. It is built from the
//    live plan rows and the real feature set, so the comparison and the
//    pricing section can never disagree — a table claiming ₹599 beside a
//    pricing card charging ₹1,000 is worse than no table.
//
// The crosses in NeuraChat's own column are deliberate. A comparison
// where one product wins every row is one nobody believes, and the three
// honest gaps are what make the rest of it credible.

/** When the competitor figures were last checked against their own sites. */
export const CHECKED_ON = "2026-10-01";

/** A cell: a tick, a cross, or a short piece of text. */
export type Cell = boolean | string;

export interface ComparisonRow {
  /** What the row asks, in the buyer's words. */
  label: string;
  /** Keyed by provider id. A missing provider reads as "not stated". */
  values: Record<string, Cell>;
}

export interface Provider {
  id: string;
  name: string;
  /** The tint behind the column header. */
  tint: string;
}

/**
 * The competitors, in the order they appear.
 *
 * NeuraChat is not in this list — it is added first by the component,
 * from live data.
 */
export const COMPETITORS: Provider[] = [
  { id: "wati", name: "Wati", tint: "#16A34A" },
  { id: "aisensy", name: "AiSensy", tint: "#0891B2" },
  { id: "interakt", name: "Interakt", tint: "#EA580C" },
  { id: "doubletick", name: "DoubleTick", tint: "#65A30D" },
  { id: "gallabox", name: "Gallabox", tint: "#0D9488" },
  { id: "gupshup", name: "Gupshup", tint: "#7C3AED" },
];

/**
 * The feature rows, with every column except NeuraChat's.
 *
 * Seeded from a rival's published comparison. Check each one before this
 * goes anywhere near a customer.
 */
export const ROWS: ComparisonRow[] = [
  {
    label: "Entry plan",
    values: {
      wati: "₹2,199/mo",
      aisensy: "₹1,500/mo",
      interakt: "₹2,000/mo",
      doubletick: "₹3,000/mo",
      gallabox: "₹2,399/mo",
      gupshup: "₹4,000/mo",
    },
  },
  {
    label: "Top plan",
    values: {
      wati: "₹14,799/mo",
      aisensy: "₹3,200/mo",
      interakt: "₹3,500/mo",
      doubletick: "₹4,200/mo",
      gallabox: "₹13,599/mo",
      gupshup: "₹15,000/mo",
    },
  },
  {
    label: "Marketing message cost",
    values: {
      wati: "₹0.94",
      aisensy: "₹1.09",
      interakt: "₹0.97",
      doubletick: "₹1.10",
      gallabox: "₹0.93",
      gupshup: "₹0.95",
    },
  },
  {
    label: "Support channels",
    values: {
      wati: "Email, Chat",
      aisensy: "Email, Chat",
      interakt: "Email, Chat",
      doubletick: "Chat",
      gallabox: "Email, Chat",
      gupshup: "Email, Chat",
    },
  },
  {
    label: "Free trial",
    values: {
      wati: "7 days",
      aisensy: "14 days",
      interakt: "14 days",
      doubletick: false,
      gallabox: "7 days",
      gupshup: false,
    },
  },
  {
    label: "Chatbots included",
    values: {
      wati: "Unlimited",
      aisensy: "₹2,500 for 5",
      interakt: "6 free",
      doubletick: "Unlimited",
      gallabox: "10 free",
      gupshup: "5 free",
    },
  },
  {
    label: "Non-template chatbot replies",
    values: {
      wati: false,
      aisensy: false,
      interakt: false,
      doubletick: false,
      gallabox: false,
      gupshup: false,
    },
  },
  {
    label: "Quick replies",
    values: {
      wati: "Text",
      aisensy: "Text",
      interakt: "Text",
      doubletick: "Text",
      gallabox: "Text",
      gupshup: "Text, Buttons",
    },
  },
  {
    label: "Carousel in service messages",
    values: {
      wati: false,
      aisensy: false,
      interakt: false,
      doubletick: false,
      gallabox: false,
      gupshup: false,
    },
  },
  {
    label: "WhatsApp numbers",
    values: {
      wati: "Not stated",
      aisensy: "Not stated",
      interakt: "Not stated",
      doubletick: "Not stated",
      gallabox: "Not stated",
      gupshup: "Not stated",
    },
  },
  {
    label: "Agent accounts",
    values: {
      wati: "5",
      aisensy: "5",
      interakt: "Unlimited",
      doubletick: "10",
      gallabox: "10",
      gupshup: false,
    },
  },
  {
    label: "Drag-and-drop WhatsApp forms",
    values: {
      wati: false,
      aisensy: false,
      interakt: false,
      doubletick: false,
      gallabox: false,
      gupshup: false,
    },
  },
  {
    label: "Drip campaigns",
    values: {
      wati: true,
      aisensy: false,
      interakt: false,
      doubletick: false,
      gallabox: true,
      gupshup: false,
    },
  },
  {
    label: "Smart analytics",
    values: {
      wati: false,
      aisensy: false,
      interakt: false,
      doubletick: false,
      gallabox: true,
      gupshup: false,
    },
  },
  {
    label: "AI agents",
    values: {
      wati: true,
      aisensy: true,
      interakt: false,
      doubletick: false,
      gallabox: false,
      gupshup: true,
    },
  },
  {
    label: "Chat link & QR generation",
    values: {
      wati: true,
      aisensy: true,
      interakt: true,
      doubletick: false,
      gallabox: false,
      gupshup: true,
    },
  },
  {
    label: "Notes on a conversation",
    values: {
      wati: true,
      aisensy: false,
      interakt: false,
      doubletick: false,
      gallabox: false,
      gupshup: false,
    },
  },
  {
    label: "Dedicated account manager",
    values: {
      wati: "Top plan only",
      aisensy: "Top plan only",
      interakt: "Top plan only",
      doubletick: "Top plan only",
      gallabox: "Top plan only",
      gupshup: "Top plan only",
    },
  },
  {
    label: "Full API access",
    values: {
      wati: true,
      aisensy: false,
      interakt: false,
      doubletick: false,
      gallabox: true,
      gupshup: true,
    },
  },
];

export interface OwnPlanPrices {
  /** The cheapest monthly plan on sale, already formatted. */
  entry: string;
  /** The dearest monthly plan on sale, already formatted. */
  top: string;
  trialDays: number;
}

/**
 * NeuraChat's own column, built from live data and the real feature set.
 *
 * Three of these are crosses. They are the features this product does not
 * have, and a table where one product wins every row is one nobody
 * believes — the gaps are what make the rest of it worth reading.
 */
export function ownColumn(prices: OwnPlanPrices): Record<string, Cell> {
  return {
    "Entry plan": prices.entry,
    "Top plan": prices.top,
    // Not a number, because there is no markup to quote: messages are
    // billed at Meta's own rate.
    "Marketing message cost": "At Meta's rate",
    "WhatsApp numbers": "1 - 5 by plan",
    "Support channels": "WhatsApp, Email, Chat",
    "Free trial": `${prices.trialDays} days`,
    "Chatbots included": "Unlimited",
    "Non-template chatbot replies": true,
    "Quick replies": "Text, Buttons, Lists",
    // No carousel support in the product. An honest cross.
    "Carousel in service messages": false,
    "Agent accounts": "1 - 15 by plan",
    "Drag-and-drop WhatsApp forms": true,
    "Drip campaigns": true,
    "Smart analytics": true,
    "AI agents": true,
    // Nothing in the product generates a wa.link or a QR code yet.
    "Chat link & QR generation": false,
    "Notes on a conversation": true,
    // Not offered, so not claimed.
    "Dedicated account manager": false,
    "Full API access": true,
  };
}

/** Picks the cheapest and dearest monthly plan, formatted for the table. */
export function ownPrices(
  tiers: Array<{ monthlyCents: number | null; currency: string }>,
  trialDays: number
): OwnPlanPrices {
  const monthly = tiers
    .map((tier) => ({ cents: tier.monthlyCents, currency: tier.currency || "INR" }))
    .filter((tier): tier is { cents: number; currency: string } => typeof tier.cents === "number");

  const format = (cents: number, currency: string) =>
    `${new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100)}/mo`;

  if (monthly.length === 0) {
    return { entry: "—", top: "—", trialDays };
  }

  const cheapest = monthly.reduce((low, tier) => (tier.cents < low.cents ? tier : low));
  const dearest = monthly.reduce((high, tier) => (tier.cents > high.cents ? tier : high));

  return {
    entry: format(cheapest.cents, cheapest.currency),
    top: format(dearest.cents, dearest.currency),
    trialDays,
  };
}
