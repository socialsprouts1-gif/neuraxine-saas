import test from "node:test";
import assert from "node:assert/strict";
import { billingState } from "../src/lib/billing-state.ts";

const NOW = new Date("2026-09-06T12:00:00Z");
const inDays = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString();

test("a fresh trial says how long is left and asks for nothing", () => {
  const state = billingState(
    { status: "trialing", current_period_end: inDays(14) },
    NOW
  );

  assert.equal(state.stage, "trialing");
  assert.equal(state.daysLeft, 14);
  // Nagging from day one is how a banner becomes something nobody reads.
  assert.equal(state.needsAttention, false);
});

test("a trial in its last days starts asking", () => {
  const state = billingState({ status: "trialing", current_period_end: inDays(3) }, NOW);
  assert.equal(state.needsAttention, true);
  assert.match(state.title, /3 days left/);
});

test("the last day reads as today, not as zero days", () => {
  const state = billingState({ status: "trialing", current_period_end: inDays(0.5) }, NOW);
  assert.equal(state.stage, "trialing");
  assert.match(state.title, /ends today/);
});

test("an expired trial asks for a plan, not for a card", () => {
  const state = billingState({ status: "trialing", current_period_end: inDays(-1) }, NOW);
  assert.equal(state.stage, "trial_expired");
  assert.equal(state.needsAttention, true);
  assert.match(state.title, /trial has ended/i);
});

test("an active subscription is silent", () => {
  const state = billingState(
    { status: "active", current_period_end: inDays(20), plans: { name: "Growth" } },
    NOW
  );

  assert.equal(state.stage, "active");
  assert.equal(state.needsAttention, false);
  assert.equal(state.planName, "Growth");
});

test("active but past its period is treated as lapsed, not as paid", () => {
  // The status column alone would say "active" forever. Nothing renews it,
  // so the date is what decides.
  const state = billingState({ status: "active", current_period_end: inDays(-2) }, NOW);
  assert.equal(state.stage, "past_due");
  assert.equal(state.needsAttention, true);
});

test("past_due asks to update billing", () => {
  const state = billingState({ status: "past_due", current_period_end: inDays(5) }, NOW);
  assert.equal(state.stage, "past_due");
  assert.match(state.detail, /billing details/i);
});

test("cancelled and expired both offer a way back", () => {
  for (const status of ["cancelled", "expired"]) {
    const state = billingState({ status, current_period_end: null }, NOW);
    assert.equal(state.stage, "trial_expired");
    assert.equal(state.needsAttention, true);
  }
});

test("no subscription row accuses nobody", () => {
  // A database that has not run the backfill yet. Silence beats telling a
  // paying customer their trial ran out.
  for (const row of [null, undefined, { status: null, current_period_end: null }]) {
    const state = billingState(row, NOW);
    assert.equal(state.stage, "none");
    assert.equal(state.needsAttention, false);
    assert.equal(state.title, "");
  }
});

test("a trial with no end date does not pretend to know one", () => {
  const state = billingState({ status: "trialing", current_period_end: null }, NOW);
  assert.equal(state.daysLeft, null);
  assert.equal(state.needsAttention, false);
  assert.match(state.title, /free trial/i);
});
