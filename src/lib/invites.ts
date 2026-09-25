// Adding somebody to a workspace.
//
// Everything multi-user in this product was already built — conversations
// are assigned, internal notes are attributed, the lead board groups by
// owner, plans sell seats — and none of it could be used, because there
// was no way to put a second person in a workspace. This is that.
//
// Pure: token shape, expiry, and what a stored row means. The sending and
// the accepting live in the actions, which is where the database is.

import type { OrgRole } from "@/types/database";

/** A week. Long enough to survive a holiday, short enough to expire. */
export const INVITE_TTL_DAYS = 7;

/** Roles that can be handed out by invitation. */
export const INVITABLE_ROLES: readonly OrgRole[] = ["admin", "member"];

export interface InviteRow {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export type InviteState = "pending" | "accepted" | "revoked" | "expired";

/**
 * What a stored invitation currently means.
 *
 * Checked in this order on purpose: an invitation that was accepted and
 * then expired is accepted, and one that was revoked before it expired is
 * revoked. Reading expiry first would relabel both as merely stale and
 * lose the reason.
 */
export function inviteState(row: InviteRow, now: Date = new Date()): InviteState {
  if (row.accepted_at) return "accepted";
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  return "pending";
}

/** Only a pending invitation may be accepted. */
export function isUsable(row: InviteRow, now: Date = new Date()): boolean {
  return inviteState(row, now) === "pending";
}

/** When an invitation created now should stop working. */
export function inviteExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Normalises an email for comparison and storage.
 *
 * Lower-cased and trimmed, so inviting "Anita@Example.com" and signing up
 * as "anita@example.com" is one person rather than two. The local part is
 * technically case-sensitive in the RFC and case-insensitive at every mail
 * provider anyone actually uses; matching the providers is what makes the
 * invitation work.
 */
export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Whether this looks enough like an email address to send to. */
export function isEmailish(input: string): boolean {
  const value = normaliseEmail(input);
  // Deliberately loose. A regex strict enough to reject every invalid
  // address also rejects valid ones, and the real test is whether the mail
  // arrives.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export interface SeatCheck {
  /** How many seats the plan allows. Null is unlimited. */
  limit: number | null;
  /** Members already in the workspace. */
  members: number;
  /** Invitations sent and not yet used. */
  pending: number;
}

export interface SeatVerdict {
  ok: boolean;
  /** Seats left, or null when there is no limit. */
  remaining: number | null;
  reason?: string;
}

/**
 * Whether there is room for one more person.
 *
 * Pending invitations count against the limit. Without that, a workspace
 * with one seat left could send ten invitations and all ten would be
 * accepted — the limit would be enforced at a moment nobody was watching,
 * and the tenth person would be told they were over a limit somebody else
 * had used up.
 */
export function seatsAvailable({ limit, members, pending }: SeatCheck): SeatVerdict {
  if (limit === null) return { ok: true, remaining: null };

  const used = members + pending;
  const remaining = Math.max(0, limit - used);

  if (remaining > 0) return { ok: true, remaining };

  return {
    ok: false,
    remaining: 0,
    reason:
      pending > 0
        ? `This plan includes ${limit} seat${limit === 1 ? "" : "s"}, and ${members} ${members === 1 ? "is" : "are"} taken with ${pending} invitation${pending === 1 ? "" : "s"} still outstanding. Revoke one, or move to a larger plan.`
        : `This plan includes ${limit} seat${limit === 1 ? "" : "s"} and all of them are taken. Move to a larger plan to add somebody.`,
  };
}

/** Where an invitation link points. */
export function inviteUrl(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/invite/${token}`;
}
