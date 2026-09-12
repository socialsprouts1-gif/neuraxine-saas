import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { featureForPath, resolveFeatures } from "@/lib/features";
import type { OrgRole } from "@/types/database";

export interface OrgContext {
  user: User;
  orgId: string;
  orgName: string;
  role: OrgRole;
  isPlatformAdmin: boolean;
  /** Every feature key mapped to whether this workspace may use it. */
  features: Record<string, boolean>;
  /** Set when platform staff have suspended the workspace. */
  suspended: { at: string; reason: string | null } | null;
}

// Resolves the signed-in user's organisation once per request. Pages call
// this instead of re-deriving membership, so the tenant boundary is
// established in exactly one place.
export async function requireOrg(): Promise<OrgContext> {
  // Next renders pages in parallel with their layout, so a layout-level
  // guard does not stop this from running. Check here too, or an
  // unconfigured deployment throws during prerender instead of redirecting.
  if (!isSupabaseConfigured()) redirect("/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: membership, error: membershipError } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  // A query error here is a schema problem, not an auth problem — almost
  // always the migrations haven't been applied. Sending the user back to
  // the login page for that reads as "wrong password", so say what it is.
  if (membershipError) {
    redirect(`/setup?reason=${encodeURIComponent(membershipError.message)}`);
  }

  // Authenticated but with no organization. This happens to accounts created
  // before the signup trigger existed, or if the trigger failed. Provision
  // one instead of bouncing them to the login screen with an error they have
  // no way to act on.
  const resolved = membership ?? (await provisionOrgForUser(user));

  if (!resolved) {
    redirect(
      `/setup?reason=${encodeURIComponent(
        "Your account has no organization and one could not be created automatically."
      )}`
    );
  }

  // Everything the rest of the request needs, in one round trip. Features
  // ride along here rather than being fetched per page: a page that has to
  // ask separately is a page somebody will forget to make ask.
  const [{ data: org }, { data: adminRow }, { data: defaults }] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "name, feature_overrides, suspended_at, suspended_reason, subscriptions(plans(feature_keys))"
      )
      .eq("id", resolved.org_id)
      .maybeSingle(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("platform_settings").select("value").eq("key", "feature_defaults").maybeSingle(),
  ]);

  // A subscription embeds as an array even when there is at most one.
  const subscription = Array.isArray(org?.subscriptions)
    ? (org.subscriptions[0] as { plans?: { feature_keys?: unknown } | null } | undefined)
    : (org?.subscriptions as { plans?: { feature_keys?: unknown } | null } | null | undefined);

  const features = resolveFeatures({
    platform: defaults?.value,
    plan: subscription?.plans?.feature_keys,
    org: org?.feature_overrides,
  });

  return {
    user,
    orgId: resolved.org_id,
    orgName: org?.name ?? "Neura Chat",
    role: resolved.role,
    isPlatformAdmin: Boolean(adminRow),
    features,
    suspended: org?.suspended_at
      ? { at: org.suspended_at, reason: org.suspended_reason ?? null }
      : null,
  };
}

/**
 * requireOrg, plus a refusal if this workspace does not have the feature.
 *
 * Called at the top of every gated page. Hiding the link is not enough —
 * a URL someone has bookmarked still works, and "off" has to mean off.
 *
 * Platform staff are not exempt. Seeing the product as the customer sees it
 * is the only way to check that switching something off did what you meant.
 */
export async function requireFeature(key: string): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (ctx.features[key] === false) {
    redirect(`/overview?off=${encodeURIComponent(key)}`);
  }
  return ctx;
}

/** The same, resolved from a path rather than a key. */
export async function requireFeatureForPath(pathname: string): Promise<OrgContext> {
  const owner = featureForPath(pathname);
  return owner ? requireFeature(owner.key) : requireOrg();
}

// Creates an organization and owner membership for a user who somehow has
// neither. Uses the service role because organizations deliberately has no
// insert policy for `authenticated` — normal provisioning is the signup
// trigger, and this is the repair path for accounts it never ran for.
// Only ever acts on the already-authenticated user passed in.
async function provisionOrgForUser(user: User): Promise<{ org_id: string; role: OrgRole } | null> {
  const meta = (user.user_metadata ?? {}) as { org_name?: string; full_name?: string };
  const name =
    meta.org_name?.trim() ||
    meta.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "My Organization";

  try {
    const admin = createAdminClient();

    // Through the database function rather than two inserts here. Next
    // renders a page in parallel with its layout, so several of these run
    // at once for the same user — and inserting directly gave one signup
    // four identical organizations with its data split between them. The
    // function takes an advisory lock on the user, so the first caller
    // creates and the rest find what it created.
    const { data: orgId, error: provisionError } = await admin.rpc("provision_org_for_user", {
      target_user: user.id,
      org_name: name,
    });

    if (provisionError || !orgId) {
      console.error("Failed to provision organization", provisionError);
      return null;
    }

    return { org_id: orgId, role: "owner" };
  } catch (error) {
    console.error("Organization provisioning failed", error);
    return null;
  }
}

// Platform staff only. Membership of an org is irrelevant here — the sole
// grant is a platform_admins row.
export async function requirePlatformAdmin(): Promise<User> {
  if (!isSupabaseConfigured()) redirect("/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) redirect("/overview");

  return user;
}
