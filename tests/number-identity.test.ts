import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NUMBER_PENDING,
  NUMBER_SYNC_BATCH,
  NUMBER_SYNC_COOLDOWN_MS,
  describe as describeNumber,
  needsNumberSync,
  optionLabel,
} from "../src/lib/number-identity.ts";

const blank = { displayPhoneNumber: null, verifiedName: null, label: null };

test("a picker option pairs the operator's name with the number", () => {
  assert.equal(
    optionLabel({ ...blank, label: "Sales", displayPhoneNumber: "+91 92724 47307" }),
    "Sales · +91 92724 47307"
  );
});

test("the operator's own name beats the one Meta verified", () => {
  assert.equal(
    optionLabel({ displayPhoneNumber: "+91 92724 47307", verifiedName: "Neurachat", label: "Sales" }),
    "Sales · +91 92724 47307"
  );
  assert.equal(
    optionLabel({ ...blank, verifiedName: "Neurachat", displayPhoneNumber: "+91 92724 47307" }),
    "Neurachat · +91 92724 47307"
  );
});

test("a number with no name shows as the number alone", () => {
  assert.equal(optionLabel({ ...blank, displayPhoneNumber: "+1 555-327-6567" }), "+1 555-327-6567");
});

test("a name with no number shows as the name alone", () => {
  assert.equal(optionLabel({ ...blank, label: "Sales" }), "Sales");
});

test("knowing nothing says so instead of printing an id", () => {
  assert.equal(optionLabel(blank), NUMBER_PENDING);
  assert.equal(describeNumber(blank), NUMBER_PENDING);
  assert.doesNotMatch(NUMBER_PENDING, /\d/);
});

test("blank strings count as absent, not as a name", () => {
  assert.equal(optionLabel({ displayPhoneNumber: "  ", verifiedName: "", label: "   " }), NUMBER_PENDING);
});

test("the long form parenthesises the number", () => {
  assert.equal(
    describeNumber({ ...blank, label: "Support", displayPhoneNumber: "+91 92724 47307" }),
    "Support (+91 92724 47307)"
  );
  assert.equal(describeNumber({ ...blank, displayPhoneNumber: "+91 92724 47307" }), "+91 92724 47307");
});

// --- choosing what to ask Meta about --------------------------------------

const now = Date.parse("2026-09-15T12:00:00Z");
const candidate = (over: Partial<Parameters<typeof needsNumberSync>[0][number]> = {}) => ({
  id: "a",
  lastCheckedAt: null,
  ...blank,
  ...over,
});

test("a number already known is never asked about again", () => {
  assert.deepEqual(
    needsNumberSync([candidate({ displayPhoneNumber: "+91 92724 47307" })], now),
    []
  );
});

test("a number never asked about is due", () => {
  assert.equal(needsNumberSync([candidate()], now).length, 1);
});

test("a number asked about within the hour waits", () => {
  const recent = new Date(now - NUMBER_SYNC_COOLDOWN_MS + 1000).toISOString();
  assert.deepEqual(needsNumberSync([candidate({ lastCheckedAt: recent })], now), []);
});

test("a number Meta would not describe is retried once the hour is up", () => {
  const stale = new Date(now - NUMBER_SYNC_COOLDOWN_MS - 1000).toISOString();
  assert.equal(needsNumberSync([candidate({ lastCheckedAt: stale })], now).length, 1);
});

test("an unreadable timestamp counts as never asked", () => {
  assert.equal(needsNumberSync([candidate({ lastCheckedAt: "not a date" })], now).length, 1);
});

test("one page render never fires more than a handful of lookups", () => {
  const many = Array.from({ length: NUMBER_SYNC_BATCH + 4 }, (_unused, index) =>
    candidate({ id: `c${index}` })
  );
  assert.equal(needsNumberSync(many, now).length, NUMBER_SYNC_BATCH);
});

test("a name without a number is still worth asking about", () => {
  // The name makes the picker readable, but campaigns and templates need
  // the number itself — a named row with no number is not finished.
  assert.equal(needsNumberSync([candidate({ label: "Sales" })], now).length, 1);
});
