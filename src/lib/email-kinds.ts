// Which messages a person may refuse, and how a link proving it is made.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
// The secret is passed in rather than read here, which is what keeps this
// testable without putting a real key anywhere near a test.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mail sent because something happened to this person's account.
 *
 * A receipt, a password reset, a welcome. Nobody may be cut off from
 * these: suppressing a payment receipt because somebody unsubscribed from
 * follow-ups would hide money moving, and the law that requires an
 * unsubscribe on marketing does not ask for one on these.
 */
const TRANSACTIONAL = new Set([
  "welcome",
  "payment_received",
  "subscription_expired",
  "first_chatbot",
  "test",
]);

/**
 * Mail sent because we would like something from them.
 *
 * Trial countdowns, "your trial ended", the follow-up sequence, renewal
 * nudges. These need a one-click unsubscribe — Gmail and Yahoo both expect
 * one on bulk mail and treat its absence as a spam signal, and a follow-up
 * every three days for a month without a way out is what a spam report is
 * for.
 */
export function isMarketing(kind: string): boolean {
  return !TRANSACTIONAL.has(kind);
}

/** Whether a suppression applies to this kind of message. */
export function suppressible(kind: string): boolean {
  return isMarketing(kind);
}

// --- proving a link came from us ------------------------------------------

/**
 * A signature over the address, so an unsubscribe link cannot be edited
 * into somebody else's.
 *
 * Without this the link is just an address in a URL, and anybody who
 * received one could unsubscribe every customer by changing it. No expiry:
 * an unsubscribe link that stops working is worse than useless, because
 * the message it came in is still in the mailbox.
 */
export function signEmail(email: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(email.trim().toLowerCase())
    .digest("base64url")
    .slice(0, 32);
}

export function verifyEmail(email: string, token: string, secret: string): boolean {
  if (!email || !token) return false;
  const expected = signEmail(email, secret);
  // Same length is a precondition of timingSafeEqual, and a mismatch there
  // is already a failure — so it is safe to answer early.
  if (expected.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

/** The link that goes in the footer and in the List-Unsubscribe header. */
export function unsubscribeUrl(appUrl: string, email: string, secret: string): string {
  const base = appUrl.replace(/\/+$/, "");
  const address = encodeURIComponent(email.trim().toLowerCase());
  return `${base}/api/email/unsubscribe?e=${address}&t=${signEmail(email, secret)}`;
}
