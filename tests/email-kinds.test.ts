import test from "node:test";
import assert from "node:assert/strict";
import {
  isMarketing,
  suppressible,
  signEmail,
  verifyEmail,
  unsubscribeUrl,
} from "../src/lib/email-kinds.ts";

const SECRET = "test-secret-not-a-real-key";

test("account mail is never treated as marketing", () => {
  // Suppressing a receipt would hide money moving.
  for (const kind of ["welcome", "payment_received", "subscription_expired", "first_chatbot"]) {
    assert.equal(isMarketing(kind), false, kind);
    assert.equal(suppressible(kind), false, kind);
  }
});

test("nudges are marketing and can be refused", () => {
  for (const kind of ["trial_ending", "trial_expired", "trial_follow_up", "renewal_reminder"]) {
    assert.equal(isMarketing(kind), true, kind);
    assert.equal(suppressible(kind), true, kind);
  }
});

test("an unknown kind is treated as marketing", () => {
  // The safe default: offering an unsubscribe on something transactional is
  // harmless, while omitting one on marketing is a spam report.
  assert.equal(isMarketing("some_new_campaign"), true);
});

test("a signature is stable for the same address", () => {
  assert.equal(signEmail("a@b.com", SECRET), signEmail("a@b.com", SECRET));
});

test("case and surrounding space do not change the signature", () => {
  const base = signEmail("a@b.com", SECRET);
  assert.equal(signEmail("A@B.COM", SECRET), base);
  assert.equal(signEmail("  a@b.com  ", SECRET), base);
});

test("a different address or secret gives a different signature", () => {
  assert.notEqual(signEmail("a@b.com", SECRET), signEmail("c@d.com", SECRET));
  assert.notEqual(signEmail("a@b.com", SECRET), signEmail("a@b.com", "other"));
});

test("a link cannot be edited into somebody else's address", () => {
  // The whole point: swapping the address in the URL must stop working.
  const token = signEmail("a@b.com", SECRET);
  assert.equal(verifyEmail("a@b.com", token, SECRET), true);
  assert.equal(verifyEmail("victim@b.com", token, SECRET), false);
});

test("a missing or malformed token is refused rather than throwing", () => {
  assert.equal(verifyEmail("a@b.com", "", SECRET), false);
  assert.equal(verifyEmail("", "abc", SECRET), false);
  assert.equal(verifyEmail("a@b.com", "short", SECRET), false);
  assert.equal(verifyEmail("a@b.com", "x".repeat(200), SECRET), false);
});

test("the url carries the address and its signature, and survives a + in it", () => {
  const url = unsubscribeUrl("https://neurachat.in/", "A+tag@b.com", SECRET);
  assert.match(url, /^https:\/\/neurachat\.in\/api\/email\/unsubscribe\?e=/);
  // A + left raw would arrive as a space and never match the signature.
  assert.ok(url.includes("%2Btag%40b.com"));
  const parsed = new URL(url);
  assert.equal(
    verifyEmail(parsed.searchParams.get("e")!, parsed.searchParams.get("t")!, SECRET),
    true
  );
});
