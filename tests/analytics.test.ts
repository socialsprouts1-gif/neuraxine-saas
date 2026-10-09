import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  daily,
  foldLedger,
  funnel,
  percent,
  rank,
  referrerHost,
  sourceOf,
  totals,
  type SiteEvent,
} from "../src/lib/analytics.ts";

function ev(partial: Partial<SiteEvent>): SiteEvent {
  return {
    visitor_id: "v1",
    session_id: "s1",
    event: "view",
    path: "/",
    label: null,
    referrer_host: null,
    source: null,
    medium: null,
    campaign: null,
    device: "desktop",
    created_at: new Date().toISOString(),
    ...partial,
  };
}

test("totals count people, visits and pages separately", () => {
  const out = totals([
    ev({ visitor_id: "a", session_id: "s1" }),
    ev({ visitor_id: "a", session_id: "s1", path: "/pricing" }),
    ev({ visitor_id: "a", session_id: "s2" }),
    ev({ visitor_id: "b", session_id: "s3" }),
  ]);
  assert.equal(out.visitors, 2);
  assert.equal(out.sessions, 3);
  assert.equal(out.views, 4);
  // s2 and s3 saw one page each; s1 saw two.
  assert.equal(out.bounced, 2);
});

test("a click is not a page view", () => {
  const out = totals([ev({}), ev({ event: "click", label: "nav:trial" })]);
  assert.equal(out.views, 1);
  assert.equal(out.sessions, 1);
});

test("the funnel counts people, so a reload cannot widen a step", () => {
  const events = [
    ev({ visitor_id: "a" }),
    ev({ visitor_id: "a", event: "signup_open" }),
    ev({ visitor_id: "a", event: "signup_open" }),
    ev({ visitor_id: "a", event: "signup_open" }),
    ev({ visitor_id: "b" }),
  ];
  const steps = funnel(events);
  assert.equal(steps[0].count, 2);
  assert.equal(steps[1].count, 1);
  assert.equal(steps[1].ofPrevious, 0.5);
});

test("the funnel never widens, even for somebody who skipped a step", () => {
  // Arrived straight on /auth/register from an email: no site visit event
  // for the first step. Counting naively puts step two above step one.
  const events = [
    ev({ visitor_id: "a", event: "signup_submit", path: "/auth/register" }),
    ev({ visitor_id: "b" }),
  ];
  const steps = funnel(events);
  for (let i = 1; i < steps.length; i += 1) {
    assert.ok(steps[i].count <= steps[i - 1].count, `step ${i} is wider than ${i - 1}`);
  }
});

test("the database wins on accounts created, because an event can be lost", () => {
  const steps = funnel([ev({ visitor_id: "a" })], 5);
  assert.equal(steps[3].count, 5);
});

test("ground truth from the database cannot make the funnel widen", () => {
  // Nine real accounts, but tracking only caught one visitor and no
  // submissions at all — a blocker, or the script never ran. Rendered
  // naively this reads "Created an account: 9 — 900% of the step above".
  const steps = funnel([ev({ visitor_id: "a" })], 9);
  for (let i = 1; i < steps.length; i += 1) {
    assert.ok(steps[i].count <= steps[i - 1].count, `step ${i} is wider than ${i - 1}`);
    assert.ok((steps[i].ofPrevious ?? 0) <= 1, `step ${i} is over 100% of the one above`);
  }
  assert.equal(steps[0].count, 9);
  assert.equal(steps[3].count, 9);
});

test("an empty window divides by nothing rather than by zero", () => {
  const steps = funnel([]);
  assert.equal(steps[0].count, 0);
  assert.equal(steps[1].ofPrevious, null);
  assert.equal(percent(steps[1].ofStart), "—");
});

test("ranking counts people, not refreshes", () => {
  const events = [
    ...Array.from({ length: 20 }, () => ev({ visitor_id: "a", path: "/pricing" })),
    ev({ visitor_id: "b", path: "/" }),
    ev({ visitor_id: "c", path: "/" }),
  ];
  const top = rank(events, (row) => row.path);
  assert.equal(top[0].label, "/");
  assert.equal(top[0].count, 2);
  assert.equal(top[1].count, 1);
  assert.equal(top[0].share, 1);
});

