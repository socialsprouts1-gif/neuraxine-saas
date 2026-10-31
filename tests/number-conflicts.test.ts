import { strict as assert } from "node:assert";
import { test } from "node:test";
import { conflicts, describeConflict, type Claimant } from "../src/lib/number-conflicts.ts";

function who(overrides: Partial<Claimant> & { id: string; name: string }): Claimant {
  return { connectionId: null, createdAt: "2026-01-01T00:00:00Z", isActive: true, ...overrides };
}

test("one assistant on a number is not a conflict", () => {
  assert.deepEqual(conflicts([who({ id: "a", name: "real estate", connectionId: "n1" })]), []);
});

test("a catch-all under a pinned one is not a conflict", () => {
  // The most ordinary setup there is: one assistant for a particular
  // number, one for everything else. Warning about it would be noise.
  const out = conflicts([
    who({ id: "pinned", name: "real estate", connectionId: "n1" }),
    who({ id: "any", name: "neuraxie", connectionId: null }),
  ]);
  assert.deepEqual(out, []);
});

test("two on the same number name the one that answers", () => {
  const out = conflicts([
    who({ id: "artitech", name: "artitech", connectionId: "n1", createdAt: "2026-06-02T00:00:00Z" }),
    who({ id: "estate", name: "real estate", connectionId: "n1", createdAt: "2026-06-01T00:00:00Z" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].answering.id, "estate");
  assert.deepEqual(out[0].shadowed.map((r) => r.id), ["artitech"]);
});

test("two catch-alls conflict with each other", () => {
  const out = conflicts([
    who({ id: "one", name: "neuraxie", createdAt: "2026-01-01T00:00:00Z" }),
    who({ id: "two", name: "neurachat", createdAt: "2026-02-01T00:00:00Z" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].connectionId, null);
  assert.equal(out[0].answering.id, "one");
});

test("a paused one cannot shadow anything", () => {
  const out = conflicts([
    who({ id: "live", name: "real estate", connectionId: "n1" }),
    who({ id: "paused", name: "neurachat", connectionId: "n1", isActive: false }),
  ]);
  assert.deepEqual(out, []);
});

test("three on one number shadow two", () => {
  const out = conflicts([
    who({ id: "a", name: "A", connectionId: "n1", createdAt: "2026-01-03T00:00:00Z" }),
    who({ id: "b", name: "B", connectionId: "n1", createdAt: "2026-01-01T00:00:00Z" }),
    who({ id: "c", name: "C", connectionId: "n1", createdAt: "2026-01-02T00:00:00Z" }),
  ]);
  assert.equal(out[0].answering.id, "b");
  assert.deepEqual(out[0].shadowed.map((r) => r.id), ["c", "a"]);
});

test("the sentence says which one wins and which are dead", () => {
  const out = conflicts([
    who({ id: "a", name: "artitech", connectionId: "n1", createdAt: "2026-06-02T00:00:00Z" }),
    who({ id: "b", name: "real estate", connectionId: "n1", createdAt: "2026-06-01T00:00:00Z" }),
  ]);
  const line = describeConflict(out[0], "+91 74477 39348");
  assert.match(line, /\+91 74477 39348/);
  assert.match(line, /real estate.*answers/);
  assert.match(line, /artitech.*never reached/);
});
