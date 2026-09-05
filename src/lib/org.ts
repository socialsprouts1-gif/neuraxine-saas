import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { OrgRole } from "@/types/database";

export interface OrgContext {
  user: User;
  orgId: string;
  orgName: string;
  role: OrgRole;
  isPlatformAdmin: boolean;
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

  const [{ data: org }, { data: adminRow }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", resolved.org_id).maybeSingle(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  return {
    user,
    orgId: resolved.org_id,
    orgName: org?.name ?? "Neura Chat",
    role: resolved.role,
    isPlatformAdmin: Boolean(adminRow),
  };
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

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name })
      .select("id")
      .single();

    if (orgError || !org) {
      console.error("Failed to provision organization", orgError);
      return null;
    }

    const { error: memberError } = await admin
      .from("org_members")
      .insert({ org_id: org.id, user_id: user.id, role: "owner" });

    if (memberError) {
      console.error("Failed to provision org membership", memberError);
      return null;
    }

    return { org_id: org.id, role: "owner" };
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

  if (!data) redirect("/inbox");

  return user;
}
