// Who administers a workspace, and who is merely in it.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.

/** Owner manages the workspace, admin manages the work, member does it. */
export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

/**
 * Whether this role may change the workspace itself.
 *
 * Connecting a WhatsApp number, opening billing, adding integrations and
 * inviting people are all gated on this. A plain member can do the work —
 * reply to chats, run campaigns — but cannot set the workspace up.
 */
export function canManage(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * The role the person who creates a workspace gets, when nothing is set.
 *
 * Owner, and deliberately so. The first member of a brand-new workspace is
 * the only person in it: make them a plain member and nobody can connect
 * the number the product exists to send from. See signup_role() in the
 * migration — this is the same default, and Admin → Settings changes both.
 */
export const DEFAULT_SIGNUP_ROLE: OrgRole = "owner";

/** Reads the configured signup role out of the `signups` platform setting. */
export function readSignupRole(value: unknown): OrgRole {
  const role = (value as { default_role?: unknown } | null)?.default_role;
  return isOrgRole(role) ? role : DEFAULT_SIGNUP_ROLE;
}

export interface MemberRow {
  user_id: string;
  role: string | null;
}

export const LAST_OWNER =
  "This is the workspace's only owner. Make somebody else an owner first, or the workspace ends up with nobody who can manage it.";

export const NOT_A_MEMBER = "That person is not in this workspace any more.";

/**
 * Why this role change has to be refused, or null when it is allowed.
 *
 * The one rule is that a workspace keeps at least one owner. A workspace
 * with none is one nobody can invite to, bill or connect a number for, and
 * there is no way back to having an owner from inside the product — it is
 * an unrecoverable state reached by one careless dropdown.
 */
export function roleChangeBlocked(
  members: readonly MemberRow[],
  userId: string,
  nextRole: OrgRole
): string | null {
  const target = members.find((member) => member.user_id === userId);
  if (!target) return NOT_A_MEMBER;

  // Promoting, or leaving things as they are, can never remove an owner.
  if (nextRole === "owner" || target.role !== "owner") return null;

  const otherOwners = members.filter(
    (member) => member.role === "owner" && member.user_id !== userId
  );

  return otherOwners.length > 0 ? null : LAST_OWNER;
}
