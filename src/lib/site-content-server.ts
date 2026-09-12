import "server-only";

import { createClient } from "@/lib/supabase/server";
import { buildSiteContent, DEFAULT_SITE_CONTENT, type SiteContent } from "@/lib/site-content";
import {
  buildPricingTiers,
  DEFAULT_TIERS,
  type PlanRow,
  type PricingTier,
} from "@/lib/pricing";

/** Matches the default in public.trial_days(). */
const DEFAULT_TRIAL_DAYS = 14;

/**
 * The landing page's content, defaults where nothing is saved.
 *
 * Never throws and never returns nothing. The marketing site is the first
 * thing anyone sees, and a database that is unreachable, unmigrated or empty
 * has to render it exactly as before rather than showing a blank page — so
 * every failure here falls through to the defaults.
 */
export async function loadSiteContent(): Promise<SiteContent> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("site_content").select("key, value");
    if (error || !data) return DEFAULT_SITE_CONTENT;
    return buildSiteContent(data);
  } catch {
    return DEFAULT_SITE_CONTENT;
  }
}

/**
 * The live price list, and how long a new workspace gets for free.
 *
 * Same contract as loadSiteContent: never throws, never returns nothing.
 * A database that has not run the pricing migration still renders the real
 * catalogue, because the fallback is the catalogue rather than a placeholder.
 */
export async function loadPricing(): Promise<{ tiers: PricingTier[]; trialDays: number }> {
  try {
    const supabase = await createClient();
    const [plans, settings] = await Promise.all([
      supabase
        .from("plans")
        .select("name, slug, description, price_cents, currency, billing_interval, features, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("platform_settings").select("value").eq("key", "billing").maybeSingle(),
    ]);

    const trial = (settings.data?.value as { trial_days?: number } | null)?.trial_days;
    return {
      tiers: buildPricingTiers(plans.error ? null : (plans.data as PlanRow[] | null)),
      trialDays: typeof trial === "number" && trial > 0 ? trial : DEFAULT_TRIAL_DAYS,
    };
  } catch {
    return { tiers: DEFAULT_TIERS, trialDays: DEFAULT_TRIAL_DAYS };
  }
}
