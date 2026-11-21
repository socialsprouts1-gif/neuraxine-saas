import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BrandIdentity } from "@/lib/brand";

// Who may edit which brand.
//
// Two answers, and they are different people: the platform owner, who may
// create brands and edit any of them, and an agency, who may edit the one
// they own and nothing else. Kept here so both the admin screen and the
// agency screen ask the same question rather than each writing its own
// slightly different check.

export interface BrandRow extends BrandIdentity {
  isActive: boolean;
  createdAt: string;
  /** How many workspaces came in through this door. */
  workspaces?: number;
}

export function toBrandRow(row: Record<string, unknown>): BrandRow {
  return {
    id: String(row.id),
    slug: String(row.slug ?? ""),
    domain: (row.domain as string | null) ?? null,
    name: String(row.name ?? ""),
    nameAccent: String(row.name_accent ?? ""),
    logoUrl: String(row.logo_url ?? ""),
    faviconUrl: String(row.favicon_url ?? ""),
    accentHex: String(row.accent_hex ?? ""),
    siteTitle: String(row.site_title ?? ""),
    siteDescription: String(row.site_description ?? ""),
    supportEmail: String(row.support_email ?? ""),
    supportWhatsapp: String(row.support_whatsapp ?? ""),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ""),
  };
}

/** The brands this signed-in user owns. Empty for everybody else. */
export async function brandsIOwn(): Promise<BrandRow[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    // Through the admin client, because brand_owners only lets a user see
    // their own rows and the join needs to read the brand itself.
    const admin = createAdminClient();
    const { data: owned } = await admin
      .from("brand_owners")
      .select("brand_id")
      .eq("user_id", user.id);

    const ids = (owned ?? []).map((row) => row.brand_id);
    if (ids.length === 0) return [];

    const { data } = await admin.from("brands").select("*").in("id", ids).order("created_at");
    return (data ?? []).map((row) => toBrandRow(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

/** Whether this user may edit this brand. Platform staff may edit any. */
export async function mayEditBrand(brandId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const admin = createAdminClient();

    const { data: staff } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (staff) return true;

    const { data: owner } = await admin
      .from("brand_owners")
      .select("brand_id")
      .eq("user_id", user.id)
      .eq("brand_id", brandId)
      .maybeSingle();

    return Boolean(owner);
  } catch {
    return false;
  }
}