test("ranking can be narrowed to one kind of event", () => {
  const events = [
    ev({ visitor_id: "a", event: "click", label: "nav:trial" }),
    ev({ visitor_id: "b", event: "click", label: "nav:trial" }),
    ev({ visitor_id: "c", event: "view", label: "nav:trial" }),
  ];
  assert.equal(rank(events, (row) => row.label, { only: "click" })[0].count, 2);
});

test("ranking ignores blanks rather than inventing an empty row", () => {
  const top = rank([ev({ path: null }), ev({ path: "   " }), ev({ path: "/" })], (r) => r.path);
  assert.equal(top.length, 1);
  assert.equal(top[0].label, "/");
});

test("quiet days still appear, so the chart cannot draw through them", () => {
  const now = new Date("2026-10-09T12:00:00");
  const days = daily([ev({ created_at: "2026-10-09T09:00:00" })], 7, now);
  assert.equal(days.length, 7);
  assert.equal(days[6].views, 1);
  assert.equal(days[6].visitors, 1);
  assert.equal(days[0].views, 0);
});

test("days are bucketed locally, so an evening visit is not tomorrow", () => {
  const now = new Date("2026-10-09T12:00:00");
  // 23:30 local on the 8th. Bucketed by UTC in a +05:30 zone this lands
  // on the 8th as well, but in a -05:00 zone it would jump to the 9th.
  const days = daily([ev({ created_at: "2026-10-08T23:30:00" })], 3, now);
  assert.equal(days[1].day.getDate(), 8);
  assert.equal(days[1].views, 1);
  assert.equal(days[2].views, 0);
});

test("an event from outside the window is dropped, not clamped into it", () => {
  const now = new Date("2026-10-09T12:00:00");
  const days = daily([ev({ created_at: "2026-01-01T09:00:00" })], 7, now);
  assert.equal(days.reduce((sum, day) => sum + day.views, 0), 0);
});

test("a referrer keeps its host and nothing else", () => {
  assert.equal(referrerHost("https://www.google.com/search?q=secret", "neurachat.in"), "google.com");
  assert.equal(referrerHost("https://neurachat.in/pricing", "neurachat.in"), null);
  assert.equal(referrerHost("https://www.neurachat.in/", "neurachat.in"), null);
  assert.equal(referrerHost("", "neurachat.in"), null);
  assert.equal(referrerHost("not a url", "neurachat.in"), null);
});

test("a tagged campaign beats the referrer, and direct is the fallback", () => {
  assert.equal(sourceOf({ source: "instagram", referrer_host: "t.co" }), "instagram");
  assert.equal(sourceOf({ source: null, referrer_host: "t.co" }), "t.co");
  assert.equal(sourceOf({ source: "  ", referrer_host: null }), "Direct");
});


test("the ledger's direction is in kind, never in the sign", () => {
  // Every amount_micros is positive; `kind` says which way it moves. The
  // first version of this read the sign, which made spend zero on every
  // workspace and folded every debit into "topped up" — three numbers
  // that were all wrong and all looked plausible.
  const out = foldLedger([
    { org_id: "a", kind: "topup", amount_micros: 5_000_000 },
    { org_id: "a", kind: "debit", amount_micros: 115_000 },
    { org_id: "a", kind: "debit", amount_micros: 863_100 },
    { org_id: "b", kind: "debit", amount_micros: 115_000 },
    { org_id: "b", kind: "refund", amount_micros: 115_000 },
  ]);

  assert.equal(out.toppedUp, 5_115_000);
  assert.equal(out.spent, 1_093_100);
  assert.equal(out.spentBy.get("a"), 978_100);
  assert.equal(out.spentBy.get("b"), 115_000);
  // One debit is one message that went out.
  assert.equal(out.debits, 3);
});

test("a ledger of nothing but top-ups has spent nothing", () => {
  const out = foldLedger([{ org_id: "a", kind: "topup", amount_micros: 1_000_000 }]);
  assert.equal(out.spent, 0);
  assert.equal(out.debits, 0);
  assert.equal(out.spentBy.size, 0);
});

test("a null amount is zero rather than NaN spreading through the totals", () => {
  const out = foldLedger([{ org_id: "a", kind: "debit", amount_micros: null }]);
  assert.equal(out.spent, 0);
  assert.equal(out.debits, 1);
});
