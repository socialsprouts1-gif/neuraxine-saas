import test from "node:test";
import assert from "node:assert/strict";
import {
  planProductSend,
  windowState,
  canReceiveProducts,
  MAX_PRODUCTS_PER_MESSAGE,
  type SendableProduct,
} from "../src/lib/product-send.ts";

const kurta: SendableProduct = { id: "p1", name: "Cotton kurta", retailerId: "KRT-001" };
const saree: SendableProduct = { id: "p2", name: "Silk saree", retailerId: "SAR-004" };
const draft: SendableProduct = { id: "p3", name: "Linen shirt", retailerId: null };
const all = [kurta, saree, draft];

// --- which of WhatsApp's three messages a selection means ------------------

test("nothing picked sends the whole storefront rather than nothing", () => {
  const plan = planProductSend(all, [], true);
  assert.equal(plan.kind, "catalogue");
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.retailerIds, []);
});

test("one product is a product card, named so it can be checked", () => {
  const plan = planProductSend(all, ["p1"], true);
  assert.equal(plan.kind, "single");
  assert.deepEqual(plan.retailerIds, ["KRT-001"]);
  assert.match(plan.summary, /Cotton kurta/);
});

test("two products is a list, not two separate cards", () => {
  const plan = planProductSend(all, ["p1", "p2"], true);
  assert.equal(plan.kind, "list");
  assert.deepEqual(plan.retailerIds, ["KRT-001", "SAR-004"]);
  assert.match(plan.summary, /2 products/);
});

test("selection order is kept, so the list reads as it was built", () => {
  assert.deepEqual(planProductSend(all, ["p2", "p1"], true).retailerIds, ["SAR-004", "KRT-001"]);
});

// --- the things that stop a send ------------------------------------------

test("no catalogue linked blocks the send and says why", () => {
  const plan = planProductSend(all, ["p1"], false);
  assert.equal(plan.ok, false);
  assert.match(plan.error ?? "", /Catalogue tab/);
});

test("a product missing from Meta's catalogue is named, not counted", () => {
  // "1 product cannot be sent" makes you go and find which one.
  const plan = planProductSend(all, ["p1", "p3"], true);
  assert.equal(plan.ok, false);
  assert.match(plan.error ?? "", /Linen shirt/);
  assert.doesNotMatch(plan.error ?? "", /Cotton kurta/);
});

test("several missing products are all named, and read as plural", () => {
  const more = [...all, { id: "p4", name: "Wool scarf", retailerId: null }];
  const plan = planProductSend(more, ["p3", "p4"], true);
  assert.match(plan.error ?? "", /Linen shirt, Wool scarf/);
  assert.match(plan.error ?? "", /are not in your Meta catalogue/);
  assert.match(plan.error ?? "", /they cannot be sent/);
});

test("Meta's thirty-product cap is enforced before the send, not after", () => {
  const many = Array.from({ length: 31 }, (_, i) => ({
    id: `x${i}`,
    name: `Item ${i}`,
    retailerId: `R${i}`,
  }));
  const plan = planProductSend(many, many.map((p) => p.id), true);
  assert.equal(plan.ok, false);
  assert.match(plan.error ?? "", new RegExp(String(MAX_PRODUCTS_PER_MESSAGE)));
  assert.match(plan.error ?? "", /31 are picked/);
});

test("exactly thirty is allowed — the cap is inclusive", () => {
  const thirty = Array.from({ length: 30 }, (_, i) => ({
    id: `x${i}`,
    name: `Item ${i}`,
    retailerId: `R${i}`,
  }));
  const plan = planProductSend(thirty, thirty.map((p) => p.id), true);
  assert.equal(plan.ok, true);
  assert.equal(plan.kind, "list");
});

test("an id that matches no product is ignored rather than crashing", () => {
  const plan = planProductSend(all, ["p1", "gone"], true);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.retailerIds, ["KRT-001"]);
});

// --- the 24-hour window ----------------------------------------------------

const NOW = Date.parse("2026-09-25T12:00:00Z");
const hoursAgo = (n: number) => new Date(NOW - n * 3_600_000).toISOString();

test("a customer who wrote an hour ago leaves most of the day", () => {
  const state = windowState(hoursAgo(1), NOW);
  assert.equal(state.tone, "open");
  assert.equal(state.hoursLeft, 23);
  assert.equal(state.label, "23h left");
});

test("the last few hours are flagged, because that is when it matters", () => {
  assert.equal(windowState(hoursAgo(21), NOW).tone, "closing");
  assert.equal(windowState(hoursAgo(20), NOW).tone, "open");
});

test("under an hour is shown in minutes, not as zero hours", () => {
  // "0h left" reads as closed. Forty minutes is still time to send.
  const state = windowState(new Date(NOW - (SERVICE_WINDOW - 40 * 60_000)).toISOString(), NOW);
  assert.equal(state.tone, "closing");
  assert.equal(state.label, "40 min left");
});

const SERVICE_WINDOW = 24 * 60 * 60 * 1000;

test("past twenty-four hours the window is shut", () => {
  const state = windowState(hoursAgo(24.5), NOW);
  assert.equal(state.tone, "closed");
  assert.equal(state.hoursLeft, null);
  assert.equal(canReceiveProducts(hoursAgo(24.5), NOW), false);
});

test("exactly twenty-four hours is closed, not open", () => {
  assert.equal(windowState(hoursAgo(24), NOW).tone, "closed");
});

test("a contact who has never written is closed, and says so in those words", () => {
  assert.equal(windowState(null, NOW).label, "never messaged you");
  assert.equal(windowState(undefined, NOW).tone, "closed");
  assert.equal(canReceiveProducts(null, NOW), false);
});

test("an unparseable timestamp is treated as closed rather than as open", () => {
  // Erring the other way would send into a window that is not there and
  // fail at Meta with a code instead of here with a sentence.
  assert.equal(windowState("not a date", NOW).tone, "closed");
});
