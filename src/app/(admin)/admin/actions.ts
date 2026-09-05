"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export async function assignPlan(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const orgId = String(formData.get("org_id") ?? "");
  const planId = String(formData.get("plan_id") ?? "");
  if (!orgId || !planId) return { ok: false, error: "Organization and plan are required." };

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const supabase = await createClient();
  const { error } = await supabase.from("subscriptions").upsert(
    {
      org_id: orgId,
      plan_id: planId,
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: periodEnd.toISOString(),
    },
    { onConflict: "org_id" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/organizations");
  return { ok: true, message: "Plan assigned." };
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
