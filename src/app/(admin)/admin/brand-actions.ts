"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/org";
import { mayEditBrand } from "@/lib/brand-access";
import { domainProblem, hostKey, slugProblem, parseHex } from "@/lib/brand";
import type { ActionResult } from "@/app/(dashboard)/actions";

// Creating and editing agency front doors.
//
// Split into two actions on purpose, because two different people use
// them. The platform owner creates a brand, gives it a domain and decides
// who owns it — none of which an agency may touch, or an agency could
// point its brand at a competitor's domain or hand itself somebody else's
// workspaces. The agency edits how it looks, which is the whole of what
// they were sold.

/** Everything the agency may change about its own look. */
export async function saveBrandLook(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "No brand selected." };

  if (!(await mayEditBrand(id))) {
    return { ok: false, error: "That is not your brand to edit." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the brand a name." };

  const accent = String(formData.get("accent_hex") ?? "").trim();
  if (accent && !parseHex(accent)) {
    return { ok: false, error: "The colour has to be a hex code like #2F6BFF." };
  }

  const { error } = await createAdminClient()
    .from("brands")
    .update({
      name,
      name_accent: String(formData.get("name_accent") ?? "").trim(),
      logo_url: String(formData.get("logo_url") ?? "").trim(),
      favicon_url: String(formData.get("favicon_url") ?? "").trim(),
      accent_hex: accent.toUpperCase(),
      site_title: String(formData.get("site_title") ?? "").trim(),
      site_description: String(formData.get("site_description") ?? "").trim(),
      support_email: String(formData.get("support_email") ?? "").trim(),
      support_whatsapp: String(formData.get("support_whatsapp") ?? "").trim(),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/agency");
  revalidatePath("/admin/brands");
  return { ok: true, message: "Saved. The change is live on the brand's address now." };
}

/** Creating a brand, and the parts only the platform owner may set. */
export async function saveBrand(formData: FormData): Promise<ActionResult & { id?: string }> {
  await requirePlatformAdmin();

  const id = String(formData.get("id") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();

  const badSlug = slugProblem(slug);
  if (badSlug) return { ok: false, error: badSlug };
  if (!name) return { ok: false, error: "Give the brand a name." };

  const domainRaw = String(formData.get("domain") ?? "").trim();
  const badDomain = domainProblem(domainRaw);
  if (badDomain) return { ok: false, error: badDomain };
  const domain = domainRaw ? hostKey(domainRaw) : null;

  const admin = createAdminClient();

  const row = {
    slug,
    name,
    domain,
    is_active: formData.get("is_active") !== null,
  };

  if (id) {
    const { error } = await admin.from("brands").update(row).eq("id", id);
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath("/admin/brands");
    return { ok: true, id, message: "Saved." };
  }

  const { data, error } = await admin
    .from("brands")
    .insert({ ...row, name_accent: "", site_title: name })
    .select("id")
    .single();

  if (error) return { ok: false, error: friendly(error.message) };

  revalidatePath("/admin/brands");
  return {
    ok: true,
    id: data.id,
    message: `Created. It is live on ${slug}.<your domain> as soon as the wildcard domain is set up.`,
  };
}

/** Hands an agency the keys to their own brand, by email address. */
export async function addBrandOwner(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const brandId = String(formData.get("brand_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!brandId || !email) return { ok: false, error: "Pick a brand and give an email address." };

  const admin = createAdminClient();

  // The person has to have an account already. Creating one here would
  // mean inviting somebody by side effect of a dropdown, and an agency
  // owner who never set a password cannot sign in anyway.
  const { data: users, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) return { ok: false, error: listError.message };

  const user = users.users.find((entry) => (entry.email ?? "").toLowerCase() === email);
  if (!user) {
    return {
      ok: false,
      error: `No account with that email yet. Ask them to sign up first, then add them here.`,
    };
  }

  const { error } = await admin
    .from("brand_owners")
    .upsert({ brand_id: brandId, user_id: user.id }, { onConflict: "brand_id,user_id" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/brands");
  return { ok: true, message: `${email} can now manage this brand from /agency.` };
}

export async function removeBrandOwner(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const brandId = String(formData.get("brand_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  if (!brandId || !userId) return { ok: false, error: "Nothing to remove." };

  const { error } = await createAdminClient()
    .from("brand_owners")
    .delete()
    .eq("brand_id", brandId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/brands");
  return { ok: true, message: "Removed." };
}

/**
 * Postgres's unique-violation text, said the way somebody can act on it.
 *
 * "duplicate key value violates unique constraint brands_domain_key" is
 * true and useless.
 */
function friendly(message: string): string {
  if (/brands_domain_key/.test(message)) {
    return "Another brand already uses that domain.";
  }
  if (/brands_slug_key/.test(message)) {
    return "Another brand already uses that short name.";
  }
  if (/brands_slug_check/.test(message)) {
    return "The short name can only use lowercase letters, numbers and hyphens.";
  }
  return message;
}
