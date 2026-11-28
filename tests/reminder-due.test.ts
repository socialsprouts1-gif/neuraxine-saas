import test from "node:test";
import assert from "node:assert/strict";
import {
  dueNow,
  pollDelay,
  describeLateness,
  IDLE_POLL_MS,
  NEAR_POLL_MS,
  type DueCandidate,
} from "../src/lib/reminder-due.ts";

const NOW = new Date("2026-09-22T12:00:00Z");
const at = (offsetMinutes: number) =>
  new Date(NOW.getTime() + offsetMinutes * 60_000).toISOString();

function reminder(over: Partial<DueCandidate> & { id: string }): DueCandidate {
  return { title: `r${over.id}`, body: null, remind_at: at(-1), status: "pending", ...over };
}

test("a reminder whose time has passed is due", () => {
  assert.equal(dueNow([reminder({ id: "a" })], NOW).length, 1);
});

test("one due in the future is not", () => {
  assert.equal(dueNow([reminder({ id: "a", remind_at: at(30) })], NOW).length, 0);
});

test("due exactly now counts as due", () => {
  assert.equal(dueNow([reminder({ id: "a", remind_at: at(0) })], NOW).length, 1);
});

test("cancelled and already-sent reminders never surface", () => {
  // Re-raising one that has been shown is how a notification becomes noise.
  const rows = [
    reminder({ id: "a", status: "cancelled" }),
    reminder({ id: "b", status: "sent" }),
    reminder({ id: "c", status: "failed" }),
  ];
  assert.deepEqual(dueNow(rows, NOW), []);
});

test("one already acknowledged this session does not come back", () => {
  const rows = [reminder({ id: "a" }), reminder({ id: "b" })];
  assert.deepEqual(dueNow(rows, NOW, new Set(["a"])).map((r) => r.id), ["b"]);
});

test("the most overdue is shown first", () => {
  const rows = [
    reminder({ id: "recent", remind_at: at(-5) }),
    reminder({ id: "ancient", remind_at: at(-4000) }),
    reminder({ id: "middle", remind_at: at(-60) }),
  ];
  assert.deepEqual(dueNow(rows, NOW).map((r) => r.id), ["ancient", "middle", "recent"]);
});

test("an unparseable date is skipped rather than treated as due", () => {
  assert.deepEqual(dueNow([reminder({ id: "a", remind_at: "not a date" })], NOW), []);
});

// --- how often to look again ---------------------------------------------

test("nothing scheduled means the slow poll", () => {
  assert.equal(pollDelay([], NOW), IDLE_POLL_MS);
});

test("something due within five minutes tightens the poll", () => {
  assert.equal(pollDelay([reminder({ id: "a", remind_at: at(3) })], NOW), NEAR_POLL_MS);
});

test("something far off does not", () => {
  // Polling every fifteen seconds for a reminder set next week is a waste
  // of somebody's battery.
  assert.equal(pollDelay([reminder({ id: "a", remind_at: at(60 * 24) })], NOW), IDLE_POLL_MS);
});

test("an already-overdue reminder does not speed up the poll on its own", () => {
  // It is already on screen; the interval is about what is coming.
  assert.equal(pollDelay([reminder({ id: "a", remind_at: at(-10) })], NOW), IDLE_POLL_MS);
});

test("the soonest pending one decides, not the first in the list", () => {
  const rows = [
    reminder({ id: "far", remind_at: at(600) }),
    reminder({ id: "near", remind_at: at(2) }),
  ];
  assert.equal(pollDelay(rows, NOW), NEAR_POLL_MS);
});

// --- how late it is -------------------------------------------------------

test("lateness is said in the largest sensible unit", () => {
  assert.equal(describeLateness(at(0), NOW), "just now");
  assert.equal(describeLateness(at(-1), NOW), "1 minute ago");
  assert.equal(describeLateness(at(-45), NOW), "45 minutes ago");
  assert.equal(describeLateness(at(-60), NOW), "1 hour ago");
  assert.equal(describeLateness(at(-60 * 5), NOW), "5 hours ago");
  assert.equal(describeLateness(at(-60 * 24), NOW), "1 day ago");
  assert.equal(describeLateness(at(-60 * 24 * 3), NOW), "3 days ago");
});

test("an unparseable date describes as nothing rather than NaN", () => {
  assert.equal(describeLateness("rubbish", NOW), "");
});
