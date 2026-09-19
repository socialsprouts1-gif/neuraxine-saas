// Turning a flat list of plan rows into a pricing table.
//
// Every interval is its own row in the database — Starter monthly and
// Starter yearly are two plans, not one plan with two prices — and the
// billing screen rendered that literally: six rows, the same three names
// twice, each with a price and no way to tell which two were the same
// thing. Nobody shops that way. What a person wants is three tiers and a
// switch.
//
// Pure, because the pairing is the part that can go quietly wrong: a tier
// that loses its yearly twin should degrade to "monthly only" rather than
// vanish, and a saving quoted at the wrong percentage is a lie about
// money.

export type PlanInterval = "monthly" | "yearly";

export interface PlanOption {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  interval: PlanInterval;
  /** Marketing bullets, as the plan row carries them. */
  features: string[];
  messageLimit: number | null;
  contactLimit: number | null;
  seatLimit: number | null;
  isCurrent: boolean;
}

export interface PlanTier {
  /** "Starter". The name is what pairs the two intervals. */
  name: string;
  description: string | null;
  features: string[];
  monthly: PlanOption | null;
  yearly: PlanOption | null;
}

/**
 * Groups plans into tiers, keeping the order they arrived in.
 *
 * Paired on the name, because that is the only field the two rows of a
 * tier reliably share — slugs tend to carry the interval in them, and ids
 * never match. Order is taken from first appearance so the database's
 * sort_order still decides which tier is leftmost.
 */
export function groupPlans(plans: readonly PlanOption[]): PlanTier[] {
  const tiers = new Map<string, PlanTier>();

  for (const plan of plans) {
    const key = plan.name.trim().toLowerCase();
    const tier =
      tiers.get(key) ??
      ({
        name: plan.name.trim(),
        description: null,
        features: [],
        monthly: null,
        yearly: null,
      } satisfies PlanTier);

    // First non-empty wins for the shared copy: the two rows usually carry
    // the same description and bullets, and where only one has been filled
    // in, showing it beats showing nothing.
    if (!tier.description && plan.description?.trim()) tier.description = plan.description.trim();
    if (tier.features.length === 0 && plan.features.length > 0) tier.features = plan.features;

    if (plan.interval === "yearly") tier.yearly ??= plan;
    else tier.monthly ??= plan;

    tiers.set(key, tier);
  }

  return [...tiers.values()];
}

/** The plan to charge for, at the interval being shown. */
export function planFor(tier: PlanTier, interval: PlanInterval): PlanOption | null {
  return interval === "yearly" ? (tier.yearly ?? tier.monthly) : (tier.monthly ?? tier.yearly);
}

/**
 * What a year costs against twelve months of the monthly price, as a
 * percentage saved.
 *
 * Null unless both prices exist and the yearly one is genuinely cheaper —
 * a "save 0%" badge is noise, and a negative one advertises the worse
 * deal. Rounded down so the number is never larger than the truth.
 */
export function yearlySaving(tier: PlanTier): number | null {
  const monthly = tier.monthly?.priceCents;
  const yearly = tier.yearly?.priceCents;
  if (!monthly || !yearly) return null;

  const twelve = monthly * 12;
  if (yearly >= twelve) return null;

  const percent = Math.floor(((twelve - yearly) / twelve) * 100);
  return percent > 0 ? percent : null;
}

/**
 * What a tier includes, when nobody has written marketing bullets.
 *
 * The limits are the honest answer and they are already in the row, so an
 * operator who has not filled in `features` still gets a card that says
 * what they are buying rather than an empty space under the price.
 */
export function limitLines(plan: PlanOption | null): string[] {
  if (!plan) return [];

  const count = (value: number | null, one: string, many: string) =>
    value === null ? `Unlimited ${many}` : `${value.toLocaleString()} ${value === 1 ? one : many}`;

  return [
    count(plan.messageLimit, "message a month", "messages a month"),
    count(plan.contactLimit, "contact", "contacts"),
    count(plan.seatLimit, "team seat", "team seats"),
  ];
}
