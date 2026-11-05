import test from "node:test";
import assert from "node:assert/strict";
import {
  yearlySlug,
  slugForInterval,
  planSignupHref,
  planCheckoutHref,
  planFromParam,
  authNextFor,
} from "../src/lib/plan-checkout.ts";

const KNOWN = ["starter", "starter-yearly", "growth", "growth-yearly", "scale"];

test("a monthly slug becomes its yearly row", () => {
  assert.equal(yearlySlug("growth"), "growth-yearly");
});

test("a slug that is already yearly is left alone", () => {
  // Otherwise a second pass gives growth-yearly-yearly, which matches no row.
  assert.equal(yearlySlug("growth-yearly"), "growth-yearly");
});

test("the interval switch picks the right row either way", () => {
  assert.equal(slugForInterval("growth", true), "growth-yearly");
  assert.equal(slugForInterval("growth", false), "growth");
  assert.equal(slugForInterval("growth-yearly", false), "growth");
  assert.equal(slugForInterval("growth-yearly", true), "growth-yearly");
});

test("choosing a plan goes straight to payment, carrying the slug", () => {
  // Not to sign-up. That put a form in front of somebody who had already
  // decided and had their card out.
  assert.equal(planSignupHref("growth"), "/checkout?plan=growth");
  assert.equal(planCheckoutHref("growth"), "/billing?plan=growth");
});

test("a slug that is not a slug falls back rather than building a broken link", () => {
  for (const bad of ["", "  ", "../admin", "a b", "Growth!"]) {
    assert.equal(planSignupHref(bad), "/#pricing");
    assert.equal(planCheckoutHref(bad), "/billing");
  }
});

// --- what arrives in the address bar ---------------------------------------

test("a known plan is accepted", () => {
  assert.equal(planFromParam("growth", KNOWN), "growth");
  assert.equal(planFromParam("growth-yearly", KNOWN), "growth-yearly");
});

test("a plan nobody sells is refused, not passed through", () => {
  // This decides what somebody is about to be charged for, and it comes
  // from a link anyone can edit.
  assert.equal(planFromParam("enterprise-free", KNOWN), null);
  assert.equal(planFromParam("../../etc/passwd", KNOWN), null);
  assert.equal(planFromParam("growth'--", KNOWN), null);
});

test("a missing plan is simply no plan", () => {
  assert.equal(planFromParam(null, KNOWN), null);
  assert.equal(planFromParam(undefined, KNOWN), null);
  assert.equal(planFromParam("", KNOWN), null);
});

test("case and stray spaces are tolerated, because links get retyped", () => {
  assert.equal(planFromParam("  GROWTH  ", KNOWN), "growth");
});

test("no known plans means nothing is accepted", () => {
  assert.equal(planFromParam("growth", []), null);
});

// --- coming back from a confirmation email ---------------------------------

test("the email link comes back to the plan, not to the overview", () => {
  // Between pressing Choose plan and opening the email, the choice used to
  // be lost entirely.
  assert.equal(authNextFor("growth"), "/billing?plan=growth");
});

test("signing up without choosing a plan lands on the overview", () => {
  assert.equal(authNextFor(null), "/overview");
});
