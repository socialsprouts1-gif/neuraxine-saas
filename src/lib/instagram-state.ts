import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The workspace, carried through Instagram and back.
//
// OAuth hands `state` to the provider and the provider hands it back
// untouched, which makes it the only way the callback can know whose
// account just got connected. It is also entirely under the browser's
// control on the way out, so it is signed: without that, anybody who
// knows the redirect URI could connect their own Instagram account to
// somebody else's workspace by editing one query parameter.

const TTL_MS = 15 * 60 * 1000;

function secret(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signState(orgId: string): string {
  const payload = `${orgId}.${Date.now()}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

/**
 * The workspace id, or null when the state is not ours.
 *
 * Expires after fifteen minutes. A connect link left open in a tab for a
 * week and then followed is not somebody finishing a setup, and the
 * shorter this is the less a leaked URL is worth.
 */
export function readState(state: string): string | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString();
  } catch {
    return null;
  }

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  // Length first: timingSafeEqual throws rather than returning false when
  // the two differ, which would turn a forged state into a 500.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  const [orgId, at] = payload.split(".");
  if (!orgId || !at) return null;
  if (Date.now() - Number(at) > TTL_MS) return null;

  return orgId;
}
