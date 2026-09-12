// Signed state for the Embedded Signup round trip.
//
// The callback arrives from facebook.com with no Supabase session cookie, so
// it has to learn which org started the flow from the URL — and must refuse a
// URL somebody else assembled. Signing keeps that stateless: no table to
// write, no row to clean up when an operator abandons the dialog.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 15 * 60 * 1000;

interface StatePayload {
  orgId: string;
  nonce: string;
  ts: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSignupState(orgId: string, secret: string): string {
  const payload: StatePayload = {
    orgId,
    nonce: randomBytes(12).toString("base64url"),
    ts: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function readSignupState(state: string, secret: string): StatePayload | null {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;

  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as StatePayload;
    if (!payload.orgId || typeof payload.ts !== "number") return null;
    if (Date.now() - payload.ts > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
