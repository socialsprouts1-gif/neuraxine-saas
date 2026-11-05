import test from "node:test";
import assert from "node:assert/strict";
import {
  ROWS,
  COMPETITORS,
  ownColumn,
  ownPrices,
  CHECKED_ON,
} from "../src/lib/comparison.ts";

test("every row has a value for every competitor", () => {
  // A missing key renders as an empty cell, which reads as "this product
  // does not have it" — a claim nobody made.
  for (const row of ROWS) {
    for (const provider of COMPETITORS) {
      assert.ok(
        provider.id in row.values,
        `${row.label} has nothing for ${provider.name}`
      );
    }
  }
});

test("every row has a value in NeuraChat's own column", () => {
  // The column is built by key, so a row added to ROWS and forgotten in
  // ownColumn would leave this product's cell blank in its own table.
  const own = ownColumn({ entry: "₹1,000/mo", top: "₹2,000/mo", trialDays: 7 });
  for (const row of ROWS) {
    assert.ok(row.label in own, `${row.label} has nothing for NeuraChat`);
  }
});

test("NeuraChat's column carries no rows the table does not show", () => {
  const labels = new Set(ROWS.map((row) => row.label));
  for (const key of Object.keys(ownColumn({ entry: "a", top: "b", trialDays: 7 }))) {
    assert.ok(labels.has(key), `${key} is claimed but never rendered`);
  }
});

test("the table is honest about what this product does not do", () => {
  // A comparison where one product wins every row is one nobody believes.
  // If these ever become true, it is because the feature was built.
  const own = ownColumn({ entry: "a", top: "b", trialDays: 7 });
  assert.equal(own["Carousel in service messages"], false);
  assert.equal(own["Chat link & QR generation"], false);
  assert.equal(own["Dedicated account manager"], false);
});

test("the competitor figures carry a date they were checked", () => {
  // They are claims about named companies. Undated, there is no way to
  // tell a current price from a two-year-old one.
  assert.match(CHECKED_ON, /^\d{4}-\d{2}-\d{2}$/);
});

test("no competitor is listed twice", () => {
  const ids = COMPETITORS.map((provider) => provider.id);
  assert.equal(new Set(ids).size, ids.length);
});

// --- this product's own prices ---------------------------------------------

test("the cheapest and dearest monthly plans become the two price rows", () => {
  const prices = ownPrices(
    [
      { monthlyCents: 150000, currency: "INR" },
      { monthlyCents: 100000, currency: "INR" },
      { monthlyCents: 200000, currency: "INR" },
    ],
    7
  );
  assert.match(prices.entry, /1,000/);
  assert.match(prices.top, /2,000/);
  assert.equal(prices.trialDays, 7);
});

test("a yearly-only tier is left out of the monthly price row", () => {
  const prices = ownPrices(
    [
      { monthlyCents: null, currency: "INR" },
      { monthlyCents: 120000, currency: "INR" },
    ],
    7
  );
  assert.match(prices.entry, /1,200/);
  assert.match(prices.top, /1,200/);
});

test("no plans at all gives a dash rather than a wrong number", () => {
  // A database that has not been seeded must not advertise ₹0.
  const prices = ownPrices([], 7);
  assert.equal(prices.entry, "—");
  assert.equal(prices.top, "—");
});

test("the prices come from the plan rows, so the table cannot disagree with pricing", () => {
  // The whole reason this is derived rather than typed: a comparison
  // claiming ₹599 beside a pricing card charging ₹1,000 is worse than no
  // comparison at all.
  const own = ownColumn(ownPrices([{ monthlyCents: 100000, currency: "INR" }], 14));
  assert.match(String(own["Entry plan"]), /1,000/);
  assert.equal(own["Free trial"], "14 days");
});
