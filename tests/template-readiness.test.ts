import { test } from "node:test";
import assert from "node:assert/strict";
import { describeReadiness, templateReadiness } from "../src/lib/template-readiness.ts";

test("only an approved template sends", () => {
  assert.equal(templateReadiness("approved"), "ready");
  assert.equal(describeReadiness("approved"), null);
});

test("a template still with Meta is worth waiting for", () => {
  // The whole point: these end on their own, so the queue holds rather
  // than burning an audience that was never attempted.
  for (const status of ["pending", "draft", "in_appeal"]) {
    assert.equal(templateReadiness(status), "waiting", status);
  }
});

test("a refused template is not worth waiting for", () => {
  for (const status of ["rejected", "disabled", "paused"]) {
    assert.equal(templateReadiness(status), "blocked", status);
  }
});

test("an unknown status blocks rather than queueing people behind it", () => {
  // Guessing "waiting" for a state Meta invents later parks recipients
  // forever with nothing on screen saying why.
  assert.equal(templateReadiness("something_new"), "blocked");
  assert.equal(templateReadiness(null), "blocked");
  assert.equal(templateReadiness(""), "blocked");
});

test("status is read however Meta capitalises it", () => {
  assert.equal(templateReadiness("APPROVED"), "ready");
  assert.equal(templateReadiness(" Pending "), "waiting");
});

test("waiting explains itself without asking anyone to come back", () => {
  const said = describeReadiness("pending");
  assert.match(said!, /approve/i);
  assert.match(said!, /sends itself/i);
});

test("blocked names the status so it can be acted on", () => {
  assert.match(describeReadiness("rejected")!, /rejected/);
});
