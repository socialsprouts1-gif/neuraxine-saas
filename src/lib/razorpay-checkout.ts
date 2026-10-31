// Razorpay Standard Checkout: the arithmetic and the signature.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
// The secret is passed in rather than read here, which is what lets a test
// exercise the real algorithm without a real key existing anywhere.
//
// Standard Checkout differs from the payment links this product already
// sends: the customer stays on the page and pays in a modal, and what
// comes back is three fields the browser hands over. Those fields are
// signed, and the signature is the only thing that makes them worth
// anything — a browser can say whatever it likes.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Razorpay refuses anything under one rupee. */
export const MIN_PAISE = 100;

export interface CheckoutFields {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/**
 * Paise from the amount this codebase stores.
 *
 * `amount_cents` is the minor unit of whatever currency the row is in, and
 * for INR the minor unit is the paisa — so this is a rename rather than a
 * conversion. It exists to say that out loud, because "cents" in a rupee
 * amount is the kind of thing somebody later multiplies by a hundred.
 */
export function toPaise(amountCents: number): number {
  return Math.round(amountCents);
}

export type AmountCheck = { ok: true; paise: number } | { ok: false; error: string };

export function checkAmount(amountCents: number): AmountCheck {
  if (!Number.isFinite(amountCents)) {
    return { ok: false, error: "That amount is not a number." };
  }

  const paise = toPaise(amountCents);
  if (paise < MIN_PAISE) {
    return {
      ok: false,
      error: `Razorpay will not take less than ${MIN_PAISE} paise (₹1). This came to ${paise}.`,
    };
  }

  return { ok: true, paise };
}

/**
 * What Razorpay signs: the order id and the payment id, joined by a pipe.
 *
 * The order matters and the separator matters. Signing the two ids
 * concatenated without it would let a different pair of ids produce the
 * same string.
 */
export function checkoutSignature(orderId: string, paymentId: string, secret: string): string {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

/**
 * Whether these three fields really came from Razorpay.
 *
 * Compared in constant time. A comparison that returns early on the first
 * wrong character leaks, one guess at a time, what the right one is.
 */
export function verifyCheckoutSignature(fields: CheckoutFields, secret: string): boolean {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId } = fields;
  const signature = fields.razorpay_signature;

  if (!orderId || !paymentId || !signature || !secret) return false;

  const expected = checkoutSignature(orderId, paymentId, secret);
  // Equal length is a precondition of timingSafeEqual, and a length
  // mismatch is already a failure — so answering early is safe here.
  if (expected.length !== signature.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

/** Whether a body carries all three fields, before anything is verified. */
export function readCheckoutFields(body: unknown): CheckoutFields | null {
  const source = body as Partial<CheckoutFields> | null;
  const orderId = source?.razorpay_order_id;
  const paymentId = source?.razorpay_payment_id;
  const signature = source?.razorpay_signature;

  if (typeof orderId !== "string" || !orderId.trim()) return null;
  if (typeof paymentId !== "string" || !paymentId.trim()) return null;
  if (typeof signature !== "string" || !signature.trim()) return null;

  return {
    razorpay_order_id: orderId.trim(),
    razorpay_payment_id: paymentId.trim(),
    razorpay_signature: signature.trim(),
  };
}

export type KeyMode = "test" | "live" | "unknown";

/**
 * Which mode a Key ID belongs to, from its prefix.
 *
 * Razorpay stamps it on the key itself, and the key id is not a secret —
 * so when a pair is rejected, the mode of the half we hold can be said out
 * loud instead of asked about. "Check they are from the same mode" is
 * advice; "the stored key is a test key" is something to check against.
 */
export function razorpayKeyMode(keyId: string | null | undefined): KeyMode {
  const key = keyId?.trim() ?? "";
  if (/^rzp_test_/i.test(key)) return "test";
  if (/^rzp_live_/i.test(key)) return "live";
  return "unknown";
}

/** Enough of a Key ID to recognise it, without printing the whole thing. */
export function maskKeyId(keyId: string | null | undefined): string {
  const key = keyId?.trim() ?? "";
  if (!key) return "none stored";
  return key.length <= 12 ? key : `${key.slice(0, 12)}…${key.slice(-4)}`;
}

/**
 * Why Razorpay refused a key pair, naming what is actually stored.
 *
 * The regenerate clause is there because it is the likeliest cause and the
 * least obvious: generating a new key pair invalidates the previous
 * secret immediately, so a key id that still looks right paired with the
 * secret written down last week fails exactly like a typo.
 */
export function describeKeyRejection(keyId: string | null | undefined): string {
  const mode = razorpayKeyMode(keyId);
  const shown = maskKeyId(keyId);

  if (mode === "unknown") {
    return `Razorpay rejected this key pair. The stored Key ID (${shown}) does not start with rzp_test_ or rzp_live_, so it does not look like a Razorpay key at all — check it was pasted whole.`;
  }

  return `Razorpay rejected this key pair. The stored Key ID is a ${mode} key (${shown}), so the secret must be the one shown when that exact key was generated, with the dashboard in ${mode} mode. Generating a new key pair invalidates the old secret immediately — if the key was regenerated, paste both halves of the new pair.`;
}
