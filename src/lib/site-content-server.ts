import "server-only";

import { createClient } from "@/lib/supabase/server";
import { buildSiteContent, DEFAULT_SITE_CONTENT, type SiteContent } from "@/lib/site-content";
import { currentBrand } from "@/lib/brand-server";
import { wordmark, type BrandIdentity } from "@/lib/brand";
import {
  buildPricingTiers,
  DEFAULT_TIERS,
  type PlanRow,
  type PricingTier,
} from "@/lib/pricing";

/** Matches the default in public.trial_days(). */
import { DEFAULT_TRIAL_DAYS } from "@/lib/trial";

/**
 * The site content exactly as it is stored, with no brand over it.
 *
 * Only the admin editor wants this. Everything else wants what the
 * visitor should actually see, which is loadSiteContent below.
 */
export async function loadSiteContentRaw(): Promise<SiteContent> {
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
 * The content this visitor should see, with the agency's brand over it.
 *
 * The overlay is applied here, in the one function every page already
 * calls, rather than at each of the seven call sites. A white label that
 * has to be remembered page by page is a white label that shows the
 * platform's logo on the eighth page somebody adds — and the person who
 * finds that is the agency's customer.
 *
 * Never throws and never returns nothing. The marketing site is the first
 * thing anyone sees, and a database that is unreachable, unmigrated or empty
 * has to render it exactly as before rather than showing a blank page — so
 * every failure here falls through to the defaults.
 */
export async function loadSiteContent(): Promise<SiteContent> {
  const [content, brand] = await Promise.all([loadSiteContentRaw(), currentBrand()]);
  return brand ? withBrand(content, brand) : content;
}

/**
 * The platform's content wearing the agency's name.
 *
 * What is replaced and what is kept is the whole question. Replaced:
 * anything that identifies the platform — the name, the logo, the icon,
 * the tab title. Kept: the words about what the product does, which are
 * true whoever is selling it.
 *
 * The contact details are replaced even when the agency has left them
 * empty, and that is deliberate: falling back to the platform's own
 * WhatsApp number would put the agency's customers through to the
 * platform owner, which is the one failure a white label must not have.
 */
function withBrand(content: SiteContent, brand: BrandIdentity): SiteContent {
  return {
    ...content,
    brand: {
      ...content.brand,
      name: brand.name,
      nameAccent: brand.nameAccent,
      // Empty renders the wordmark, which is the right fallback: an
      // agency with no logo yet gets its own name, never the platform's
      // logo.
      logoUrl: brand.logoUrl,
      faviconUrl: brand.faviconUrl,
      siteTitle: brand.siteTitle || wordmark(brand),
      siteDescription: brand.siteDescription || content.brand.siteDescription,
      whatsappNumber: brand.supportWhatsapp,
      demoUrl: "",
    },
  };
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
