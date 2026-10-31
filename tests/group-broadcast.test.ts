import test from "node:test";
import assert from "node:assert/strict";
import {
  planBroadcast,
  describePlan,
  explainSkip,
  checkBody,
  MAX_BODY,
  type GroupMember,
} from "../src/lib/group-broadcast.ts";

const NOW = new Date("2026-09-22T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function member(over: Partial<GroupMember> & { contactId: string }): GroupMember {
  return {
    name: `c${over.contactId}`,
    waId: "919000000000",
    lastInboundAt: hoursAgo(1),
    conversationId: `conv-${over.contactId}`,
    ...over,
  };
}

test("somebody who wrote in recently can be messaged", () => {
  const plan = planBroadcast([member({ contactId: "a" })], NOW);
  assert.equal(plan.send.length, 1);
  assert.equal(plan.skipped.length, 0);
});

test("somebody who last wrote over a day ago needs a template", () => {
  const plan = planBroadcast([member({ contactId: "a", lastInboundAt: hoursAgo(25) })], NOW);
  assert.equal(plan.send.length, 0);
  assert.equal(plan.skipped[0].why, "outside_window");
});

test("exactly on the window boundary is still allowed", () => {
  const plan = planBroadcast([member({ contactId: "a", lastInboundAt: hoursAgo(24) })], NOW);
  assert.equal(plan.send.length, 1);
});

test("somebody who has never written cannot be sent plain text", () => {
  const plan = planBroadcast(
    [member({ contactId: "a", lastInboundAt: null, conversationId: null })],
    NOW
  );
  assert.equal(plan.skipped[0].why, "no_conversation");
});

test("an opt-out beats everything else", () => {
  // The one mistake here with a legal edge as well as a human one.
  const plan = planBroadcast(
    [member({ contactId: "a", optedOut: true, lastInboundAt: hoursAgo(1) })],
    NOW
  );
  assert.equal(plan.send.length, 0);
  assert.equal(plan.skipped[0].why, "opted_out");
});

test("an unparseable last-inbound date is treated as outside the window", () => {
  // Erring towards not sending: a refused message costs nothing, a message
  // Meta rejects costs the number's standing.
  const plan = planBroadcast([member({ contactId: "a", lastInboundAt: "rubbish" })], NOW);
  assert.equal(plan.skipped[0].why, "outside_window");
});

test("a mixed group splits into both lists", () => {
  const plan = planBroadcast(
    [
      member({ contactId: "now" }),
      member({ contactId: "old", lastInboundAt: hoursAgo(48) }),
      member({ contactId: "never", lastInboundAt: null, conversationId: null }),
      member({ contactId: "gone", optedOut: true }),
    ],
    NOW
  );
  assert.deepEqual(plan.send.map((m) => m.contactId), ["now"]);
  assert.equal(plan.skipped.length, 3);
});

// --- what the operator is told before pressing send ----------------------

test("an empty group says so rather than reporting zero of zero", () => {
  assert.match(describePlan(planBroadcast([], NOW)), /no contacts in it yet/);
});

test("a fully reachable group says so plainly", () => {
  const plan = planBroadcast([member({ contactId: "a" }), member({ contactId: "b" })], NOW);
  assert.equal(describePlan(plan), "All 2 can be messaged now.");
});

test("skips are counted by reason, not lumped into one number", () => {
  // "6 skipped" invites the assumption that they failed. Naming the reason
  // turns it into a decision about running a campaign instead.
  const plan = planBroadcast(
    [
      member({ contactId: "a" }),
      member({ contactId: "b", lastInboundAt: hoursAgo(48) }),
      member({ contactId: "c", lastInboundAt: hoursAgo(72) }),
      member({ contactId: "d", optedOut: true }),
    ],
    NOW
  );
  const text = describePlan(plan);
  assert.match(text, /1 of 4 can be messaged now/);
  assert.match(text, /2 last wrote more than 24 hours ago/);
  assert.match(text, /1 asked not to be messaged/);
});

test("a group nobody can be messaged in points at campaigns", () => {
  const plan = planBroadcast([member({ contactId: "a", lastInboundAt: hoursAgo(48) })], NOW);
  assert.match(describePlan(plan), /campaign with an approved template/);
});

test("every skip reason has words", () => {
  for (const why of ["opted_out", "no_conversation", "outside_window"] as const) {
    assert.ok(explainSkip(why).length > 10, why);
  }
});

// --- the message itself ---------------------------------------------------

test("an empty message is refused", () => {
  assert.equal(checkBody("   ").ok, false);
});

test("one longer than WhatsApp allows is refused before anything is sent", () => {
  const result = checkBody("x".repeat(MAX_BODY + 1));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /4096/);
});

test("a normal message is trimmed and accepted", () => {
  const result = checkBody("  hello  ");
  assert.equal(result.ok && result.body, "hello");
});
