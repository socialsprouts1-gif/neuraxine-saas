import test from "node:test";
import assert from "node:assert/strict";
import { delayMs, MAX_DELAY_MS, INLINE_DELAY_LIMIT_MS } from "../src/lib/flow-engine.ts";
import type { FlowNode } from "../src/types/flow.ts";

const delay = (value: unknown, unit?: unknown): FlowNode => ({
  id: "d1",
  kind: "delay",
  position: { x: 0, y: 0 },
  data: unit === undefined ? { value } : { value, unit },
});

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test("every unit the builder offers is honoured", () => {
  assert.equal(delayMs(delay(10, "seconds")), 10 * SECOND);
  assert.equal(delayMs(delay(30, "minutes")), 30 * MINUTE);
  assert.equal(delayMs(delay(2, "hours")), 2 * HOUR);
  assert.equal(delayMs(delay(1, "days")), DAY);
});

test("a one-day delay is a day, not a second", () => {
  // The bug: "days" was not in the multiplier table and fell through to
  // seconds, so a flow set to wait a day carried straight on.
  assert.notEqual(delayMs(delay(1, "days")), SECOND);
  assert.equal(delayMs(delay(1, "days")), 86_400_000);
});

test("two hours is two hours", () => {
  assert.equal(delayMs(delay(2, "hours")), 7_200_000);
});

test("a ten second delay runs inline rather than parking", () => {
  assert.ok(delayMs(delay(10, "seconds")) <= INLINE_DELAY_LIMIT_MS);
  assert.ok(delayMs(delay(11, "seconds")) > INLINE_DELAY_LIMIT_MS);
});

test("the number arrives as a string from the builder's input", () => {
  // <input type="number"> hands back a string on some paths; a delay that
  // silently became zero would look exactly like the node doing nothing.
  assert.equal(delayMs(delay("15", "minutes")), 15 * MINUTE);
});

test("nonsense is a zero wait, never a negative or NaN one", () => {
  assert.equal(delayMs(delay(-5, "hours")), 0);
  assert.equal(delayMs(delay("abc", "hours")), 0);
  assert.equal(delayMs(delay(undefined, "hours")), 0);
});

test("a missing unit still means seconds, as every saved flow assumes", () => {
  assert.equal(delayMs(delay(45)), 45 * SECOND);
});

test("an unknown unit falls back to seconds rather than to nothing", () => {
  assert.equal(delayMs(delay(45, "fortnights")), 45 * SECOND);
});

test("an absurd wait is capped instead of parking a chat until next year", () => {
  assert.equal(delayMs(delay(9999, "days")), MAX_DELAY_MS);
  assert.equal(MAX_DELAY_MS, 30 * DAY);
});
