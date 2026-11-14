import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { hostKey, slugFromHost, type BrandIdentity } from "@/lib/brand";

// Resolving the request's brand, once per request.
//
// React's cache() rather than a module variable: a module variable is
// shared by every request the server is handling at that moment, which on
// a white-label product means one customer's logo appearing on another
// agency's login page. cache() is scoped to the single render.
//
// Never throws. A database that is unreachable, unmigrated, or has no
// brands at all has to serve the platform's own front door exactly as
// before — the alternative is that adding white label takes the whole
// product down for everybody who is not using it.

/**
 * The platform's own domain, for the acme.<root> fallback addresses.
 *
 * Set in Vercel. Without it, only exact custom-domain matches work, which
 * is a smaller feature but never a wrong one.
 */
const ROOT_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? "";

/** The cookie a preview link sets. Named so it is obvious in devtools. */
export const PREVIEW_COOKIE = "neura_brand_preview";

/**
 * How the brand was decided.
 *
 * It matters to more than curiosity. A brand reached through a preview
 * link is being looked at; a brand reached through its own domain is
 * being used. Anything that writes — recording which front door a new
 * workspace signed up through, above all — must only ever trust the
 * second, or somebody who clicked a preview link while signing up gets
 * quietly handed to an agency.
 */
export type BrandSource = "domain" | "preview";

export interface ResolvedBrand extends BrandIdentity {
  source: BrandSource;
}

/** The brand this request belongs to, or null for the platform's own. */
export const currentBrand = cache(async (): Promise<ResolvedBrand | null> => {
  const fromHost = await brandFromHost();
  if (fromHost) return fromHost;

  // Nothing matched the address. A preview link may still have asked for
  // one — the way to see a brand working before its domain exists.
  try {
    const id = (await cookies()).get(PREVIEW_COOKIE)?.value;
    if (!id) return null;

    const brand = await brandBy("id", id);
    return brand ? { ...brand, source: "preview" } : null;
  } catch {
    return null;
  }
});

/**
 * The brand this request's address names, ignoring any preview.
 *
 * Used by everything that writes something down. Kept separate rather
 * than passed as a flag, because the safe choice should be the one that
 * is easy to reach for.
 */
export const brandFromHost = cache(async (): Promise<ResolvedBrand | null> => {
  try {
    const host = hostKey((await headers()).get("host"));
    if (!host) return null;

    // The platform's own address, answered without touching the database.
    //
    // This is the host almost every request arrives on, and a query per
    // page load to learn something already known from a string compare is
    // a cost paid forever for a feature most visitors are not using.
    // hostKey has already dropped any www.
    if (ROOT_DOMAIN && host === hostKey(ROOT_DOMAIN)) return null;

    // The agency's own domain, which is the one the customer typed.
    const byDomain = await brandBy("domain", host);
    if (byDomain) return { ...byDomain, source: "domain" };

    // Then acme.<our domain>, which exists so a brand is reachable before
    // anybody has touched DNS for it.
    const slug = ROOT_DOMAIN ? slugFromHost(host, ROOT_DOMAIN) : null;
    if (!slug) return null;

    const bySlug = await brandBy("slug", slug);
    return bySlug ? { ...bySlug, source: "domain" } : null;
  } catch {
    return null;
  }
});

const COLUMNS =
  "id, slug, domain, name, name_accent, logo_url, favicon_url, accent_hex, site_title, site_description, support_email, support_whatsapp";

/** One brand by an exact match on one column, or null for anything at all. */
async function brandBy(column: "id" | "slug" | "domain", value: string): Promise<BrandIdentity | null> {
  try {
    if (!value) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("brands")
      .select(COLUMNS)
      .eq(column, value)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      slug: data.slug,
      domain: data.domain,
      name: data.name,
      nameAccent: data.name_accent ?? "",
      logoUrl: data.logo_url ?? "",
      faviconUrl: data.favicon_url ?? "",
      accentHex: data.accent_hex ?? "",
      siteTitle: data.site_title ?? "",
      siteDescription: data.site_description ?? "",
      supportEmail: data.support_email ?? "",
      supportWhatsapp: data.support_whatsapp ?? "",
    };
  } catch {
    // Including the case where there is no brands table yet, which is
    // every deployment that has not run the database update.
    return null;
  }
}
