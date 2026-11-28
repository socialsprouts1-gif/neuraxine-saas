"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/org";
import { mayEditBrand } from "@/lib/brand-access";
import { domainProblem, hostKey, slugProblem, parseHex } from "@/lib/brand";
import { customDomainProblem, type DnsInstruction, type DomainState } from "@/lib/custom-domain";
import { attachDomain, detachDomain, domainStatus } from "@/lib/vercel-domains";
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


// --- the agency's own domain ----------------------------------------------
//
// The three-step dance this replaces: the agency points DNS, somebody at
// the platform opens the hosting dashboard and adds the domain, then
// somebody at the platform pastes it into the brand. The middle step is
// the one that fails — every agency waits on one person being at a
// computer, and it is the step that gets forgotten for a week.

export interface DomainActionResult extends ActionResult {
  state?: DomainState;
  instruction?: DnsInstruction;
  domain?: string;
}

/** The platform's own address, which no agency may claim. */
const PLATFORM_DOMAIN = process.env.PLATFORM_ROOT_DOMAIN ?? "";

/**
 * Claims a domain for a brand and attaches it to the hosting project.
 *
 * Written to the brand first and attached second. The other order would
 * mean a domain live on the hosting project that no brand answers for —
 * which serves the platform's own site on the agency's address, under
 * the platform's name, to the agency's customers.
 */
export async function claimDomain(formData: FormData): Promise<DomainActionResult> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "No brand selected." };
  if (!(await mayEditBrand(id))) return { ok: false, error: "That is not your brand to edit." };

  const raw = String(formData.get("domain") ?? "").trim();
  const bad = customDomainProblem(raw, PLATFORM_DOMAIN);
  if (bad) return { ok: false, error: bad };

  const domain = hostKey(raw);
  const admin = createAdminClient();

  // Taken by somebody else is a refusal, not a race. The unique index
  // would catch it anyway; saying which is kinder than a constraint name.
  const { data: taken } = await admin
    .from("brands")
    .select("id")
    .eq("domain", domain)
    .neq("id", id)
    .maybeSingle();

  if (taken) return { ok: false, error: "Another brand is already using that domain." };

  const { error } = await admin.from("brands").update({ domain }).eq("id", id);
  if (error) return { ok: false, error: friendly(error.message) };

  const result = await attachDomain(domain);

  revalidatePath("/agency");
  revalidatePath("/admin/brands");

  return {
    ok: true,
    domain,
    state: result.state,
    instruction: result.instruction,
    message: result.problem
      ? `Saved. ${result.problem}`
      : result.state === "live"
        ? `${domain} is live.`
        : `Saved. Add the record below at your domain provider, then press Check again.`,
  };
}

/** Where the domain has got to, for the Check again button. */
export async function checkDomain(formData: FormData): Promise<DomainActionResult> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "No brand selected." };
  if (!(await mayEditBrand(id))) return { ok: false, error: "That is not your brand to check." };

  const { data: brand } = await createAdminClient()
    .from("brands")
    .select("domain")
    .eq("id", id)
    .maybeSingle();

  if (!brand?.domain) return { ok: false, error: "No domain set up yet." };

  const result = await domainStatus(brand.domain);
  revalidatePath("/agency");

  return {
    ok: true,
    domain: brand.domain,
    state: result.state,
    instruction: result.instruction,
    message:
      result.problem ??
      (result.state === "live"
        ? `${brand.domain} is live. Send your customers there.`
        : "Not pointing here yet. DNS changes can take a few hours — this is normal."),
  };
}

/** Lets go of a domain, for a typo or a move. */
export async function releaseDomain(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "No brand selected." };
  if (!(await mayEditBrand(id))) return { ok: false, error: "That is not your brand to edit." };

  const admin = createAdminClient();
  const { data: brand } = await admin.from("brands").select("domain").eq("id", id).maybeSingle();
  if (!brand?.domain) return { ok: true, message: "Nothing to remove." };

  // Off the brand first, for the same reason as above: between the two
  // writes the domain must never resolve to the platform's own site.
  const { error } = await admin.from("brands").update({ domain: null }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  const removed = await detachDomain(brand.domain);

  revalidatePath("/agency");
  revalidatePath("/admin/brands");

  return removed.ok
    ? { ok: true, message: `${brand.domain} removed.` }
    : { ok: true, message: `Removed from your brand. ${removed.problem}` };
}
