import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { createSignupState, readSignupState } from "../src/lib/signup-state.ts";

// Run with: npm test
//
// This value is what tells the Embedded Signup callback which org to write a
// WhatsApp connection into, on a request that carries no session. If it can
// be forged, one tenant can attach their number to another tenant's account,
// so the negative cases matter more than the happy path.

const SECRET = "app-secret-for-tests";
const ORG = "6f1c2b7e-0000-4000-8000-000000000001";

test("a freshly signed state round-trips", () => {
  const parsed = readSignupState(createSignupState(ORG, SECRET), SECRET);
  assert.equal(parsed?.orgId, ORG);
});

test("two states for the same org are different", () => {
  // A replayable constant would let a captured URL be reused indefinitely.
  assert.notEqual(createSignupState(ORG, SECRET), createSignupState(ORG, SECRET));
});

test("a state signed with another secret is refused", () => {
  const forged = createSignupState(ORG, "some-other-app-secret");
  assert.equal(readSignupState(forged, SECRET), null);
});

test("editing the org id invalidates the signature", () => {
  const state = createSignupState(ORG, SECRET);
  const [body, signature] = state.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  payload.orgId = "11111111-2222-4333-8444-555555555555";
  const tampered = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${signature}`;

  assert.equal(readSignupState(tampered, SECRET), null);
});

test("an unsigned payload is refused", () => {
  const body = Buffer.from(JSON.stringify({ orgId: ORG, nonce: "x", ts: Date.now() })).toString(
    "base64url"
  );
  assert.equal(readSignupState(body, SECRET), null);
  assert.equal(readSignupState(`${body}.`, SECRET), null);
});

test("a signature of the wrong length is refused, not thrown", () => {
  // timingSafeEqual throws on unequal lengths; the length guard has to come
  // first or a truncated signature becomes a 500 instead of a rejection.
  const state = createSignupState(ORG, SECRET);
  const [body] = state.split(".");
  assert.doesNotThrow(() => readSignupState(`${body}.abc`, SECRET));
  assert.equal(readSignupState(`${body}.abc`, SECRET), null);
});

test("an expired state is refused", () => {
  const stale = { orgId: ORG, nonce: "n", ts: Date.now() - 16 * 60 * 1000 };
  const body = Buffer.from(JSON.stringify(stale)).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(body).digest("base64url");

  assert.equal(readSignupState(`${body}.${signature}`, SECRET), null);
});

test("a validly signed payload missing an org id is refused", () => {
  const body = Buffer.from(JSON.stringify({ nonce: "n", ts: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(body).digest("base64url");

  assert.equal(readSignupState(`${body}.${signature}`, SECRET), null);
});

test("garbage never throws", () => {
  for (const junk of ["", ".", "a.b", "....", "%%%.%%%"]) {
    assert.doesNotThrow(() => readSignupState(junk, SECRET));
    assert.equal(readSignupState(junk, SECRET), null);
  }
});
