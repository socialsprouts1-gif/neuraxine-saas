import test from "node:test";
import assert from "node:assert/strict";
import {
  startedHere,
  cameFromCourier,
  splitByOrigin,
  type OrderOrigin,
} from "../src/lib/order-origin.ts";

const cart: OrderOrigin = { shiprocketOrderId: null, hasConversation: true, itemCount: 2 };
const raisedHere: OrderOrigin = { shiprocketOrderId: null, hasConversation: false, itemCount: 1 };
const justRaised: OrderOrigin = { shiprocketOrderId: null, hasConversation: false, itemCount: 0 };
const pushedOut: OrderOrigin = { shiprocketOrderId: "981", hasConversation: true, itemCount: 3 };
const pulledIn: OrderOrigin = { shiprocketOrderId: "2011470598", hasConversation: false, itemCount: 0 };

test("a customer's cart is a Commerce order", () => {
  assert.equal(startedHere(cart), true);
});

test("an order somebody typed in here is a Commerce order", () => {
  assert.equal(startedHere(raisedHere), true);
});

test("an order raised here a moment ago, before any lines, still counts", () => {
  assert.equal(startedHere(justRaised), true);
});

test("an order pushed out to the courier stays a Commerce order", () => {
  // The important one. "Has a Shiprocket id" is not the test — an order
  // that worked end to end has one, and hiding those would empty the
  // screen of exactly the sales that went right.
  assert.equal(startedHere(pushedOut), true);
});

test("a parcel pulled in from the courier is not a Commerce order", () => {
  // No conversation, no lines, already at the courier: something we
  // learned about, not a sale we took.
  assert.equal(startedHere(pulledIn), false);
  assert.equal(cameFromCourier(pulledIn), true);
});

test("the two are exact opposites, for every shape", () => {
  for (const order of [cart, raisedHere, justRaised, pushedOut, pulledIn]) {
    assert.notEqual(startedHere(order), cameFromCourier(order));
  }
});

test("a list splits once, so two counts cannot disagree on screen", () => {
  const { own, courier } = splitByOrigin([cart, pulledIn, pushedOut, pulledIn]);
  assert.equal(own.length, 2);
  assert.equal(courier.length, 2);
  assert.equal(own.length + courier.length, 4);
});

test("splitting keeps the order it was given", () => {
  const { own } = splitByOrigin([cart, pulledIn, raisedHere]);
  assert.deepEqual(own, [cart, raisedHere]);
});

test("an empty list splits into two empty lists, not into undefined", () => {
  assert.deepEqual(splitByOrigin([]), { own: [], courier: [] });
});
