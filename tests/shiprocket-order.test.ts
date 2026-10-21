import test from "node:test";
import assert from "node:assert/strict";
import {
  buildShiprocketOrder,
  toRupees,
  localPhone,
  splitName,
  shippedMessage,
  type OrderForShipping,
} from "../src/lib/shiprocket-order.ts";

const good: OrderForShipping = {
  reference: "NX-1024",
  createdAt: "2026-09-23T10:30:00.000Z",
  currency: "INR",
  subtotalCents: 99900,
  totalCents: 109900,
  shippingCents: 10000,
  discountCents: 0,
  paid: true,
  shipName: "Asha Verma",
  shipPhone: "919876543210",
  shipAddress: "12 MG Road, Indiranagar",
  shipCity: "Bengaluru",
  shipState: "Karnataka",
  shipPincode: "560038",
  shipCountry: "India",
  shipEmail: "asha@example.com",
  weightGrams: 800,
  lengthCm: 20,
  breadthCm: 15,
  heightCm: 8,
  items: [{ name: "Cotton kurta", quantity: 2, unitPriceCents: 49950, sku: "KUR-01" }],
};

// --- money, the expensive one ----------------------------------------------

test("paise become rupees, not the other way round", () => {
  // A missed division declares a 999 rupee order at 99,900 — a customs
  // value, an insurance value, and on COD what the courier collects.
  assert.equal(toRupees(99900), 999);
  assert.equal(toRupees(49950), 499.5);
  assert.equal(toRupees(0), 0);
  assert.equal(toRupees(1), 0.01);
});

test("the payload carries rupees throughout", () => {
  const result = buildShiprocketOrder(good, "Primary");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.sub_total, 999);
  assert.equal(result.payload.shipping_charges, 100);
  assert.equal(result.payload.order_items[0].selling_price, 499.5);
});

// --- the phone -------------------------------------------------------------

test("the country code is stripped, because Shiprocket wants ten digits", () => {
  assert.equal(localPhone("919876543210"), "9876543210");
  assert.equal(localPhone("+91 98765 43210"), "9876543210");
  assert.equal(localPhone("9876543210"), "9876543210");
});

test("a phone that cannot make ten digits is caught before sending", () => {
  const result = buildShiprocketOrder({ ...good, shipPhone: "12345" }, "Primary");
  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.missing.includes("a 10-digit phone number"));
});

// --- the name --------------------------------------------------------------

test("a single-word name still gets a last name, which Shiprocket demands", () => {
  assert.deepEqual(splitName("Asha"), { first: "Asha", last: "." });
  assert.deepEqual(splitName("Asha Verma"), { first: "Asha", last: "Verma" });
  assert.deepEqual(splitName("Asha Rani Verma"), { first: "Asha Rani", last: "Verma" });
});

test("an empty name does not produce an empty field", () => {
  assert.deepEqual(splitName(null), { first: "Customer", last: "." });
  assert.deepEqual(splitName("   "), { first: "Customer", last: "." });
});

// --- what is refused up front ----------------------------------------------

test("a missing address is named before anything is sent", () => {
  const result = buildShiprocketOrder({ ...good, shipAddress: null }, "Primary");
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /street address/);
});

test("a pincode that is not six digits is refused", () => {
  for (const pincode of ["5600", "5600381", "", null]) {
    const result = buildShiprocketOrder({ ...good, shipPincode: pincode }, "Primary");
    assert.equal(result.ok, false, String(pincode));
  }
});

test("a pincode with spaces still counts its digits", () => {
  const result = buildShiprocketOrder({ ...good, shipPincode: "560 038" }, "Primary");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.payload.billing_pincode, "560038");
});

test("everything missing is listed at once, not one per attempt", () => {
  const result = buildShiprocketOrder(
    { ...good, shipAddress: null, shipCity: null, shipPincode: null },
    "Primary"
  );
  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.missing.length === 3);
});

test("no pickup location is refused, because Shiprocket keys on its name", () => {
  const result = buildShiprocketOrder(good, "   ");
  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.missing.includes("a pickup location"));
});

test("an order with no items cannot ship", () => {
  const result = buildShiprocketOrder({ ...good, items: [] }, "Primary");
  assert.equal(result.ok, false);
});

// --- defaults that keep a real order moving --------------------------------

test("an unmeasured parcel gets a stated default rather than a refusal", () => {
  const result = buildShiprocketOrder(
    { ...good, weightGrams: null, lengthCm: null, breadthCm: null, heightCm: null },
    "Primary"
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.weight, 0.5);
  assert.equal(result.payload.length, 10);
});

