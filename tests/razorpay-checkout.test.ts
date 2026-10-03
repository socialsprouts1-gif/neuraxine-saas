import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  MIN_PAISE,
  toPaise,
  checkAmount,
  checkoutSignature,
  verifyCheckoutSignature,
  readCheckoutFields,
  razorpayKeyMode,
  maskKeyId,
  describeKeyRejection,
} from "../src/lib/razorpay-checkout.ts";

const SECRET = "test_secret_not_a_real_key";

function signed(orderId: string, paymentId: string, secret = SECRET) {
  return {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex"),
  };
}

// --- the amount -----------------------------------------------------------

test("paise are the minor unit already, so nothing is multiplied", () => {
  // The bug this guards: "cents" in a rupee amount invites a ×100.
  assert.equal(toPaise(99900), 99900);
  const checked = checkAmount(99900);
  assert.equal(checked.ok, true);
  assert.equal(checked.ok ? checked.paise : 0, 99900);
});

test("Razorpay's one-rupee floor is enforced before the call", () => {
  const result = checkAmount(99);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /100 paise/);
  assert.equal(checkAmount(MIN_PAISE).ok, true);
});

test("zero and negative amounts are refused", () => {
  assert.equal(checkAmount(0).ok, false);
  assert.equal(checkAmount(-500).ok, false);
});

test("a non-number amount is refused rather than sent as NaN", () => {
  assert.equal(checkAmount(Number.NaN).ok, false);
  assert.equal(checkAmount(Number.POSITIVE_INFINITY).ok, false);
});

// --- the signature --------------------------------------------------------

test("the signature is over order|payment, in that order", () => {
  // Razorpay's documented algorithm. Getting the order or the separator
  // wrong produces a signature that never matches and looks like a bad key.
  const expected = createHmac("sha256", SECRET).update("order_abc|pay_xyz").digest("hex");
  assert.equal(checkoutSignature("order_abc", "pay_xyz", SECRET), expected);
});

test("a genuine response verifies", () => {
  assert.equal(verifyCheckoutSignature(signed("order_abc", "pay_xyz"), SECRET), true);
});

test("swapping the two ids does not verify", () => {
  // It would if the two were concatenated without a separator.
  const real = signed("order_abc", "pay_xyz");
  const swapped = {
    ...real,
    razorpay_order_id: real.razorpay_payment_id,
    razorpay_payment_id: real.razorpay_order_id,
  };
  assert.equal(verifyCheckoutSignature(swapped, SECRET), false);
});

test("a tampered payment id does not verify", () => {
  const real = signed("order_abc", "pay_xyz");
  assert.equal(
    verifyCheckoutSignature({ ...real, razorpay_payment_id: "pay_someoneelse" }, SECRET),
    false
  );
});

test("a signature made with another key does not verify", () => {
  assert.equal(verifyCheckoutSignature(signed("o", "p", "other_secret"), SECRET), false);
});

test("empty fields or an empty secret never verify", () => {
  const real = signed("order_abc", "pay_xyz");
  assert.equal(verifyCheckoutSignature({ ...real, razorpay_signature: "" }, SECRET), false);
  assert.equal(verifyCheckoutSignature({ ...real, razorpay_order_id: "" }, SECRET), false);
  assert.equal(verifyCheckoutSignature({ ...real, razorpay_payment_id: "" }, SECRET), false);
  assert.equal(verifyCheckoutSignature(real, ""), false);
});

test("a signature of the wrong length is refused, not thrown on", () => {
  // timingSafeEqual throws on a length mismatch, which would be a 500
  // instead of a clean rejection.
  const real = signed("order_abc", "pay_xyz");
  assert.equal(verifyCheckoutSignature({ ...real, razorpay_signature: "abc" }, SECRET), false);
  assert.equal(
    verifyCheckoutSignature({ ...real, razorpay_signature: "f".repeat(200) }, SECRET),
    false
  );
});

// --- reading the body -----------------------------------------------------

test("a body missing any field is rejected before verifying", () => {
  const real = signed("order_abc", "pay_xyz");
  assert.ok(readCheckoutFields(real));
  assert.equal(readCheckoutFields({ ...real, razorpay_signature: undefined }), null);
  assert.equal(readCheckoutFields({}), null);
  assert.equal(readCheckoutFields(null), null);
  assert.equal(readCheckoutFields("nonsense"), null);
});

test("whitespace-only fields count as missing", () => {
  const real = signed("order_abc", "pay_xyz");
  assert.equal(readCheckoutFields({ ...real, razorpay_order_id: "   " }), null);
});

test("fields are trimmed, so a stray space cannot fail a good payment", () => {
  const real = signed("order_abc", "pay_xyz");
  const read = readCheckoutFields({ ...real, razorpay_payment_id: " pay_xyz " });
  assert.equal(read?.razorpay_payment_id, "pay_xyz");
  assert.equal(verifyCheckoutSignature(read!, SECRET), true);
});

// --- telling somebody why a key pair was refused --------------------------

test("the mode is read off the key's own prefix", () => {
  assert.equal(razorpayKeyMode("rzp_test_TeQchBfSt1dJIm"), "test");
  assert.equal(razorpayKeyMode("rzp_live_AbCdEfGhIjKlMn"), "live");
  assert.equal(razorpayKeyMode("RZP_TEST_upper"), "test");
});

test("anything that is not a Razorpay key reads as unknown", () => {
  assert.equal(razorpayKeyMode(""), "unknown");
  assert.equal(razorpayKeyMode(null), "unknown");
  assert.equal(razorpayKeyMode(undefined), "unknown");
  assert.equal(razorpayKeyMode("sk_live_something_else"), "unknown");
});

test("a key id is shortened but still recognisable", () => {
  // Not a secret, but printing the whole thing in an error invites it into
  // a screenshot for no benefit.
  const masked = maskKeyId("rzp_test_TeQchBfSt1dJIm");
  assert.match(masked, /^rzp_test_TeQ/);
  assert.match(masked, /dJIm$/);
  assert.ok(masked.includes("…"));
  assert.equal(maskKeyId(""), "none stored");
});

test("the rejection names the stored key's mode rather than asking about it", () => {
  const message = describeKeyRejection("rzp_test_TeQchBfSt1dJIm");
  assert.match(message, /test key/);
  assert.match(message, /rzp_test_TeQ/);
});

test("the rejection mentions that regenerating kills the old secret", () => {
  // The likeliest cause and the least obvious: the key id still looks
  // right, and the secret written down last week is already dead.
  assert.match(describeKeyRejection("rzp_live_AbCdEfGhIjKlMn"), /invalidates the old secret/);
});

test("a malformed key is called out as malformed, not as a mode mismatch", () => {
  const message = describeKeyRejection("XJaKYBA7wYSzMl");
  assert.match(message, /does not look like a Razorpay key/);
  assert.doesNotMatch(message, /same mode/);
});
