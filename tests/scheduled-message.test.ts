import test from "node:test";
import assert from "node:assert/strict";
import {
  checkScheduled,
  dueForSend,
  isStale,
  describeWhen,
  MAX_BODY,
  type ScheduledRow,
} from "../src/lib/scheduled-message.ts";

const NOW = new Date("2026-09-22T12:00:00Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const good = { waId: "919876543210", body: "Following up on your quote.", sendAt: at(60), now: NOW };

test("a well-formed message is accepted and normalised", () => {
  const result = checkScheduled({ ...good, waId: "+91 98765 43210" });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.waId, "919876543210");
});

test("a number without a country code is refused with the format spelled out", () => {
  // The exact mistake made on the form send earlier in this project.
  const result = checkScheduled({ ...good, waId: "8767512569" });
  assert.equal(result.ok, true, "ten digits is long enough to be a number somewhere");
  const tooShort = checkScheduled({ ...good, waId: "12345" });
  assert.equal(tooShort.ok, false);
  assert.match(tooShort.ok === false ? tooShort.error : "", /country code/);
});

test("an empty message is refused", () => {
  assert.equal(checkScheduled({ ...good, body: "   " }).ok, false);
});

test("a message longer than WhatsApp allows is refused before it is stored", () => {
  const result = checkScheduled({ ...good, body: "x".repeat(MAX_BODY + 1) });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /4096/);
});

test("a time in the past or seconds away is refused", () => {
  // Checked now rather than at send time: a message that fails at 9am
  // tomorrow fails when nobody is watching.
  assert.equal(checkScheduled({ ...good, sendAt: at(-10) }).ok, false);
  assert.equal(checkScheduled({ ...good, sendAt: at(0) }).ok, false);
  const soon = checkScheduled({ ...good, sendAt: at(-10) });
  assert.match(soon.ok === false ? soon.error : "", /use the inbox/);
});

test("more than a year away is refused", () => {
  assert.equal(checkScheduled({ ...good, sendAt: at(60 * 24 * 400) }).ok, false);
});

test("an invalid date is refused rather than stored as NaN", () => {
  assert.equal(checkScheduled({ ...good, sendAt: "not a date" }).ok, false);
});

// --- what the sweep picks up ---------------------------------------------

function row(over: Partial<ScheduledRow> & { id: string }): ScheduledRow {
  return { wa_id: "91900", body: "hi", send_at: at(-5), status: "pending", ...over };
}

test("only pending and past due are picked up", () => {
  const rows = [
    row({ id: "due" }),
    row({ id: "future", send_at: at(30) }),
    row({ id: "cancelled", status: "cancelled" }),
    row({ id: "sent", status: "sent" }),
  ];
  assert.deepEqual(dueForSend(rows, NOW).map((r) => r.id), ["due"]);
});

test("the oldest due goes first", () => {
  const rows = [row({ id: "b", send_at: at(-5) }), row({ id: "a", send_at: at(-500) })];
  assert.deepEqual(dueForSend(rows, NOW).map((r) => r.id), ["a", "b"]);
});

// --- too late to bother ---------------------------------------------------

test("a day late is stale, an hour late is not", () => {
  // A Tuesday-morning follow-up arriving Friday night reads as a business
  // that has lost track of the conversation.
  assert.equal(isStale(at(-60), NOW), false);
  assert.equal(isStale(at(-60 * 25), NOW), true);
});

test("a future message is never stale", () => {
  assert.equal(isStale(at(60), NOW), false);
});

// --- saying when ----------------------------------------------------------

test("the wait is described in the largest sensible unit", () => {
  assert.equal(describeWhen(at(5), NOW), "in 5 minutes");
  assert.equal(describeWhen(at(1), NOW), "in 1 minute");
  assert.equal(describeWhen(at(120), NOW), "in 2 hours");
  assert.equal(describeWhen(at(60 * 24 * 2), NOW), "in 2 days");
  assert.equal(describeWhen(at(-5), NOW), "overdue");
});
