// The price list, as the landing page needs it.
//
// The catalogue lives in one place — the `plans` table — because that is
// what Admin → Plans edits and what a subscription points at. The landing
// page used to carry its own hardcoded copy in dollars, which meant the
// price a visitor saw and the price they were actually charged were two
// unrelated numbers that drifted apart the moment either changed.
//
// Monthly and yearly are separate rows in that table (a subscription is on
// one or the other), so they are paired back up here by slug: "growth" and
// "growth-yearly" are one card with a toggle, not two cards.
//
// Pure by design: no fetch, no env, no server-only, so the client component
// can import the types and the whole thing can be tested. The loader lives
// in site-content-server.ts.

/** A row of the `plans` table, as far as pricing cares. */
export interface PlanRow {
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  currency: string | null;
  billing_interval: string | null;
  features: unknown;
  is_active?: boolean | null;
  sort_order?: number | null;
}

export interface PricingTier {
  /** The monthly plan's slug — "growth". Yearly is "growth-yearly". */
  slug: string;
  name: string;
  tagline: string;
  currency: string;
  /** Paise per month. Null when only a yearly row exists. */
  monthlyCents: number | null;
  /** Paise per year. Null when there is no yearly row for this tier. */
  yearlyCents: number | null;
  features: string[];
  popular: boolean;
}

/** The suffix that marks a yearly row of an otherwise monthly tier. */
const YEARLY_SUFFIX = "-yearly";

/**
 * The catalogue as seeded, in rupees.
 *
 * A fallback, not a placeholder: an unmigrated or unreachable database has
 * to render the real price list rather than an empty section or, worse, the
 * old dollar figures. Kept in step with
 * supabase/migrations/20260908090000_trials_and_pricing.sql.
 */
export const DEFAULT_TIERS: PricingTier[] = [
  {
    slug: "starter",
    name: "Starter",
    tagline: "For teams getting started on WhatsApp",
    currency: "INR",
    monthlyCents: 100000,
    yearlyCents: 800000,
    features: ["1,000 messages/mo", "500 contacts", "2 team seats", "1 WhatsApp number"],
    popular: false,
  },
  {
    slug: "growth",
    name: "Growth",
    tagline: "For growing teams running campaigns",
    currency: "INR",
    monthlyCents: 150000,
    yearlyCents: 1000000,
    features: [
      "10,000 messages/mo",
      "5,000 contacts",
      "10 team seats",
      "Campaigns & automations",
    ],
    popular: true,
  },
  {
    slug: "scale",
    name: "Scale",
    tagline: "High volume, multiple numbers",
    currency: "INR",
    monthlyCents: 200000,
    yearlyCents: 1200000,
    features: [
      "100,000 messages/mo",
      "50,000 contacts",
      "50 team seats",
      "Priority support",
    ],
    popular: false,
  },
];

/** `features` is jsonb, so it arrives as whatever was stored. */
function readFeatures(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * Pairs monthly and yearly rows into one card each.
 *
 * Order follows `sort_order` on the row that supplies the monthly price,
 * which is what Admin → Plans reorders. Inactive plans are dropped: taking
 * a plan off sale should take it off the website.
 */
export function buildPricingTiers(rows: PlanRow[] | null | undefined): PricingTier[] {
  const live = (rows ?? []).filter((row) => row.is_active !== false);
  if (live.length === 0) return DEFAULT_TIERS;

  const byBase = new Map<string, PricingTier & { order: number }>();

  const baseOf = (slug: string) =>
    slug.endsWith(YEARLY_SUFFIX) ? slug.slice(0, -YEARLY_SUFFIX.length) : slug;

  for (const row of live) {
    const base = baseOf(row.slug);
    const yearly = row.billing_interval === "yearly";

    const tier = byBase.get(base) ?? {
      slug: base,
      name: row.name,
      tagline: row.description ?? "",
      currency: row.currency ?? "INR",
      monthlyCents: null,
      yearlyCents: null,
      features: [],
      popular: false,
      order: row.sort_order ?? 0,
    };

    if (yearly) {
      tier.yearlyCents = row.price_cents;
    } else {
      tier.monthlyCents = row.price_cents;
      // The monthly row is the canonical one for everything that is not a
      // price: it is the row Admin → Plans sorts, and the one a tier is
      // named after. A yearly-only tier keeps whatever it arrived with.
      tier.name = row.name;
      tier.tagline = row.description ?? tier.tagline;
      tier.order = row.sort_order ?? tier.order;
    }

    // Whichever row carries a feature list wins, monthly preferred — the
    // yearly copy tends to repeat it with "2 months free" appended, which
    // belongs on the yearly price, not in the feature list.
    const features = readFeatures(row.features);
    if (features.length > 0 && (!yearly || tier.features.length === 0)) {
      tier.features = features;
    }

    byBase.set(base, tier);
  }

  const tiers = [...byBase.values()]
    .filter((tier) => tier.monthlyCents !== null || tier.yearlyCents !== null)
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...tier }) => tier);

  if (tiers.length === 0) return DEFAULT_TIERS;

  // The middle card carries the "Most popular" ribbon. Deriving it from the
  // position rather than storing a flag keeps it correct when a plan is
  // added or reordered, and never leaves two cards claiming it.
  const highlight = Math.floor((tiers.length - 1) / 2);
  return tiers.map((tier, index) => ({ ...tier, popular: index === highlight }));
}

/**
 * What a tier costs per month on the yearly plan, in paise.
 *
 * Both prices are shown as a monthly figure so the toggle compares like
 * with like; the annual total is spelled out underneath.
 */
export function monthlyEquivalent(tier: PricingTier): number | null {
  if (tier.yearlyCents === null) return null;
  return Math.round(tier.yearlyCents / 12);
}

/** Percent saved by paying yearly, rounded down. Null when it saves nothing. */
export function yearlySavingPercent(tier: PricingTier): number | null {
  if (tier.monthlyCents === null || tier.yearlyCents === null) return null;
  const full = tier.monthlyCents * 12;
  if (full <= 0 || tier.yearlyCents >= full) return null;
  return Math.floor(((full - tier.yearlyCents) / full) * 100);
}

/** The best saving on offer, for the badge next to the Yearly toggle. */
export function bestYearlySaving(tiers: PricingTier[]): number | null {
  const savings = tiers
    .map(yearlySavingPercent)
    .filter((value): value is number => value !== null);
  return savings.length > 0 ? Math.max(...savings) : null;
}

/** True when at least one tier can actually be bought yearly. */
export function hasYearly(tiers: PricingTier[]): boolean {
  return tiers.some((tier) => tier.yearlyCents !== null);
}
