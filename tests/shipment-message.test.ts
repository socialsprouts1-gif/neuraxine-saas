import test from "node:test";
import assert from "node:assert/strict";
import {
  deliveryState,
  customerMessage,
  staffSummary,
  courierDate,
  worthNotifying,
  type Shipment,
} from "../src/lib/shipment-message.ts";

const base: Shipment = {
  awb: "1234567890",
  status: "IN TRANSIT",
  courier: "Delhivery",
  lastUpdate: "Departed from hub · 22 Sep",
  expectedDelivery: "25 Sep 2026",
  trackingUrl: "https://shiprocket.co/tracking/1234567890",
};

// --- reading the courier's wording -----------------------------------------

test("out for delivery is not read as delivered", () => {
  // "out for delivery" contains "delivery", so rule order is the whole
  // correctness of this function.
  assert.equal(deliveryState("OUT FOR DELIVERY"), "out_for_delivery");
  assert.equal(deliveryState("Delivered"), "delivered");
});

test("the common courier strings land somewhere sensible", () => {
  assert.equal(deliveryState("PICKUP SCHEDULED"), "awaiting_pickup");
  assert.equal(deliveryState("AWB Assigned"), "awaiting_pickup");
  assert.equal(deliveryState("Shipped"), "in_transit");
  assert.equal(deliveryState("Reached Destination Hub"), "in_transit");
  assert.equal(deliveryState("RTO INITIATED"), "returning");
  assert.equal(deliveryState("Undelivered"), "problem");
  assert.equal(deliveryState("CANCELED"), "problem");
});

test("something unrecognised is unknown rather than guessed", () => {
  assert.equal(deliveryState("Sorted at facility XYZ"), "unknown");
  assert.equal(deliveryState(""), "unknown");
  assert.equal(deliveryState("   "), "unknown");
});

// --- what the customer is sent ---------------------------------------------

test("the customer gets a sentence, not a scan log", () => {
  const text = customerMessage(base, { orderNumber: "NX-1024" });
  assert.match(text, /on its way with Delhivery/);
  assert.match(text, /order NX-1024/);
  // The courier's shouty string never reaches them.
  assert.doesNotMatch(text, /IN TRANSIT/);
});

test("RTO is never forwarded verbatim", () => {
  // "Return to origin" means it is coming back to the seller. Sending
  // that wording to a customer is alarming and usually wrong.
  const text = customerMessage({ ...base, status: "RTO INITIATED" });
  assert.doesNotMatch(text, /RTO/);
  assert.match(text, /on its way back to us/);
  assert.match(text, /reply here/);
});

test("a delivered parcel is not given a future delivery date", () => {
  const text = customerMessage({ ...base, status: "DELIVERED" });
  assert.match(text, /has been delivered/);
  assert.doesNotMatch(text, /Expected by/);
});

test("the AWB is always included, and the link last when there is one", () => {
  const text = customerMessage(base);
  const lines = text.split("\n");
  assert.match(text, /Tracking number: 1234567890/);
  assert.match(lines[lines.length - 1], /^Track it here: https:/);
});

test("no tracking link means no dangling line", () => {
  const text = customerMessage({ ...base, trackingUrl: null });
  assert.doesNotMatch(text, /Track it here/);
  assert.match(text, /Tracking number/);
});

test("an unknown status falls back to naming it plainly", () => {
  const text = customerMessage({ ...base, status: "Sorted at facility XYZ" });
  assert.match(text, /Sorted at facility XYZ/);
});

test("no order number still produces a readable sentence", () => {
  const text = customerMessage({ ...base, orderNumber: undefined } as Shipment);
  assert.match(text, /Your order is on its way/);
  assert.doesNotMatch(text, /order undefined/);
});

test("no courier does not leave a trailing 'with'", () => {
  const text = customerMessage({ ...base, courier: null });
  assert.doesNotMatch(text, /with\s*\./);
  assert.match(text, /on its way\./);
});

// --- the staff view --------------------------------------------------------

test("staff keep the courier's own words", () => {
  const line = staffSummary(base);
  assert.match(line, /IN TRANSIT/);
  assert.match(line, /via Delhivery/);
  assert.match(line, /due 25 Sep 2026/);
  assert.match(line, /Departed from hub/);
});

test("staff summary drops the parts that are missing", () => {
  const line = staffSummary({
    ...base,
    courier: null,
    expectedDelivery: null,
    lastUpdate: null,
  });
  assert.equal(line, "1234567890: IN TRANSIT");
});

// --- when to speak unprompted ----------------------------------------------

test("only the states a customer would want unprompted", () => {
  assert.equal(worthNotifying("out_for_delivery"), true);
  assert.equal(worthNotifying("delivered"), true);
  assert.equal(worthNotifying("problem"), true);
  assert.equal(worthNotifying("in_transit"), false);
  assert.equal(worthNotifying("awaiting_pickup"), false);
  assert.equal(worthNotifying("unknown"), false);
});

// --- how a courier's timestamp is written down -----------------------------

test("a midnight timestamp is a date, not a time", () => {
  // Shiprocket sends "2026-09-29 00:00:00" for "expected on the 29th".
  // Printing the zeros makes the panel look like a database dump.
  assert.equal(courierDate("2026-09-29 00:00:00"), "29 Sep");
});

test("one second to midnight is also just the day", () => {
  assert.equal(courierDate("2026-09-25 23:59:59"), "25 Sep");
});

test("a real time of day is kept, because that one is news", () => {
  assert.equal(courierDate("2026-09-25 14:30:00"), "25 Sep, 2:30pm");
  assert.equal(courierDate("2026-09-25 09:05:00"), "25 Sep, 9:05am");
});

test("noon and midday read correctly rather than as zero", () => {
  assert.equal(courierDate("2026-09-25 12:00:00"), "25 Sep, 12:00pm");
});

test("a bare date needs no time appended", () => {
  assert.equal(courierDate("2026-09-29"), "29 Sep");
});

test("an ISO timestamp is understood too", () => {
  assert.equal(courierDate("2026-09-29T16:45:00"), "29 Sep, 4:45pm");
});

test("nothing in, nothing out", () => {
  assert.equal(courierDate(null), "");
  assert.equal(courierDate(undefined), "");
  assert.equal(courierDate("   "), "");
});

test("something unrecognisable is shown rather than swallowed", () => {
  // Better an odd string on screen than a blank where a date should be.
  assert.equal(courierDate("tomorrow-ish"), "tomorrow-ish");
});
