import test from "node:test";
import assert from "node:assert/strict";
import { checkFrom, domainOf } from "../src/lib/deliverability.ts";

test("the domain comes out of both address forms", () => {
  assert.equal(domainOf("hello@neurachat.in"), "neurachat.in");
  assert.equal(domainOf("Neura Chat <hello@neurachat.in>"), "neurachat.in");
  assert.equal(domainOf("  Neura <A@Example.COM>  "), "example.com");
});

test("anything that is not an address has no domain", () => {
  assert.equal(domainOf("neurachat"), null);
  assert.equal(domainOf("@nope"), null);
  assert.equal(domainOf("a@"), null);
  assert.equal(domainOf("a@localhost"), null);
  assert.equal(domainOf(""), null);
});

test("a gmail from address over Resend is broken, not merely risky", () => {
  // The case that produces "sent" in the log and silence in the inbox:
  // Resend accepts it, then DMARC fails at the receiving server.
  const result = checkFrom("neurachats@gmail.com", "resend");
  assert.equal(result.level, "broken");
  assert.match(result.summary, /gmail\.com/);
  assert.match(result.fix, /resend\.com\/domains/);
});

test("the same address over Gmail's own server is allowed", () => {
  // Telling somebody their working setup is broken is its own failure.
  const result = checkFrom("neurachats@gmail.com", "smtp", "smtp.gmail.com");
  assert.equal(result.level, "risky");
  assert.match(result.fix, /Promotions/);
});

test("a gmail from address through somebody else's SMTP is broken", () => {
  const result = checkFrom("neurachats@gmail.com", "smtp", "smtp.sendgrid.net");
  assert.equal(result.level, "broken");
  assert.match(result.fix, /smtp\.gmail\.com/);
});

test("case and display names do not change the verdict", () => {
  const result = checkFrom("Neura Chat <NeuraChats@GMAIL.com>", "resend");
  assert.equal(result.level, "broken");
});

test("a domain of your own is fine on either transport", () => {
  assert.equal(checkFrom("hello@neurachat.in", "resend").level, "ok");
  assert.equal(checkFrom("hello@neurachat.in", "smtp", "smtp.zoho.in").level, "ok");
});

test("each transport is told what to check for its own domain", () => {
  assert.match(checkFrom("a@neurachat.in", "resend").fix, /DKIM/);
  assert.match(checkFrom("a@neurachat.in", "smtp", "x").fix, /SPF/);
});

test("a from address that is not an address is caught before anything else", () => {
  const result = checkFrom("neurachat", "resend");
  assert.equal(result.level, "broken");
  assert.match(result.fix, /yourdomain\.com/);
});

test("the other mailbox providers are covered too", () => {
  for (const domain of ["yahoo.com", "outlook.com", "hotmail.com", "icloud.com"]) {
    assert.equal(checkFrom(`a@${domain}`, "resend").level, "broken", domain);
  }
});
