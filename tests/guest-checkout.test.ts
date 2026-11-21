import test from "node:test";
import assert from "node:assert/strict";
import {
  isClaimToken,
  normaliseClaimToken,
  canClaim,
  bonusDaysFor,
  describeBonus,
  readGuestContact,
  splitName,
  CLAIM_WINDOW_HOURS,
  PAID_SIGNUP_BONUS_DAYS,
} from "../src/lib/guest-checkout.ts";

const NOW = new Date("2026-10-01T12:00:00Z");
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000).toISOString();

// Money arrives before an account exists, so the payment has to be
// claimable by somebody who has proved nothing yet — and only by them.

test("a token is 32 hex characters and nothing else", () => {
  assert.equal(isClaimToken("a".repeat(32)), true);
  assert.equal(isClaimToken("0123456789abcdef0123456789abcdef"), true);
});

test("anything that is not a token is refused before any lookup", () => {
  for (const bad of ["", "   ", "short", "g".repeat(32), "a".repeat(31), "a".repeat(33), null, undefined]) {
    assert.equal(isClaimToken(bad), false, String(bad));
    assert.equal(normaliseClaimToken(bad), null, String(bad));
  }
});

test("case and surrounding space are tolerated, because links get retyped", () => {
  assert.equal(normaliseClaimToken("  ABCDEF0123456789ABCDEF0123456789  "), "abcdef0123456789abcdef0123456789");
});

// --- can it still be claimed ----------------------------------------------

test("a payment that just landed can be claimed", () => {
  assert.deepEqual(canClaim({ status: "paid", paid_at: hoursAgo(1) }, NOW), { ok: true });
});

test("a token already used says so, and says what to do instead", () => {
  // The other refusals mean "get in touch". This one means "sign in",
  // and telling somebody to contact support when they already have a
  // workspace wastes everybody's afternoon.
  const verdict = canClaim({ status: "claimed", paid_at: hoursAgo(1) }, NOW);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.alreadyClaimed, true);
  assert.match(verdict.ok === false ? verdict.reason : "", /sign in/i);
});

test("a payment that never completed cannot create a workspace", () => {
  const verdict = canClaim({ status: "pending", paid_at: null }, NOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /not completed/i);
});

test("paid but with no timestamp is refused rather than assumed recent", () => {
  assert.equal(canClaim({ status: "paid", paid_at: null }, NOW).ok, false);
  assert.equal(canClaim({ status: "paid", paid_at: "not a date" }, NOW).ok, false);
});

test("the window closes, and the refusal says the money is not lost", () => {
  const justInside = canClaim({ status: "paid", paid_at: hoursAgo(CLAIM_WINDOW_HOURS - 1) }, NOW);
  assert.equal(justInside.ok, true);

  const outside = canClaim({ status: "paid", paid_at: hoursAgo(CLAIM_WINDOW_HOURS + 1) }, NOW);
  assert.equal(outside.ok, false);
  assert.match(outside.ok === false ? outside.reason : "", /nothing is lost/i);
});

test("a row marked expired is refused whatever its date says", () => {
  assert.equal(canClaim({ status: "expired", paid_at: hoursAgo(1) }, NOW).ok, false);
});

// --- what paying up front buys you -----------------------------------------

test("paying keeps the trial and adds seven days", () => {
  // Choosing to pay immediately must never cost somebody time they would
  // have had for free — that would make paying feel like a punishment.
  assert.equal(bonusDaysFor(7), 7 + PAID_SIGNUP_BONUS_DAYS);
  assert.equal(bonusDaysFor(14), 14 + PAID_SIGNUP_BONUS_DAYS);
});

test("with no trial configured, the seven days still stand", () => {
  assert.equal(bonusDaysFor(0), PAID_SIGNUP_BONUS_DAYS);
  assert.equal(bonusDaysFor(-3), PAID_SIGNUP_BONUS_DAYS);
  assert.equal(bonusDaysFor(Number.NaN), PAID_SIGNUP_BONUS_DAYS);
});

test("the bonus is described in the words somebody would use", () => {
  assert.match(describeBonus(7), /7-day trial plus 7 bonus days/);
  assert.match(describeBonus(0), /7 bonus days/);
});

// --- prefilling the form ---------------------------------------------------

test("what the gateway collected comes back cleaned up", () => {
  assert.deepEqual(
    readGuestContact({
      contact_name: "  Vivek Sharma ",
      contact_email: "  Vivek@Example.COM ",
      contact_phone: " +91 87675 12569 ",
    }),
    { name: "Vivek Sharma", email: "vivek@example.com", phone: "+91 87675 12569" }
  );
});

test("missing details come back empty rather than as null", () => {
  assert.deepEqual(readGuestContact({}), { name: "", email: "", phone: "" });
});

test("a full name fills the two fields the form asks for", () => {
  assert.deepEqual(splitName("Vivek Sharma"), { first: "Vivek", last: "Sharma" });
  assert.deepEqual(splitName("Vivek"), { first: "Vivek", last: "" });
  assert.deepEqual(splitName("  Ana Maria  Lopez "), { first: "Ana", last: "Maria Lopez" });
  assert.deepEqual(splitName(""), { first: "", last: "" });
});