test("a zero dimension never reaches Shiprocket, which refuses it", () => {
  const result = buildShiprocketOrder({ ...good, weightGrams: 0, lengthCm: 0 }, "Primary");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.payload.weight > 0);
  assert.ok(result.payload.length > 0);
});

// --- prepaid vs COD --------------------------------------------------------

test("an unpaid order ships as COD and a paid one as Prepaid", () => {
  assert.equal(
    buildShiprocketOrder(good, "P").ok &&
      (buildShiprocketOrder(good, "P") as { payload: { payment_method: string } }).payload
        .payment_method,
    "Prepaid"
  );
  const cod = buildShiprocketOrder({ ...good, paid: false }, "P");
  assert.equal(cod.ok && cod.payload.payment_method, "COD");
});

// --- shape details Shiprocket is strict about ------------------------------

test("the order date is the format their parser takes", () => {
  const result = buildShiprocketOrder(good, "Primary");
  assert.equal(result.ok && result.payload.order_date, "2026-09-23 10:30");
});

test("an item with no SKU gets one derived from its name", () => {
  const result = buildShiprocketOrder(
    { ...good, items: [{ name: "Cotton kurta", quantity: 1, unitPriceCents: 100 }] },
    "Primary"
  );
  assert.equal(result.ok && result.payload.order_items[0].sku, "Cotton kurta");
});

test("a fractional quantity becomes a whole number of units", () => {
  const result = buildShiprocketOrder(
    { ...good, items: [{ name: "X", quantity: 0, unitPriceCents: 100 }] },
    "Primary"
  );
  assert.equal(result.ok && result.payload.order_items[0].units, 1);
});

test("country defaults to India rather than being left blank", () => {
  const result = buildShiprocketOrder({ ...good, shipCountry: null }, "Primary");
  assert.equal(result.ok && result.payload.billing_country, "India");
});

// --- the shipped message ---------------------------------------------------

test("the shipped message names the courier and the tracking number", () => {
  const text = shippedMessage({
    orderNumber: "NX-1024",
    awb: "1234567890",
    courier: "Delhivery",
    trackingUrl: "https://track.example/1234567890",
    expectedDelivery: "25 Sep",
  });
  assert.match(text, /shipped with Delhivery/);
  assert.match(text, /Expected by 25 Sep/);
  assert.match(text, /Tracking number: 1234567890/);
  assert.match(text.split("\n").pop() ?? "", /^Track it here:/);
});

test("the shipped message survives a missing courier and link", () => {
  const text = shippedMessage({ orderNumber: "NX-1", awb: "99", courier: null, trackingUrl: null });
  assert.match(text, /^Your order NX-1 has been shipped\./);
  assert.doesNotMatch(text, /Track it here/);
});

// --- fields Shiprocket requires that are easy to miss ----------------------

test("is_document is always sent, because leaving it out is refused", () => {
  // The name reads like a flag rather than a required field, which is
  // exactly why it goes missing.
  const result = buildShiprocketOrder(good, "Primary");
  assert.equal(result.ok && result.payload.is_document, 0);

  const docs = buildShiprocketOrder({ ...good, isDocument: true }, "Primary");
  assert.equal(docs.ok && docs.payload.is_document, 1);
});

test("HSN and tax ride along on an item when they are known", () => {
  const result = buildShiprocketOrder(
    {
      ...good,
      items: [{ name: "Kurta", quantity: 1, unitPriceCents: 100, hsn: "6211", taxPercent: 5 }],
    },
    "Primary"
  );
  assert.equal(result.ok && result.payload.order_items[0].hsn, "6211");
  assert.equal(result.ok && result.payload.order_items[0].tax, 5);
});

test("absent HSN and tax are left out rather than sent as empty", () => {
  const result = buildShiprocketOrder(good, "Primary");
  if (!result.ok) throw new Error("expected ok");
  assert.equal("hsn" in result.payload.order_items[0], false);
  assert.equal("tax" in result.payload.order_items[0], false);
});

test("a GSTIN is upper-cased, which is the only form Shiprocket takes", () => {
  const result = buildShiprocketOrder({ ...good, customerGstin: "29abcde1234f1z5" }, "Primary");
  assert.equal(result.ok && result.payload.customer_gstin, "29ABCDE1234F1Z5");
});

test("notes become the order comment, and blank notes send no comment", () => {
  const withNote = buildShiprocketOrder({ ...good, notes: "Leave with neighbour" }, "Primary");
  assert.equal(withNote.ok && withNote.payload.comment, "Leave with neighbour");

  const without = buildShiprocketOrder({ ...good, notes: "   " }, "Primary");
  if (!without.ok) throw new Error("expected ok");
  assert.equal("comment" in without.payload, false);
});
