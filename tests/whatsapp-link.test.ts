import test from "node:test";
import assert from "node:assert/strict";
import {
  normaliseWaNumber,
  displayWaNumber,
  whatsappHref,
} from "../src/lib/whatsapp-link.ts";

// wa.me takes digits only, country code included. A malformed number does
// not fail loudly — WhatsApp opens and says the number is invalid, which
// the visitor reads as the business being broken.

test("the number on the site, however it is written", () => {
  for (const written of [
    "8767512569",
    "+91 8767512569",
    "+91 87675 12569",
    "091 87675-12569",
    "0091-8767512569",
    "(+91) 87675 12569",
  ]) {
    assert.equal(normaliseWaNumber(written), "918767512569", written);
  }
});

test("a number already carrying its country code is left as it is", () => {
  assert.equal(normaliseWaNumber("918767512569"), "918767512569");
  assert.equal(normaliseWaNumber("+1 415 555 0123"), "14155550123");
});

test("another country's default can be given", () => {
  assert.equal(normaliseWaNumber("4155550123", "1"), "14155550123");
});

test("something that is not a number gives nothing, not a broken link", () => {
  for (const bad of ["", "   ", "abc", "12345", "1234567890123456789"]) {
    assert.equal(normaliseWaNumber(bad), null, bad);
  }
});

test("the displayed form is the one people recognise", () => {
  assert.equal(displayWaNumber("8767512569"), "+91 87675 12569");
  assert.equal(displayWaNumber("918767512569"), "+91 87675 12569");
});

test("an unreadable number is shown back unchanged rather than mangled", () => {
  assert.equal(displayWaNumber("not a number"), "not a number");
});

// --- the link --------------------------------------------------------------

test("the link opens WhatsApp on the number", () => {
  assert.equal(whatsappHref("8767512569"), "https://wa.me/918767512569");
});

test("a first message is carried, encoded", () => {
  const href = whatsappHref("8767512569", "Hi! I'd like to know about NeuraChat.");
  assert.equal(
    href,
    "https://wa.me/918767512569?text=Hi!%20I'd%20like%20to%20know%20about%20NeuraChat."
  );
});

test("an empty message is left off rather than sent as ?text=", () => {
  assert.equal(whatsappHref("8767512569", "   "), "https://wa.me/918767512569");
});

test("an overlong message is cut rather than refused", () => {
  const href = whatsappHref("8767512569", "x".repeat(2000));
  assert.ok(href);
  assert.equal(new URL(href).searchParams.get("text")!.length, 1000);
});

test("a bad number gives no link at all, so nothing is rendered", () => {
  assert.equal(whatsappHref("nope"), null);
});
