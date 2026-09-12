"use server";

import { revalidatePath } from "next/cache";
import type { SubscriptionStatus } from "@/types/admin";
import { ORG_ROLES, type OrgRole } from "@/types/database";
import { resolveFeatures, togglableKeys } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/org";
import type { ActionResult } from "@/app/(dashboard)/actions";

// requirePlatformAdmin() runs first in every action. It redirects rather than
// returning, so nothing below it executes for a non-staff caller — and RLS
// rejects the write regardless, since these tables require
// is_platform_admin().

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function savePlan(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const priceRupees = Number(formData.get("price") ?? 0);
  const interval = String(formData.get("billing_interval") ?? "monthly");
  const messageLimit = formData.get("message_limit");
  const contactLimit = formData.get("contact_limit");
  const seatLimit = formData.get("seat_limit");

  if (!name) return { ok: false, error: "Plan name is required." };
  if (!Number.isFinite(priceRupees) || priceRupees < 0) {
    return { ok: false, error: "Price must be a positive number." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("plans").upsert(
    {
      name,
      slug: slugify(name),
      // Prices are entered in rupees but stored in paise, so rounding
      // happens once here rather than drifting across screens.
      price_cents: Math.round(priceRupees * 100),
      billing_interval: interval as "monthly" | "yearly",
      message_limit: messageLimit ? Number(messageLimit) : null,
      contact_limit: contactLimit ? Number(contactLimit) : null,
      seat_limit: seatLimit ? Number(seatLimit) : null,
      is_active: true,
    },
    { onConflict: "slug" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/plans");
  return { ok: true, message: "Plan saved." };
}

export async function togglePlan(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("plans").update({ is_active: !isActive }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/plans");
  return { ok: true };
}

export async function saveAddOn(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const priceRupees = Number(formData.get("price") ?? 0);
  const description = String(formData.get("description") ?? "").trim();

  if (!name) return { ok: false, error: "Add-on name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("add_ons").upsert(
    {
      name,
      slug: slugify(name),
      description: description || null,
      price_cents: Math.round(priceRupees * 100),
      is_active: true,
    },
    { onConflict: "slug" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/add-ons");
  return { ok: true, message: "Add-on saved." };
}

export async function saveCoupon(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const discountType = String(formData.get("discount_type") ?? "percent");
  const discountValue = Number(formData.get("discount_value") ?? 0);
  const maxRedemptions = formData.get("max_redemptions");
  const expiresAt = String(formData.get("expires_at") ?? "").trim();

  if (!code) return { ok: false, error: "Coupon code is required." };
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { ok: false, error: "Discount value must be greater than zero." };
  }
  if (discountType === "percent" && discountValue > 100) {
    return { ok: false, error: "A percentage discount cannot exceed 100." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("coupons").upsert(
    {
      code,
      discount_type: discountType as "percent" | "fixed",
      // A fixed discount is money, so store it in paise like every other
      // amount; a percentage is a bare number.
      discount_value: discountType === "fixed" ? Math.round(discountValue * 100) : discountValue,
      max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      is_active: true,
    },
    { onConflict: "code" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/coupons");
  return { ok: true, message: "Coupon saved." };
}

export async function toggleCoupon(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("coupons").update({ is_active: !isActive }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/coupons");
  return { ok: true };
}

/** The values subscriptions.status accepts, in the order they are offered. */
const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "active",
  "trialing",
  "past_due",
  "cancelled",
  "expired",
];

export async function assignPlan(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const orgId = String(formData.get("org_id") ?? "");
  const planId = String(formData.get("plan_id") ?? "");
  if (!orgId || !planId) return { ok: false, error: "Organization and plan are required." };

  const status = SUBSCRIPTION_STATUSES.includes(
    String(formData.get("status") ?? "") as SubscriptionStatus
  )
    ? (String(formData.get("status")) as SubscriptionStatus)
    : "active";

  const supabase = await createClient();

  // How long the period runs comes from the plan, not from a constant. A
  // yearly plan assigned with a hardcoded month expires eleven months early,
  // and nothing on any screen would say why.
  const { data: plan } = await supabase
    .from("plans")
    .select("name, billing_interval")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) return { ok: false, error: "That plan no longer exists." };

  const start = new Date();
  const periodEnd = new Date(start);
  if (plan.billing_interval === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase.from("subscriptions").upsert(
    {
      org_id: orgId,
      plan_id: planId,
      status,
      current_period_start: start.toISOString(),
      // A cancelled or expired subscription has no future period to run to.
      current_period_end:
        status === "cancelled" || status === "expired" ? null : periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at: start.toISOString(),
    },
    { onConflict: "org_id" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/organizations");
  revalidatePath("/admin");

  return {
    ok: true,
    message:
      status === "cancelled" || status === "expired"
        ? `${plan.name} set to ${status}.`
        : `${plan.name} assigned, ${plan.billing_interval}, running to ${periodEnd.toLocaleDateString()}.`,
  };
}

export async function updateTicket(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "open");

  const supabase = await createClient();
  const { error } = await supabase
    .from("support_tickets")
    .update({ status: status as "open" | "pending" | "resolved" | "closed", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/tickets");
  return { ok: true, message: "Ticket updated." };
}

export async function savePlatformSetting(formData: FormData): Promise<ActionResult> {
  const user = await requirePlatformAdmin();

  const key = String(formData.get("key") ?? "").trim();
  const raw = String(formData.get("value") ?? "").trim();
  if (!key) return { ok: false, error: "Key is required." };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Value must be valid JSON, for example {\"enabled\": true}." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("platform_settings").upsert(
    {
      key,
      value: value as Record<string, unknown>,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "key" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true, message: "Setting saved." };
}

export async function recordOrder(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const orgId = String(formData.get("org_id") ?? "");
  const kind = String(formData.get("kind") ?? "subscription");
  const amountRupees = Number(formData.get("amount") ?? 0);
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "pending");

  if (!orgId) return { ok: false, error: "Organization is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("orders").insert({
    org_id: orgId,
    kind: kind as "subscription" | "onboarding_fee" | "add_on" | "other",
    description: description || null,
    amount_cents: Math.round(amountRupees * 100),
    status: status as "pending" | "paid" | "failed" | "refunded",
    paid_at: status === "paid" ? new Date().toISOString() : null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/orders");
  return { ok: true, message: "Order recorded." };
}

/**
 * Saves one section of the landing page.
 *
 * Sections are stored whole rather than field by field: the editor posts the
 * complete shape, so a save is one row and can never leave half a section
 * from the old copy and half from the new.
 */
export async function saveSiteSection(
  key: string,
  value: Record<string, unknown>
): Promise<ActionResult> {
  const user = await requirePlatformAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("site_content").upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "key" }
  );

  if (error) {
    return {
      ok: false,
      error: /relation|does not exist|schema cache/i.test(error.message)
        ? "The site_content table isn't there yet — run supabase/setup.sql in the Supabase SQL editor, then try again."
        : error.message,
    };
  }

  // The landing page and the metadata that reads the brand.
  revalidatePath("/", "layout");
  revalidatePath("/admin/landing");

  return { ok: true, message: "Saved. The landing page is updated." };
}

/** The roles org_members accepts, most privileged first. */

// --- user administration --------------------------------------------------
//
// Creating, suspending and deleting accounts all go through the Auth Admin
// API, which needs the service role. Every one of them refuses to act on the
// signed-in admin: locking yourself out of the platform you administer is a
// mistake with no in-product way back.

/** Creates an account and puts it in an organization. */
export async function createUserAccount(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const orgId = String(formData.get("org_id") ?? "").trim();
  const role = String(formData.get("role") ?? "member") as OrgRole;

  if (!email.includes("@")) return { ok: false, error: "That doesn't look like an email address." };
  if (password.length < 8) {
    return { ok: false, error: "Give them a password of at least 8 characters. They can change it later." };
  }
  if (!ORG_ROLES.includes(role)) return { ok: false, error: "Pick a role." };

  const admin = createAdminClient();

  // email_confirm skips the verification mail: an account made by staff is
  // one the person never asked for, so waiting on a link they will not click
  // would leave it unusable.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return {
      ok: false,
      error: /already|exists|registered/i.test(createError?.message ?? "")
        ? `${email} already has an account. Add them to an organization instead of creating a second one.`
        : (createError?.message ?? "The account could not be created."),
    };
  }

  // The signup trigger has already made them an organization of their own.
  // When a specific one was asked for, put them in that as well.
  if (orgId) {
    const supabase = await createClient();
    const { error: memberError } = await supabase
      .from("org_members")
      .upsert({ org_id: orgId, user_id: created.user.id, role }, { onConflict: "org_id,user_id" });

    if (memberError) {
      return {
        ok: false,
        error: `${email} was created, but adding them to that organization failed: ${memberError.message}`,
      };
    }
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/organizations");
  return { ok: true, message: `${email} created. Send them the password yourself — it is not emailed.` };
}

/** Blocks or restores sign-in. Reversible, unlike deleting. */
export async function setUserSuspended(formData: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();

  const userId = String(formData.get("user_id") ?? "");
  const suspend = String(formData.get("suspend") ?? "") === "true";

  if (!userId) return { ok: false, error: "No user given." };
  if (userId === me.id) return { ok: false, error: "You cannot suspend your own account." };

  const admin = createAdminClient();
  // A hundred years, which is Supabase's way of saying indefinite; "none"
  // lifts it.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: suspend ? "876000h" : "none",
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return {
    ok: true,
    message: suspend
      ? "Suspended. They cannot sign in; their data is untouched."
      : "Restored. They can sign in again.",
  };
}

/**
 * Deletes an account outright.
 *
 * org_members cascades from auth.users, so this also removes every
 * membership. The organizations themselves survive — an org whose last
 * member is deleted keeps its conversations, and someone has to be able to
 * put a new owner in it.
 */
export async function deleteUserAccount(formData: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return { ok: false, error: "No user given." };
  if (userId === me.id) return { ok: false, error: "You cannot delete your own account." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  revalidatePath("/admin/organizations");
  return { ok: true, message: "Account deleted." };
}

/** Takes someone out of one organization without touching their account. */
export async function removeMembership(formData: FormData): Promise<ActionResult> {
  const me = await requirePlatformAdmin();

  const orgId = String(formData.get("org_id") ?? "");
  const userId = String(formData.get("user_id") ?? "");
  if (!orgId || !userId) return { ok: false, error: "No membership given." };
  if (userId === me.id) return { ok: false, error: "You cannot remove your own membership." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_members")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true, message: "Removed from that organization. The account still exists." };
}

/** How many days a new workspace gets before it has to pay. */
export async function saveTrialLength(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const days = Number(formData.get("trial_days"));
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { ok: false, error: "Give a whole number of days between 1 and 365." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("platform_settings").upsert(
    {
      key: "billing",
      value: { trial_days: days },
      description: "Length of the free trial given to a new workspace, in days",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/plans");
  revalidatePath("/admin/settings");
  return {
    ok: true,
    message: `New workspaces now get ${days} days. Trials already running keep the length they started with.`,
  };
}

// --- feature access -------------------------------------------------------

/**
 * Switches features on or off for one workspace.
 *
 * The form posts a checkbox per togglable feature, so what arrives is the
 * complete new state rather than a diff — an unticked box sends nothing,
 * which is exactly how "off" has to be expressed over a form post.
 *
 * Only keys that differ from what the plan already gives are stored. An
 * override that agrees with the plan is noise: it would go on overriding
 * after the customer changed tier, which is never what anyone meant.
 */
export async function saveOrgFeatures(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!orgId) return { ok: false, error: "No organization selected." };

  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, subscriptions(plans(feature_keys))")
    .eq("id", orgId)
    .maybeSingle();

  if (!org) return { ok: false, error: "That organization no longer exists." };

  const subscription = Array.isArray(org.subscriptions)
    ? (org.subscriptions[0] as { plans?: { feature_keys?: unknown } | null } | undefined)
    : (org.subscriptions as { plans?: { feature_keys?: unknown } | null } | null | undefined);

  const fromPlan = resolveFeatures({ plan: subscription?.plans?.feature_keys });
  const ticked = new Set(formData.getAll("features").map((key) => String(key)));

  const overrides: Record<string, boolean> = {};
  for (const key of togglableKeys()) {
    const wanted = ticked.has(key);
    if (wanted !== fromPlan[key]) overrides[key] = wanted;
  }

  const { error } = await supabase
    .from("organizations")
    .update({ feature_overrides: overrides })
    .eq("id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/organizations");
  // Every screen the customer sees is decided by this, so their whole
  // workspace is stale until it is re-rendered.
  revalidatePath("/", "layout");

  const count = Object.keys(overrides).length;
  return {
    ok: true,
    message: count === 0 ? "Back to exactly what the plan includes." : `${count} override${count === 1 ? "" : "s"} saved.`,
  };
}

/** The features a new workspace starts with, before any plan applies. */
export async function saveDefaultFeatures(formData: FormData): Promise<ActionResult> {
  const admin = await requirePlatformAdmin();

  const ticked = new Set(formData.getAll("features").map((key) => String(key)));
  const value: Record<string, boolean> = {};
  for (const key of togglableKeys()) {
    // Only the offs are stored. Everything is on by default, so a stored
    // "true" says nothing and would have to be maintained forever.
    if (!ticked.has(key)) value[key] = false;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("platform_settings").upsert(
    {
      key: "feature_defaults",
      value,
      description: "Features a new workspace starts with. Only the ones switched off are listed.",
      updated_at: new Date().toISOString(),
      updated_by: admin.id,
    },
    { onConflict: "key" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { ok: true, message: "Defaults saved. Existing workspaces keep what they have." };
}

/** What a plan includes. Empty means everything. */
export async function savePlanFeatures(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const planId = String(formData.get("plan_id") ?? "").trim();
  if (!planId) return { ok: false, error: "No plan selected." };

  const all = togglableKeys();
  const ticked = all.filter((key) =>
    formData.getAll("features").map((value) => String(value)).includes(key)
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from("plans")
    // Everything ticked is stored as [] — "no restriction" — so a tier that
    // includes the lot does not have to be edited every time a feature is
    // added to the product.
    .update({ feature_keys: ticked.length === all.length ? [] : ticked })
    .eq("id", planId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/plans");
  revalidatePath("/", "layout");
  return { ok: true, message: "Plan features saved." };
}

/**
 * Suspends a workspace, or lifts a suspension.
 *
 * Billing and Settings stay reachable either way: locking someone out of
 * the page that explains the problem is how a late payment becomes a lost
 * customer rather than a paying one.
 */
export async function setOrgSuspended(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!orgId) return { ok: false, error: "No organization selected." };

  const suspend = String(formData.get("suspend") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update(
      suspend
        ? { suspended_at: new Date().toISOString(), suspended_reason: reason || null }
        : { suspended_at: null, suspended_reason: null }
    )
    .eq("id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/organizations");
  revalidatePath("/", "layout");
  return { ok: true, message: suspend ? "Workspace suspended." : "Suspension lifted." };
}

/**
 * Changes what somebody can do inside a workspace.
 *
 * The last owner cannot be demoted. A workspace with no owner is one
 * nobody can invite to, bill, or delete — an unrecoverable state reached by
 * one careless dropdown.
 */
export async function setMemberRole(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const orgId = String(formData.get("org_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!orgId || !userId) return { ok: false, error: "No membership selected." };
  if (!ORG_ROLES.includes(role as OrgRole)) return { ok: false, error: "Unknown role." };

  const supabase = await createClient();

  if (role !== "owner") {
    const { data: owners } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("role", "owner");

    const others = (owners ?? []).filter((owner) => owner.user_id !== userId);
    if ((owners ?? []).some((owner) => owner.user_id === userId) && others.length === 0) {
      return {
        ok: false,
        error:
          "This is the workspace's only owner. Make somebody else an owner first, or the workspace ends up with nobody who can manage it.",
      };
    }
  }

  const { error } = await supabase
    .from("org_members")
    .update({ role: role as OrgRole })
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true, message: `Role set to ${role}.` };
}
