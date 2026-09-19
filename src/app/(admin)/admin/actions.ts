"use server";

import { revalidatePath } from "next/cache";
import type { SubscriptionStatus } from "@/types/admin";
import { isOrgRole, roleChangeBlocked } from "@/lib/member-role";
import { resolveFeatures, togglableKeys } from "@/lib/features";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/org";
import { isPaymentProvider } from "@/lib/provider-meta";
import { emailTransportName, isEmailConfigured, sendEmail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email-templates";
import { planBroadcast, explainSkip, BROADCAST_KIND } from "@/lib/broadcast";
import { sweepBillingEmails } from "@/lib/billing-emails";
import { readTrialDays } from "@/lib/trial";
import type { ActionResult } from "@/app/(dashboard)/actions";

// requirePlatformAdmin() runs first in every action. It redirects rather than
// returning, so nothing below it executes for a non-staff caller.
//
// The platform's own tables (plans, coupons, settings, orders, tickets) have
// RLS policies that require is_platform_admin(), so the ordinary client is
// enough for those and the database is a second line of defence. Anything
// reaching into a customer's workspace — organizations, org_members — uses
// the service role instead, because those policies ask for membership of
// that workspace, which staff do not have. requirePlatformAdmin() above is
// the only check on those, so it is not optional in any of them.

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

  // Service role: subscriptions already allows a platform admin, but the
  // upsert reads the plan and writes a row for a workspace this client
  // cannot otherwise see.
  const supabase = createAdminClient();

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

/**
 * Names the workspace and gateway that take the platform's own money.
 *
 * Written as the same platform_payment_org key the raw editor sets, so
 * nothing downstream has to know which screen set it — this just refuses
 * the values that would fail later. A workspace whose gateway is not
 * actually connected is the exact outage this replaces, and saving it
 * would put the product back there with a friendlier form.
 */
export async function savePlatformGateway(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const [orgId, provider] = String(formData.get("target") ?? "").split(":");
  if (!orgId || !provider) return { ok: false, error: "Pick a workspace and gateway." };
  if (!isPaymentProvider(provider)) {
    return { ok: false, error: `${provider} is not a payment gateway this app can charge through.` };
  }

  const supabase = createAdminClient();

  // Checked against the live connection rather than trusted from the form:
  // the option list is a snapshot, and a gateway disconnected between the
  // page rendering and the save would otherwise be stored as the answer.
  const { data: integration } = await supabase
    .from("org_integrations")
    .select("status")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();

  if (!integration || integration.status !== "connected") {
    return {
      ok: false,
      error: `That workspace no longer has ${provider} connected. Reconnect it under Integrations, then choose it here.`,
    };
  }

  const { error } = await supabase.from("platform_settings").upsert(
    { key: "platform_payment_org", value: { org_id: orgId, provider } },
    { onConflict: "key" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved. Self-serve checkout will charge through that gateway." };
}

/**
 * The length of the free trial, as a number rather than a JSON document.
 *
 * Merged into whatever else the billing setting holds, so a form that
 * knows about one key cannot wipe another one it has never heard of.
 */
export async function saveTrialDays(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const days = Number(formData.get("trial_days"));
  if (!Number.isInteger(days) || days < 0 || days > 90) {
    return { ok: false, error: "Give a whole number of days between 0 and 90." };
  }

  return mergeSetting("billing", { trial_days: days }, "Trial length saved.");
}

export async function saveBranding(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const productName = String(formData.get("product_name") ?? "").trim();
  const supportEmail = String(formData.get("support_email") ?? "").trim();

  if (!productName) return { ok: false, error: "The product needs a name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(supportEmail)) {
    return { ok: false, error: "That support address does not look like an email." };
  }

  return mergeSetting(
    "branding",
    { product_name: productName, support_email: supportEmail },
    "Branding saved."
  );
}

export async function saveSignups(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  return mergeSetting(
    "signups",
    {
      // An unchecked box sends nothing at all, which is the whole reason
      // these read presence rather than a value.
      enabled: formData.get("enabled") !== null,
      require_onboarding_fee: formData.get("require_onboarding_fee") !== null,
    },
    "Signup settings saved."
  );
}

/**
 * What role the person who creates a workspace is given.
 *
 * Owner by default, and that default is not arbitrary: owner and admin are
 * the roles allowed to connect a WhatsApp number, open billing and add
 * integrations. A workspace whose only member is a plain member cannot be
 * set up by the person who just signed up for it — they would have to ask
 * support before sending a single message, part-way into a seven-day trial.
 *
 * It is settable anyway, because who may administer a workspace is a policy
 * decision rather than a fact about the software. The database reads the
 * same setting through signup_role(), so both paths that create a
 * workspace agree.
 */
export async function saveSignupRole(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const role = String(formData.get("default_role") ?? "").trim();
  if (!isOrgRole(role)) return { ok: false, error: "Pick one of owner, admin or member." };

  return mergeSetting(
    "signups",
    { default_role: role },
    role === "owner"
      ? "New workspaces are created by an owner."
      : `New workspaces are created by a ${role}. Existing ones keep the roles they have.`
  );
}

/**
 * Writes some keys of a setting, leaving the rest alone.
 *
 * Replacing the whole value would mean a form that knows about two fields
 * silently deleting a third somebody added by hand — which is exactly the
 * kind of loss the raw JSON editor made possible and these forms exist to
 * prevent.
 */
async function mergeSetting(
  key: string,
  patch: Record<string, unknown>,
  message: string
): Promise<ActionResult> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const current = (existing?.value as Record<string, unknown> | null) ?? {};

  const { error } = await supabase.from("platform_settings").upsert(
    { key, value: { ...current, ...patch }, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true, message };
}

/**
 * Sends one real email, to prove the configuration works.
 *
 * Diagnosing mail by registering accounts is slow and leaves rubbish
 * behind, and the welcome is deduped per workspace so the same account
 * cannot be used twice. This sends on demand, reports what the transport
 * actually said, and uses a fresh dedupe key every time so it can be run
 * as often as needed.
 */
export async function sendTestEmail(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  const to = String(formData.get("to") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return { ok: false, error: "Give an email address to send to." };
  }

  if (!isEmailConfigured()) {
    return {
      ok: false,
      error:
        "Email is not configured. Set EMAIL_FROM, plus either RESEND_API_KEY or all four SMTP_* variables, then redeploy — Vercel does not apply new variables to a build that already exists.",
    };
  }

  // The brand is no longer built here: sendEmail supplies one carrying the
  // uploaded logo, which is the whole point of testing with the real
  // template rather than a stand-in.

  // The configured length, not a guess: a test that promises a different
  // trial from the real welcome is a test that proves nothing.
  const { data: billing } = await createAdminClient()
    .from("platform_settings")
    .select("value")
    .eq("key", "billing")
    .maybeSingle();

  const result = await sendEmail({
    to,
    orgId: null,
    kind: "test",
    // Unique per attempt: a test that could only run once would be
    // useless the second time somebody changed a setting.
    dedupeKey: `test:${Date.now()}:${to}`,
    body: (withLogo) => welcomeEmail(withLogo, { trialDays: readTrialDays(billing?.value) }),
  });

  if (result.ok) {
    return {
      ok: true,
      message: `Sent to ${to} over ${emailTransportName()}. If it does not arrive, check spam first, then the provider's own logs — it left here successfully.`,
    };
  }

  return {
    ok: false,
    error:
      result.skipped === "not_configured"
        ? "Email is not configured on this deployment."
        : (result.error ?? "The message could not be sent."),
  };
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
  const role = String(formData.get("role") ?? "member");

  if (!email.includes("@")) return { ok: false, error: "That doesn't look like an email address." };
  if (password.length < 8) {
    return { ok: false, error: "Give them a password of at least 8 characters. They can change it later." };
  }
  if (!isOrgRole(role)) return { ok: false, error: "Pick a role." };

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
    // Service role: org_members_insert needs admin rights in that specific
    // workspace, which staff creating an account on somebody's behalf have
    // no reason to hold.
    const supabase = createAdminClient();
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

  // Service role: org_members_delete_admin needs membership of the target
  // workspace, which a platform admin does not have.
  const supabase = createAdminClient();
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

  // Merged rather than replaced. This used to write { trial_days } over the
  // whole billing setting, so saving a trial length from this screen
  // silently deleted every other key anybody had put in it.
  const result = await mergeSetting(
    "billing",
    { trial_days: days },
    `New workspaces now get ${days} days. Trials already running keep the length they started with.`
  );

  revalidatePath("/admin/plans");
  return result;
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

  // Service role: organizations_update is `using (is_org_admin(id))`, so
  // saving overrides for somebody else's workspace changed nothing and
  // still said it had.
  const supabase = createAdminClient();

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

  // Service role, for the same reason as the features above: suspending a
  // workspace the admin is not in was a no-op that reported success.
  const supabase = createAdminClient();
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
  if (!isOrgRole(role)) return { ok: false, error: "Unknown role." };

  // Service role. org_members_update is `using (is_org_admin(org_id))`, and
  // a platform admin is not a member of a customer's workspace — so this
  // update matched nothing, and an UPDATE that matches nothing is not an
  // error. The dropdown reported success and the role never changed.
  const supabase = createAdminClient();

  const { data: members, error: readError } = await supabase
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId);

  if (readError) return { ok: false, error: readError.message };

  const blocked = roleChangeBlocked(members ?? [], userId, role);
  if (blocked) return { ok: false, error: blocked };

  // .select() so the affected rows come back. Without it there is no way to
  // tell a change from a no-op, which is exactly how this failed silently
  // for as long as it did.
  const { data: changed, error } = await supabase
    .from("org_members")
    .update({ role })
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .select("user_id");

  if (error) return { ok: false, error: error.message };
  if (!changed || changed.length === 0) {
    return { ok: false, error: "Nothing was changed. That membership may have just been removed." };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/organizations");
  // What they can reach changes with the role, so their own screens are
  // stale until this re-renders.
  revalidatePath("/", "layout");
  return { ok: true, message: `Role set to ${role}.` };
}

/**
 * Sends the welcome to every workspace, once.
 *
 * Built because the welcome that went out before the sending domain was
 * verified landed in spam, so the people who signed up in that window
 * never really got one. It is a one-off catch-up, not something to reach
 * for often: identical mail to a whole list is how a new domain earns a
 * bad reputation, and the people on it have already had this message once.
 *
 * Counted as marketing, whatever the original was. A welcome somebody
 * receives because they just signed up is about their account; the same
 * words sent to everybody because an operator pressed a button is bulk
 * mail, so it carries an unsubscribe and honours the opt-out list.
 */
export async function sendWelcomeToEveryone(formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  // Mailing every customer cannot be undone, so it does not happen on a
  // stray click. The box is unticked every render.
  if (formData.get("confirm") === null) {
    return { ok: false, error: "Tick the box to confirm before sending." };
  }

  if (!isEmailConfigured()) {
    return { ok: false, error: "Email is not configured on this deployment, so nothing was sent." };
  }

  const admin = createAdminClient();

  const [{ data: orgs, error: orgError }, { data: optOuts }] = await Promise.all([
    admin.from("organizations").select("id, name, suspended_at").order("created_at"),
    admin.from("email_optouts").select("email"),
  ]);

  if (orgError) return { ok: false, error: orgError.message };
  if (!orgs || orgs.length === 0) return { ok: false, error: "There are no workspaces to write to." };

  // Resolved before planning, so the plan can say "nobody to write to"
  // rather than discovering it halfway through a send.
  const withEmail = await Promise.all(
    orgs.map(async (org) => ({
      id: org.id,
      name: org.name,
      suspendedAt: org.suspended_at,
      email: await recipientFor(admin, org.id),
    }))
  );

  const plan = planBroadcast(
    withEmail,
    (optOuts ?? []).map((row) => row.email),
    new Date()
  );

  const trialDays = readTrialDays(
    (await admin.from("platform_settings").select("value").eq("key", "billing").maybeSingle()).data
      ?.value
  );

  let sent = 0;
  let duplicate = 0;
  const failures: string[] = [];

  for (const target of plan.send) {
    const outcome = await sendEmail({
      to: target.email,
      orgId: target.orgId,
      kind: BROADCAST_KIND,
      dedupeKey: target.dedupeKey,
      body: (brand) => welcomeEmail(brand, { trialDays }),
    });

    if (outcome.ok && outcome.skipped === "duplicate") duplicate += 1;
    else if (outcome.ok && !outcome.skipped) sent += 1;
    else if (!outcome.ok) failures.push(`${target.email}: ${outcome.error ?? outcome.skipped}`);
  }

  revalidatePath("/admin/emails");

  // Said plainly, because "done" on a send to every customer is not an
  // answer anybody can act on.
  const parts = [`Sent ${sent} welcome${sent === 1 ? "" : "s"}.`];
  if (duplicate > 0) parts.push(`${duplicate} already went today.`);
  if (plan.skipped.length > 0) {
    const reasons = plan.skipped
      .map((row) => `${row.name} (${explainSkip(row.why)})`)
      .slice(0, 6)
      .join(", ");
    parts.push(`Skipped ${plan.skipped.length}: ${reasons}.`);
  }
  if (failures.length > 0) parts.push(`Failed ${failures.length}: ${failures.slice(0, 3).join("; ")}`);

  return failures.length > 0 && sent === 0
    ? { ok: false, error: parts.join(" ") }
    : { ok: true, message: `${parts.join(" ")} The email log has what each provider said.` };
}

/**
 * Who to write to for a workspace.
 *
 * The owner, or any member when there is no owner — a workspace whose
 * signup role was set to something else has members and no owner, and
 * skipping it would be skipping a real customer over a setting.
 */
async function recipientFor(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<string | null> {
  const { data: members } = await admin
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId);

  if (!members || members.length === 0) return null;

  const first = members.find((member) => member.role === "owner") ?? members[0];

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("user_id", first.user_id)
    .maybeSingle();

  return profile?.email?.trim() || null;
}

/**
 * Runs the billing sweep now, instead of waiting for the cron.
 *
 * The countdown, the expiry notice and the follow-ups all fire once a day
 * from a schedule. On a seven-day trial the first of them is not due until
 * the sixth day, so for most of a week "no emails have arrived" and
 * "nothing is wired up" are indistinguishable from a mailbox. This settles
 * it in one press.
 *
 * Safe to press twice: every message the sweep sends is keyed to the
 * workspace, the period and the day, and the unique index refuses a repeat.
 */
export async function runBillingEmailsNow(_formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();

  if (!isEmailConfigured()) {
    return { ok: false, error: "Email is not configured on this deployment, so nothing was sent." };
  }

  const result = await sweepBillingEmails();
  revalidatePath("/admin/emails");

  if (result.checked === 0) {
    return {
      ok: true,
      message:
        "No workspace is on a trial or a paid plan, so there was nothing to check. Assign a plan or start a trial first.",
    };
  }

  const parts = [`Checked ${result.checked}.`];
  if (result.sent > 0) parts.push(`Sent ${result.sent}.`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped — already sent, or nobody to write to.`);
  if (result.failed > 0) parts.push(`${result.failed} failed; the email log has what the provider said.`);
  if (result.sent === 0 && result.failed === 0) {
    parts.push("Nothing was due today — that is the schedule working, not a fault.");
  }

  return { ok: true, message: parts.join(" ") };
}
