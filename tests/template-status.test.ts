import { test } from "node:test";
import assert from "node:assert/strict";
import { readTemplateDecision } from "../src/lib/template-status.ts";

test("an approval is read as approved", () => {
  const decision = readTemplateDecision({
    event: "APPROVED",
    message_template_id: 1234567890,
    message_template_name: "marketing",
    message_template_language: "en_US",
    reason: "NONE",
  });

  assert.equal(decision?.status, "approved");
  assert.equal(decision?.templateId, "1234567890");
  assert.equal(decision?.name, "marketing");
  assert.equal(decision?.language, "en_US");
  // "NONE" is Meta's way of saying nothing, not a reason to display.
  assert.equal(decision?.reason, null);
});

test("a numeric template id becomes a string", () => {
  // The column is text and JSON gives a number; comparing the two silently
  // matches nothing.
  assert.equal(readTemplateDecision({ event: "APPROVED", message_template_id: 42 })?.templateId, "42");
});

test("every state that stops a template sending maps to one that blocks", () => {
  for (const event of ["DISABLED", "DELETED", "PENDING_DELETION"]) {
    assert.equal(readTemplateDecision({ event })?.status, "disabled", event);
  }
  for (const event of ["FLAGGED", "PAUSED"]) {
    assert.equal(readTemplateDecision({ event })?.status, "paused", event);
  }
});

test("an appeal and its reinstatement are both understood", () => {
  assert.equal(readTemplateDecision({ event: "IN_APPEAL" })?.status, "in_appeal");
  assert.equal(readTemplateDecision({ event: "REINSTATED" })?.status, "approved");
});

test("an unrecognised event is ignored rather than guessed", () => {
  // Guessing "approved" would send uncleared messages; guessing "disabled"
  // would silently stop a campaign that was fine.
  assert.equal(readTemplateDecision({ event: "SOMETHING_NEW" }), null);
  assert.equal(readTemplateDecision({}), null);
});

test("the event name is read however Meta cases it", () => {
  assert.equal(readTemplateDecision({ event: " approved " })?.status, "approved");
});

test("a rejection carries the reason Meta gave", () => {
  const decision = readTemplateDecision({
    event: "REJECTED",
    reason: "INVALID_FORMAT",
    other_info: { title: "Content violates policy", description: "Promotional content in a utility template." },
  });

  assert.match(decision!.reason!, /INVALID_FORMAT/);
  assert.match(decision!.reason!, /Promotional content/);
});

test("a rejection with no reason still says it was rejected", () => {
  // Otherwise the row reads as approved-but-idle and nobody knows why.
  const decision = readTemplateDecision({ event: "REJECTED", reason: "NONE" });
  assert.match(decision!.reason!, /rejected/i);
});

test("an approval never carries a made-up reason", () => {
  assert.equal(readTemplateDecision({ event: "APPROVED" })?.reason, null);
});
