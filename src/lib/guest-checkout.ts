// Paying before there is an account to pay for.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// The old order was: choose a plan, create an account, then pay. This
// reverses it — the gateway opens straight off the pricing card, and the
// account is created afterwards from the details the payment already
// collected. One fewer form in front of somebody who has their card out.
//
// The thing that makes it safe is the claim token. Money arrives before
// an account exists, so the payment has to be recoverable by somebody who
// has proved nothing yet, and only by them: the token is the proof, it is
// long enough not to be guessed, and it is spent the moment it is used.
//
// The honest risk, stated once where it belongs: a person who pays and
// then closes the tab has paid for something they cannot reach. Their
// email comes back from the gateway, so the link can be sent to them, but
// that is a recovery path rather than a reason it cannot happen.

/** A claim token: 32 hex characters, from crypto-quality randomness. */
export const CLAIM_TOKEN_LENGTH = 32;

const TOKEN = /^[0-9a-f]{32}$/;

/**
 * A paid checkout is only claimable for so long.
 *
 * Not a refund policy — the row stays and the money is still theirs —
 * but an unclaimed token that works forever is a link in an inbox that
 * creates a free workspace a year later.
 */
export const CLAIM_WINDOW_HOURS = 72;

export type GuestStatus = "pending" | "paid" | "claimed" | "expired";

export interface GuestCheckoutRow {
  status: GuestStatus;
  paid_at?: string | null;
  claimed_at?: string | null;
}

/** Whether a string could be a token at all, before any lookup. */
export function isClaimToken(value: string | null | undefined): boolean {
  return typeof value === "string" && TOKEN.test(value.trim().toLowerCase());
}

export function normaliseClaimToken(value: string | null | undefined): string | null {
  const token = (value ?? "").trim().toLowerCase();
  return TOKEN.test(token) ? token : null;
}

export type ClaimVerdict =
  | { ok: true }
  | { ok: false; reason: string; alreadyClaimed?: boolean };

/**
 * Whether this checkout can still be turned into a workspace.
 *
 * Every refusal says which one it is, because they need different
 * answers: an already-claimed token means sign in, an unpaid one means
 * the payment never completed, and an expired one means talk to us.
 */
export function canClaim(row: GuestCheckoutRow, now: Date = new Date()): ClaimVerdict {
  if (row.status === "claimed") {
    return {
      ok: false,
      alreadyClaimed: true,
      reason: "This payment has already been used to create a workspace. Sign in instead.",
    };
  }

  if (row.status === "expired") {
    return {
      ok: false,
      reason:
        "This payment link has expired. Nothing is lost — get in touch and we will finish setting your workspace up.",
    };
  }

  if (row.status !== "paid" || !row.paid_at) {
    return {
      ok: false,
      reason: "That payment has not completed yet. If money left your account, get in touch.",
    };
  }

  const paidMs = Date.parse(row.paid_at);
  if (Number.isNaN(paidMs)) {
    return { ok: false, reason: "That payment's date could not be read. Get in touch." };
  }

  if (now.getTime() - paidMs > CLAIM_WINDOW_HOURS * 3_600_000) {
    return {
      ok: false,
      reason:
        "This payment link has expired. Nothing is lost — get in touch and we will finish setting your workspace up.",
    };
  }

  return { ok: true };
}

/**
 * The extra days somebody gets for paying up front.
 *
 * They keep the trial they would have had for signing up free, and seven
 * days are added on top — so choosing to pay immediately never costs them
 * time they would otherwise have had, which is the thing that would make
 * paying feel like a punishment.
 */
export const PAID_SIGNUP_BONUS_DAYS = 7;

export function bonusDaysFor(trialDays: number): number {
  const trial = Number.isFinite(trialDays) && trialDays > 0 ? Math.floor(trialDays) : 0;
  return trial + PAID_SIGNUP_BONUS_DAYS;
}

/** How the bonus reads on screen, in the words somebody would use. */
export function describeBonus(trialDays: number): string {
  const trial = Number.isFinite(trialDays) && trialDays > 0 ? Math.floor(trialDays) : 0;
  if (trial <= 0) return `${PAID_SIGNUP_BONUS_DAYS} bonus days on top of your plan`;
  return `your ${trial}-day trial plus ${PAID_SIGNUP_BONUS_DAYS} bonus days, on top of the plan you paid for`;
}

/**
 * What the gateway collected, cleaned up for prefilling the sign-up form.
 *
 * Razorpay asks for a name, an email and a phone number before it takes
 * the card, so the form afterwards only has to ask for a password. None
 * of it is trusted as identity — it is typed into fields the person can
 * still correct.
 */
export interface GuestContact {
  name: string;
  email: string;
  phone: string;
}

export function readGuestContact(row: {
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
}): GuestContact {
  const text = (value: string | null | undefined) => (value ?? "").trim();
  return {
    name: text(row.contact_name),
    email: text(row.contact_email).toLowerCase(),
    phone: text(row.contact_phone),
  };
}

/** Splits a full name into the two fields the sign-up form asks for. */
export function splitName(full: string): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}
