"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrg } from "@/lib/org";
import { loadEntitlement, loadUsage } from "@/lib/entitlement";
import {
  INVITABLE_ROLES,
  inviteExpiry,
  inviteUrl,
  isEmailish,
  isUsable,
  normaliseEmail,
  seatsAvailable,
} from "@/lib/invites";
import type { ActionResult } from "./actions";
import type { OrgRole } from "@/types/database";

// Putting a second person in a workspace.
//
// The invitation link is the capability — whoever holds it can join — so
// it is 32 bytes of randomness, single-use, and expires in a week. The
// accept path runs as the service role, because the person accepting is by
// definition not a member yet and so no policy would let them in.

/** Only an owner or admin may change who is in the workspace. */
function canManageTeam(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

async function origin(): Promise<string> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const proto = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Creates an invitation and returns the link to send.
 *
 * The link is returned rather than emailed: there is no mail sender wired
 * up yet, and a feature that silently does not deliver is worse than one
 * that hands you the link to paste into WhatsApp. Swapping in a sender
 * later changes this function and nothing else.
 */
export async function inviteTeammate(
  formData: FormData
): Promise<ActionResult & { link?: string }> {
  const ctx = await requireOrg();
  if (!canManageTeam(ctx.role)) {
    return { ok: false, error: "Only an owner or an admin can invite somebody." };
  }

  const email = normaliseEmail(String(formData.get("email") ?? ""));
  if (!isEmailish(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  const role = String(formData.get("role") ?? "member") as OrgRole;
  if (!INVITABLE_ROLES.includes(role)) {
    return { ok: false, error: "Pick a role." };
  }
  // Narrowed by the check above; the readonly array's includes() does not
  // carry that through on its own.
  const invitedRole = role as "admin" | "member";

  const supabase = await createClient();

  const [entitlement, usage] = await Promise.all([
    loadEntitlement(supabase, ctx.orgId),
    loadUsage(supabase, ctx.orgId),
  ]);

  // usage.seats already includes outstanding invitations, so the check is
  // against members + pending in one number.
  const seats = seatsAvailable({
    limit: entitlement.limits.seat_limit,
    members: usage.seats,
    pending: 0,
  });
  if (!seats.ok) return { ok: false, error: seats.reason ?? "No seats left on this plan." };

  const token = randomBytes(32).toString("base64url");

  // A second invitation to the same address replaces the first. The
  // partial unique index enforces one live invitation per address, and
  // two working links for one person is a support conversation nobody
  // wants to have.
  const { error: clearError } = await supabase
    .from("org_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", ctx.orgId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (clearError) return { ok: false, error: clearError.message };

  const { error } = await supabase.from("org_invites").insert({
    org_id: ctx.orgId,
    email,
    role: invitedRole,
    token,
    invited_by: ctx.user.id,
    expires_at: inviteExpiry(),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return {
    ok: true,
    message: `Invitation ready for ${email}. Send them the link — it works for seven days.`,
    link: inviteUrl(token, await origin()),
  };
}

/** Cancels an invitation that has not been used. */
export async function revokeInvite(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (!canManageTeam(ctx.role)) {
    return { ok: false, error: "Only an owner or an admin can do that." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "No invitation selected." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", ctx.orgId)
    .eq("id", id)
    .is("accepted_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, message: "Invitation cancelled. The link no longer works." };
}

/**
 * Removes somebody from the workspace.
 *
 * The last owner cannot be removed: a workspace with no owner is one
 * nobody can invite to, bill, or delete — an unrecoverable state reached
 * by one careless click.
 */
export async function removeTeammate(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (!canManageTeam(ctx.role)) {
    return { ok: false, error: "Only an owner or an admin can do that." };
  }

  const userId = String(formData.get("user_id") ?? "").trim();
  if (!userId) return { ok: false, error: "No member selected." };

  const supabase = await createClient();

  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", ctx.orgId);

  const target = (members ?? []).find((member) => member.user_id === userId);
  if (!target) return { ok: false, error: "They are not in this workspace." };

  if (target.role === "owner") {
    const owners = (members ?? []).filter((member) => member.role === "owner");
    if (owners.length <= 1) {
      return {
        ok: false,
        error:
          "This is the workspace's only owner. Make somebody else an owner first, or the workspace ends up with nobody who can manage it.",
      };
    }
  }

  // An admin must not be able to remove an owner. Owners outrank them, and
  // otherwise an admin could take the workspace.
  if (target.role === "owner" && ctx.role !== "owner") {
    return { ok: false, error: "Only an owner can remove another owner." };
  }

  const { error } = await supabase
    .from("org_members")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, message: "Removed from the workspace. Their account still exists." };
}

/** Changes a member's role. Refuses to leave the workspace ownerless. */
export async function changeTeammateRole(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  if (ctx.role !== "owner") {
    return { ok: false, error: "Only an owner can change roles." };
  }

  const userId = String(formData.get("user_id") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim() as OrgRole;
  if (!userId) return { ok: false, error: "No member selected." };
  if (!["owner", "admin", "member"].includes(role)) {
    return { ok: false, error: "Unknown role." };
  }

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", ctx.orgId);

  const owners = (members ?? []).filter((member) => member.role === "owner");
  if (role !== "owner" && owners.length <= 1 && owners[0]?.user_id === userId) {
    return {
      ok: false,
      error:
        "This is the workspace's only owner. Make somebody else an owner first, or the workspace ends up with nobody who can manage it.",
    };
  }

  const { error } = await supabase
    .from("org_members")
    .update({ role })
    .eq("org_id", ctx.orgId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, message: `Role set to ${role}.` };
}

/**
 * Joins the workspace an invitation points at.
 *
 * Runs as the service role on purpose: the person accepting is not a
 * member yet, so no row-level policy would let them read the invitation or
 * write the membership. Everything is therefore checked here by hand —
 * the token, its state, and that the signed-in address is the invited one.
 */
export async function acceptInvite(
  token: string
): Promise<{ ok: true; orgName: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Sign in first, then open the link again." };

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("org_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return { ok: false, error: "That invitation link isn't valid." };

  if (!isUsable(invite)) {
    const state = invite.accepted_at
      ? "has already been used"
      : invite.revoked_at
        ? "was cancelled"
        : "has expired";
    return { ok: false, error: `That invitation ${state}. Ask them to send a new one.` };
  }

  // The invitation is for one address. Without this, anybody who gets hold
  // of the link joins as whoever they happen to be signed in as.
  const signedInAs = normaliseEmail(user.email ?? "");
  if (signedInAs !== invite.email) {
    return {
      ok: false,
      error: `This invitation was sent to ${invite.email}, and you are signed in as ${signedInAs || "another account"}. Sign in with the invited address and open the link again.`,
    };
  }

  // Read separately rather than embedded: org_invites carries no declared
  // foreign key to organizations in the generated types, so PostgREST
  // cannot infer the join.
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", invite.org_id)
    .maybeSingle();
  const orgName = org?.name ?? "the workspace";

  const { data: existing } = await admin
    .from("org_members")
    .select("user_id")
    .eq("org_id", invite.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: memberError } = await admin.from("org_members").insert({
      org_id: invite.org_id,
      user_id: user.id,
      role: invite.role,
    });
    if (memberError) return { ok: false, error: memberError.message };
  }

  // Stamped after the membership, not before: a stamped invitation whose
  // membership failed to write is one nobody can use again.
  await admin
    .from("org_invites")
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq("id", invite.id);

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, orgName };
}
