// The sign-up code itself: made, hashed, and compared.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
// Separate from signup-otp.ts because that file is imported by the sign-up
// page — node:crypto cannot be bundled for a browser, and nothing that
// handles a secret should be sent to one anyway.

import { createHmac, randomInt, randomBytes, timingSafeEqual } from "node:crypto";
import {
  CODE_LENGTH,
  CODE_TTL_MINUTES,
  MAX_ATTEMPTS,
  VERIFICATION_TOKEN_LENGTH,
  normaliseCode,
  parsed,
  type CheckVerdict,
  type OtpRow,
} from "./signup-otp.ts";

const TOKEN = /^[0-9a-f]{32}$/;

/** A fresh code. Zero-padded, so every code is the same length on screen. */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function newVerificationToken(): string {
  return randomBytes(VERIFICATION_TOKEN_LENGTH / 2).toString("hex");
}

export function normaliseVerificationToken(value: string | null | undefined): string | null {
  const token = (value ?? "").trim().toLowerCase();
  return TOKEN.test(token) ? token : null;
}

/**
 * What gets stored instead of the code.
 *
 * Keyed to the number as well as the secret, so a hash lifted from one row
 * cannot be replayed against another number. The secret is the app's
 * existing TOKEN_ENCRYPTION_KEY, passed in rather than read here so this
 * file stays testable — and so a missing key is a loud failure in one
 * place instead of a silently weaker hash everywhere.
 */
export function hashCode(waId: string, code: string, secret: string): string {
  return createHmac("sha256", secret || "signup-otp")
    .update(`${waId}:${code}`)
    .digest("hex");
}

/** Constant-time comparison, so a wrong code gives nothing away by timing. */
export function codeMatches(stored: string, waId: string, code: string, secret: string): boolean {
  const expected = Buffer.from(hashCode(waId, code, secret), "utf8");
  const found = Buffer.from((stored ?? "").trim(), "utf8");
  if (expected.length !== found.length) return false;
  return timingSafeEqual(expected, found);
}

/**
 * Whether the code somebody typed is the one that was sent.
 *
 * The refusals are deliberately different from each other: "expired" and
 * "wrong" need different actions from the person reading them, and a
 * single "invalid code" for both is the message that makes them retype
 * the same expired digits four times.
 *
 * It does not say how many guesses are left on a wrong code. That number
 * is useful to somebody guessing and to nobody else.
 */
export function checkCode(
  row: OtpRow,
  code: string,
  secret: string,
  now: Date = new Date()
): CheckVerdict {
  if (row.consumed_at) {
    return { ok: false, reason: "That code has already been used. Ask for a new one." };
  }

  const expires = parsed(row.expires_at);
  if (expires === null || now.getTime() > expires) {
    return {
      ok: false,
      exhausted: true,
      reason: `That code has expired — they last ${CODE_TTL_MINUTES} minutes. Ask for a new one.`,
    };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return {
      ok: false,
      exhausted: true,
      reason: "Too many wrong codes. Ask for a new one.",
    };
  }

  const typed = normaliseCode(code);
  if (!typed) {
    return { ok: false, reason: `Enter the ${CODE_LENGTH}-digit code from WhatsApp.` };
  }

  if (!codeMatches(row.code_hash, row.wa_id, typed, secret)) {
    return { ok: false, reason: "That code is not right. Check the message and try again." };
  }

  return { ok: true };
}
