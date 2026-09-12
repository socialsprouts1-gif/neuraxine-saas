import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bestYearlySaving,
  buildPricingTiers,
  DEFAULT_TIERS,
  hasYearly,
  monthlyEquivalent,
  yearlySavingPercent,
  type PlanRow,
} from "../src/lib/pricing.ts";

function plan(overrides: Partial<PlanRow> & Pick<PlanRow, "slug">): PlanRow {
  return {
    name: "Growth",
    description: "For growing teams",
    price_cents: 150000,
    currency: "INR",
    billing_interval: "monthly",
    features: ["10,000 messages/mo"],
    is_active: true,
    sort_order: 2,
    ...overrides,
  };
}

describe("buildPricingTiers", () => {
  it("falls back to the seeded catalogue when there are no rows", () => {
    assert.deepEqual(buildPricingTiers([]), DEFAULT_TIERS);
    assert.deepEqual(buildPricingTiers(null), DEFAULT_TIERS);
    assert.deepEqual(buildPricingTiers(undefined), DEFAULT_TIERS);
  });

  it("pairs a monthly and a yearly row into one tier", () => {
    const tiers = buildPricingTiers([
      plan({ slug: "growth", price_cents: 150000, billing_interval: "monthly" }),
      plan({
        slug: "growth-yearly",
        price_cents: 1000000,
        billing_interval: "yearly",
        sort_order: 5,
      }),
    ]);

    assert.equal(tiers.length, 1);
    assert.equal(tiers[0].slug, "growth");
    assert.equal(tiers[0].monthlyCents, 150000);
    assert.equal(tiers[0].yearlyCents, 1000000);
  });

  it("orders by the monthly row's sort_order, not the yearly one's", () => {
    const tiers = buildPricingTiers([
      plan({ slug: "scale-yearly", billing_interval: "yearly", price_cents: 1200000, sort_order: 6 }),
      plan({ slug: "scale", name: "Scale", price_cents: 200000, sort_order: 3 }),
      plan({ slug: "starter", name: "Starter", price_cents: 100000, sort_order: 1 }),
      plan({ slug: "starter-yearly", billing_interval: "yearly", price_cents: 800000, sort_order: 4 }),
    ]);

    assert.deepEqual(
      tiers.map((tier) => tier.slug),
      ["starter", "scale"]
    );
  });

  it("drops inactive plans", () => {
    const tiers = buildPricingTiers([
      plan({ slug: "starter", name: "Starter", sort_order: 1 }),
      plan({ slug: "legacy", name: "Legacy", sort_order: 2, is_active: false }),
    ]);

    assert.deepEqual(
      tiers.map((tier) => tier.name),
      ["Starter"]
    );
  });

  it("marks the middle tier popular, wherever it lands", () => {
    const three = buildPricingTiers([
      plan({ slug: "a", sort_order: 1 }),
      plan({ slug: "b", sort_order: 2 }),
      plan({ slug: "c", sort_order: 3 }),
    ]);
    assert.deepEqual(
      three.map((tier) => tier.popular),
      [false, true, false]
    );

    const one = buildPricingTiers([plan({ slug: "only", sort_order: 1 })]);
    assert.deepEqual(
      one.map((tier) => tier.popular),
      [true]
    );
  });

  it("prefers the monthly row's features over the yearly row's", () => {
    const tiers = buildPricingTiers([
      plan({ slug: "growth-yearly", billing_interval: "yearly", features: ["7 months free"] }),
      plan({ slug: "growth", features: ["10,000 messages/mo", "5,000 contacts"] }),
    ]);

    assert.deepEqual(tiers[0].features, ["10,000 messages/mo", "5,000 contacts"]);
  });

  it("keeps a tier sold only yearly", () => {
    const tiers = buildPricingTiers([
      plan({ slug: "annual-only", name: "Annual", billing_interval: "yearly", price_cents: 500000 }),
    ]);

    assert.equal(tiers.length, 1);
    assert.equal(tiers[0].monthlyCents, null);
    assert.equal(tiers[0].yearlyCents, 500000);
  });

  it("ignores features that are not a list of strings", () => {
    const tiers = buildPricingTiers([
      plan({ slug: "odd", features: { messages: 10 } }),
      plan({ slug: "odder", sort_order: 3, features: [1, null, "Real feature"] }),
    ]);

    assert.deepEqual(tiers[0].features, []);
    assert.deepEqual(tiers[1].features, ["Real feature"]);
  });
});

describe("yearly arithmetic", () => {
  it("shows the yearly price as a monthly figure", () => {
    const [starter] = DEFAULT_TIERS;
    // ₹8,000 a year is ₹666.67 a month.
    assert.equal(monthlyEquivalent(starter), 66667);
  });

  it("computes the saving against twelve monthly payments", () => {
    // ₹1,000 × 12 = ₹12,000 against ₹8,000 is a third off.
    assert.equal(yearlySavingPercent(DEFAULT_TIERS[0]), 33);
    // ₹2,000 × 12 = ₹24,000 against ₹12,000 is half.
    assert.equal(yearlySavingPercent(DEFAULT_TIERS[2]), 50);
  });

  it("reports no saving when yearly costs the same or more", () => {
    const tier = { ...DEFAULT_TIERS[0], monthlyCents: 100000, yearlyCents: 1200000 };
    assert.equal(yearlySavingPercent(tier), null);
  });

  it("takes the best saving on offer for the toggle badge", () => {
    assert.equal(bestYearlySaving(DEFAULT_TIERS), 50);
    assert.equal(bestYearlySaving([{ ...DEFAULT_TIERS[0], yearlyCents: null }]), null);
  });

  it("knows when nothing is sold yearly", () => {
    assert.equal(hasYearly(DEFAULT_TIERS), true);
    assert.equal(hasYearly(DEFAULT_TIERS.map((tier) => ({ ...tier, yearlyCents: null }))), false);
  });
});
