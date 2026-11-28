import test from "node:test";
import assert from "node:assert/strict";
import {
  shipmentStage,
  describeStage,
  availableActions,
  documentLabel,
  describeQueue,
  type ShipmentRow,
} from "../src/lib/shipment-stage.ts";

const fresh: ShipmentRow = {
  shiprocketOrderId: null,
  shipmentId: null,
  awb: null,
  labelUrl: null,
  invoiceUrl: null,
  pickupScheduledAt: null,
  orderStatus: "paid",
};

const pushed: ShipmentRow = { ...fresh, shiprocketOrderId: "9001", shipmentId: "7001" };
const withAwb: ShipmentRow = { ...pushed, awb: "1234567890" };
const collected: ShipmentRow = { ...withAwb, pickupScheduledAt: "2026-09-24" };

// --- the ladder ------------------------------------------------------------

test("each step is only reached once the one before it is done", () => {
  assert.equal(shipmentStage(fresh), "not_pushed");
  assert.equal(shipmentStage(pushed), "awaiting_courier");
  assert.equal(shipmentStage(withAwb), "ready_to_pick");
  assert.equal(shipmentStage(collected), "picked_up");
});

test("an order that should not ship is not offered shipping", () => {
  for (const orderStatus of ["pending", "awaiting_payment", "cancelled", "refunded"]) {
    assert.equal(shipmentStage({ ...withAwb, orderStatus }), "not_shippable", orderStatus);
    assert.deepEqual(availableActions({ ...withAwb, orderStatus }), []);
  }
});

test("shipped and delivered orders still expose their documents", () => {
  for (const orderStatus of ["shipped", "delivered"]) {
    assert.notEqual(shipmentStage({ ...collected, orderStatus }), "not_shippable");
  }
});

// --- only offering what will work ------------------------------------------

test("nothing but push is offered before the order exists on Shiprocket", () => {
  assert.deepEqual(availableActions(fresh), ["push"]);
});

test("a label is never offered before there is an AWB", () => {
  // Shiprocket refuses a label without a courier, so offering it here
  // would be a button whose only outcome is an error.
  assert.ok(!availableActions(pushed).includes("label"));
  assert.ok(availableActions(withAwb).includes("label"));
});

test("tracking and notifying are only offered once there is something to track", () => {
  for (const action of ["track", "notify"] as const) {
    assert.ok(!availableActions(pushed).includes(action), action);
    assert.ok(availableActions(withAwb).includes(action), action);
  }
});

test("the invoice is available as soon as Shiprocket has the order", () => {
  // It belongs to the order, not the shipment, so it does not wait for a
  // courier.
  assert.ok(availableActions(pushed).includes("invoice"));
});

test("the first action offered is the one that moves the parcel on", () => {
  assert.equal(availableActions(fresh)[0], "push");
  assert.equal(availableActions(pushed)[0], "assign_courier");
  assert.equal(availableActions(withAwb)[0], "pickup");
});

test("a collected parcel is not offered another pickup", () => {
  assert.ok(!availableActions(collected).includes("pickup"));
});

// --- what each stage says --------------------------------------------------

test("every stage has a description that says what to do", () => {
  for (const row of [fresh, pushed, withAwb, collected, { ...fresh, orderStatus: "cancelled" }]) {
    const view = describeStage(shipmentStage(row));
    assert.ok(view.label.length > 0);
    assert.ok(view.detail.length > 20);
  }
});

test("no courier explains why there is nothing to track", () => {
  assert.match(describeStage("awaiting_courier").detail, /no AWB|nothing to track/);
});

// --- documents -------------------------------------------------------------

test("a document button says whether it exists yet", () => {
  assert.equal(documentLabel("label", null), "Make label");
  assert.equal(documentLabel("label", "https://x/l.pdf"), "Open label");
  assert.equal(documentLabel("invoice", null), "Make invoice");
});

// --- the queue line --------------------------------------------------------

test("the summary counts what is stuck, not what exists", () => {
  const line = describeQueue([fresh, pushed, withAwb, collected]);
  assert.match(line ?? "", /1 not sent to Shiprocket yet/);
  assert.match(line ?? "", /1 waiting for a courier/);
});

test("nothing stuck means no line at all", () => {
  assert.equal(describeQueue([withAwb, collected]), null);
  assert.equal(describeQueue([]), null);
});

test("an unshippable order is not counted as stuck", () => {
  assert.equal(describeQueue([{ ...fresh, orderStatus: "cancelled" }]), null);
});
