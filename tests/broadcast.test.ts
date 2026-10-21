import test from "node:test";
import assert from "node:assert/strict";
import {
  planBroadcast,
  broadcastKey,
  explainSkip,
  BROADCAST_KIND,
  type BroadcastOrg,
} from "../src/lib/broadcast.ts";

const DAY = new Date("2026-09-17T14:00:00Z");

function org(over: Partial<BroadcastOrg> & { id: string }): BroadcastOrg {
  return { name: `org ${over.id}`, suspendedAt: null, email: `${over.id}@x.com`, ...over };
}

test("everybody with an address is on the list", () => {
  const plan = planBroadcast([org({ id: "a" }), org({ id: "b" })], [], DAY);
  assert.deepEqual(plan.send.map((row) => row.email), ["a@x.com", "b@x.com"]);
  assert.deepEqual(plan.skipped, []);
});

test("a workspace with nobody to write to is skipped, not failed", () => {
  const plan = planBroadcast([org({ id: "a", email: null }), org({ id: "b" })], [], DAY);
  assert.deepEqual(plan.send.map((row) => row.email), ["b@x.com"]);
  assert.equal(plan.skipped[0].why, "no_email");
});

test("a blank address counts as no address", () => {
  const plan = planBroadcast([org({ id: "a", email: "   " })], [], DAY);
  assert.equal(plan.send.length, 0);
  assert.equal(plan.skipped[0].why, "no_email");
});

test("a suspended workspace is left alone", () => {
  // Inviting somebody into a product they cannot open is worse than silence.
  const plan = planBroadcast([org({ id: "a", suspendedAt: "2026-09-01T00:00:00Z" })], [], DAY);
  assert.equal(plan.send.length, 0);
  assert.equal(plan.skipped[0].why, "suspended");
});

test("an unsubscribed address is honoured, whatever the case", () => {
  const plan = planBroadcast([org({ id: "a", email: "A@X.com" })], ["a@x.com"], DAY);
  assert.equal(plan.send.length, 0);
  assert.equal(plan.skipped[0].why, "unsubscribed");
});

test("the opt-out list is matched case-insensitively too", () => {
  const plan = planBroadcast([org({ id: "a", email: "a@x.com" })], ["  A@X.COM "], DAY);
  assert.equal(plan.send.length, 0);
});

test("one person owning two workspaces gets one message", () => {
  const plan = planBroadcast([org({ id: "a" }), org({ id: "b", email: "a@x.com" })], [], DAY);
  assert.equal(plan.send.length, 1);
  assert.equal(plan.skipped[0].why, "same_person");
});

test("addresses are normalised before sending, not just before comparing", () => {
  const plan = planBroadcast([org({ id: "a", email: " Mixed@Case.COM " })], [], DAY);
  assert.equal(plan.send[0].email, "mixed@case.com");
});

test("the key is per workspace per day, so a double click cannot send twice", () => {
  assert.equal(broadcastKey("org1", DAY), `org1:${BROADCAST_KIND}:2026-09-17`);
  assert.equal(broadcastKey("org1", new Date("2026-09-17T23:59:00Z")), broadcastKey("org1", DAY));
  assert.notEqual(broadcastKey("org1", new Date("2026-09-18T00:01:00Z")), broadcastKey("org1", DAY));
  assert.notEqual(broadcastKey("org2", DAY), broadcastKey("org1", DAY));
});

test("an empty list plans nothing rather than throwing", () => {
  assert.deepEqual(planBroadcast([], [], DAY), { send: [], skipped: [] });
});

test("every skip reason has words for the operator", () => {
  for (const why of ["no_email", "suspended", "unsubscribed", "same_person"] as const) {
    assert.ok(explainSkip(why).length > 10, why);
  }
});
