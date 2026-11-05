import test from "node:test";
import assert from "node:assert/strict";
import {
  summariseFailures,
  rollUpFailure,
  isAccountWide,
  describeOutcome,
} from "../src/lib/campaign-failures.ts";

const BILLING =
  "The WhatsApp Business Account has a billing problem — add a payment method in Meta Business Suite before sending again. (Meta error 131042)";
const NO_WHATSAPP =
  "WhatsApp could not deliver to this number — it may not have WhatsApp. (Meta error 131026)";

test("five recipients failing one way is one reason, counted five", () => {
  const reasons = summariseFailures(Array.from({ length: 5 }, () => ({ error: BILLING })));
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0].count, 5);
  assert.equal(reasons[0].reason, BILLING);
});

test("reasons come back commonest first", () => {
  const reasons = summariseFailures([
    { error: NO_WHATSAPP },
    { error: BILLING },
    { error: BILLING },
    { error: BILLING },
  ]);
  assert.deepEqual(
    reasons.map((entry) => entry.count),
    [3, 1]
  );
  assert.equal(reasons[0].reason, BILLING);
});

test("a missing reason is named rather than dropped", () => {
  const reasons = summariseFailures([{ error: null }, { error: "   " }]);
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0].count, 2);
  assert.match(reasons[0].reason, /No reason was recorded/);
});

test("no failures summarise to nothing", () => {
  assert.deepEqual(summariseFailures([]), []);
});

// --- the one line stored on the campaign -----------------------------------

test("one reason rolls up to exactly that reason", () => {
  const line = rollUpFailure([{ error: BILLING }, { error: BILLING }]);
  assert.equal(line, BILLING);
});

test("several reasons roll up without pretending there was only one", () => {
  const line = rollUpFailure([
    { error: BILLING },
    { error: BILLING },
    { error: NO_WHATSAPP },
  ]);
  assert.match(line ?? "", /^The WhatsApp Business Account has a billing problem/);
  assert.match(line ?? "", /2 of 3/);
  assert.match(line ?? "", /1 other reason/);
});

test("nothing failed, nothing to roll up", () => {
  assert.equal(rollUpFailure([]), null);
});

// --- account-wide vs one bad row -------------------------------------------

test("the causes an owner fixes once are recognised", () => {
  for (const reason of [
    BILLING,
    "Meta rejected this — Integrity requirements not met. (Meta error 139000/4233020)",
    "This phone number is not registered for the Cloud API.",
    "The access token has expired.",
  ]) {
    assert.equal(isAccountWide(reason), true, `not flagged: ${reason}`);
  }
});

test("one unreachable number is not an account problem", () => {
  assert.equal(isAccountWide(NO_WHATSAPP), false);
  assert.equal(isAccountWide("Outside WhatsApp's 24-hour service window."), false);
});

// --- the sentence above the list -------------------------------------------

test("nothing sent plus an account-wide cause says re-running will not help", () => {
  const line = describeOutcome(0, summariseFailures([{ error: BILLING }]));
  assert.match(line ?? "", /Re-running will fail the same way/);
});

test("nothing sent for per-recipient reasons does not blame the account", () => {
  const line = describeOutcome(0, summariseFailures([{ error: NO_WHATSAPP }]));
  assert.match(line ?? "", /Nothing went out/);
  assert.doesNotMatch(line ?? "", /account rather than the list/);
});

test("a partial send is described as partial", () => {
  const line = describeOutcome(4, summariseFailures([{ error: NO_WHATSAPP }]));
  assert.match(line ?? "", /Some went out/);
});

test("no failures means no sentence at all", () => {
  assert.equal(describeOutcome(5, []), null);
});
