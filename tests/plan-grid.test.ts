import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupPlans,
  limitLines,
  planFor,
  yearlySaving,
  type PlanOption,
} from "../src/lib/plan-grid.ts";

const plan = (over: Partial<PlanOption>): PlanOption => ({
  id: "p",
  name: "Starter",
  description: null,
  priceCents: 100000,
  currency: "INR",
  interval: "monthly",
  features: [],
  messageLimit: null,
  contactLimit: null,
  seatLimit: null,
  isCurrent: false,
  ...over,
});

test("the same name at two intervals becomes one tier", () => {
  const tiers = groupPlans([
    plan({ id: "m", interval: "monthly", priceCents: 100000 }),
    plan({ id: "y", interval: "yearly", priceCents: 800000 }),
  ]);

  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].monthly?.id, "m");
  assert.equal(tiers[0].yearly?.id, "y");
});

test("tiers keep the order the database gave them", () => {
  // sort_order is what decides which tier is leftmost; grouping must not
  // reshuffle it.
  const tiers = groupPlans([
    plan({ name: "Starter" }),
    plan({ name: "Growth" }),
    plan({ name: "Scale" }),
    plan({ name: "Starter", interval: "yearly" }),
  ]);
  assert.deepEqual(tiers.map((tier) => tier.name), ["Starter", "Growth", "Scale"]);
});

test("the name pairs the intervals however it is cased", () => {
  const tiers = groupPlans([plan({ name: "Starter" }), plan({ name: " starter ", interval: "yearly" })]);
  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].name, "Starter");
});

test("a tier with only one interval still appears", () => {
  // Losing a yearly row must degrade to "monthly only", never to a tier
  // that silently vanishes from the pricing table.
  const tiers = groupPlans([plan({ interval: "monthly" })]);
  assert.equal(tiers.length, 1);
  assert.equal(tiers[0].yearly, null);
});

test("asking for an interval a tier lacks falls back rather than breaking", () => {
  const [tier] = groupPlans([plan({ id: "m", interval: "monthly" })]);
  assert.equal(planFor(tier, "yearly")?.id, "m");
  assert.equal(planFor(tier, "monthly")?.id, "m");
});

test("shared copy is taken from whichever row has it", () => {
  const [tier] = groupPlans([
    plan({ description: null, features: [] }),
    plan({ interval: "yearly", description: "For teams", features: ["Unlimited numbers"] }),
  ]);
  assert.equal(tier.description, "For teams");
  assert.deepEqual(tier.features, ["Unlimited numbers"]);
});

test("the yearly saving is the real percentage", () => {
  // 12 × 1000 = 12000; a yearly price of 8000 saves a third.
  const [tier] = groupPlans([
    plan({ priceCents: 100000, interval: "monthly" }),
    plan({ priceCents: 800000, interval: "yearly" }),
  ]);
  assert.equal(yearlySaving(tier), 33);
});

test("no badge when yearly is not actually cheaper", () => {
  // "Save 0%" is noise and a negative one advertises the worse deal.
  const [same] = groupPlans([
    plan({ priceCents: 100000 }),
    plan({ priceCents: 1200000, interval: "yearly" }),
  ]);
  assert.equal(yearlySaving(same), null);

  const [worse] = groupPlans([
    plan({ priceCents: 100000 }),
    plan({ priceCents: 1500000, interval: "yearly" }),
  ]);
  assert.equal(yearlySaving(worse), null);
});

test("a saving is never rounded up past the truth", () => {
  // 12 × 1000 = 12000 against 11999 is 0.008%, which must not read as 1%.
  const [tier] = groupPlans([
    plan({ priceCents: 100000 }),
    plan({ priceCents: 1199900, interval: "yearly" }),
  ]);
  assert.equal(yearlySaving(tier), null);
});

test("no saving can be computed from one interval alone", () => {
  const [tier] = groupPlans([plan({ interval: "monthly" })]);
  assert.equal(yearlySaving(tier), null);
});

test("limits stand in for bullets nobody wrote", () => {
  const lines = limitLines(plan({ messageLimit: 5000, contactLimit: 1000, seatLimit: 1 }));
  assert.deepEqual(lines, ["5,000 messages a month", "1,000 contacts", "1 team seat"]);
});

test("a null limit reads as unlimited, not as zero", () => {
  assert.deepEqual(limitLines(plan({})), [
    "Unlimited messages a month",
    "Unlimited contacts",
    "Unlimited team seats",
  ]);
});
