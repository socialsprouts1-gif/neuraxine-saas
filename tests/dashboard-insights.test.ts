import test from "node:test";
import assert from "node:assert/strict";
import {
  upcoming,
  whenDue,
  answerRate,
  topAnswers,
  type UpcomingItem,
  type BotRunLike,
} from "../src/lib/dashboard-insights.ts";

const NOW = Date.parse("2026-09-29T12:00:00Z");
const inHours = (n: number) => new Date(NOW + n * 3_600_000).toISOString();

const item = (id: string, kind: UpcomingItem["kind"], hours: number): UpcomingItem => ({
  id,
  kind,
  title: id,
  at: inHours(hours),
});

// --- what is coming --------------------------------------------------------

test("the three kinds come back as one list, soonest first", () => {
  const list = upcoming(
    [item("c", "appointment", 5), item("a", "reminder", 1), item("b", "scheduled", 3)],
    NOW
  );
  assert.deepEqual(list.map((entry) => entry.id), ["a", "b", "c"]);
});

test("anything already past is dropped, not shown as upcoming", () => {
  // A dashboard still showing yesterday's reminder as coming up teaches
  // you to stop reading it.
  const list = upcoming([item("old", "reminder", -2), item("soon", "reminder", 2)], NOW);
  assert.deepEqual(list.map((entry) => entry.id), ["soon"]);
});

test("something due this second still counts as upcoming", () => {
  assert.equal(upcoming([item("now", "reminder", 0)], NOW).length, 1);
});

test("the list is capped, so one busy day cannot fill the screen", () => {
  const many = Array.from({ length: 20 }, (_, i) => item(`r${i}`, "reminder", i + 1));
  assert.equal(upcoming(many, NOW).length, 6);
  assert.equal(upcoming(many, NOW, 3).length, 3);
});

test("an unparseable time is dropped rather than sorted to the front", () => {
  const broken: UpcomingItem = { id: "bad", kind: "reminder", title: "bad", at: "soon-ish" };
  assert.deepEqual(upcoming([broken, item("ok", "reminder", 1)], NOW).map((e) => e.id), ["ok"]);
});

// --- how it reads ----------------------------------------------------------

test("how far away it is, in the words a person would use", () => {
  assert.equal(whenDue(inHours(0.5), NOW), "in 30 min");
  assert.equal(whenDue(inHours(5), NOW), "in 5h");
  assert.equal(whenDue(inHours(25), NOW), "tomorrow");
  assert.equal(whenDue(inHours(24 * 3), NOW), "in 3 days");
  assert.equal(whenDue(inHours(24 * 8), NOW), "in a week");
});

test("something due now says now, not a negative number of minutes", () => {
  assert.equal(whenDue(inHours(0), NOW), "now");
  assert.equal(whenDue(inHours(-3), NOW), "now");
});

// --- is the automation working --------------------------------------------

const run = (outcome: string, label?: string, kind = "chatbot"): BotRunLike => ({
  outcome,
  matched_label: label ?? null,
  matched_kind: kind,
});

test("a handoff counts as answered — somebody was helped", () => {
  const rate = answerRate([run("replied"), run("handoff")]);
  assert.equal(rate.answered, 2);
  assert.equal(rate.rate, 1);
});

test("a failure is counted apart from a miss, because the fix differs", () => {
  // A miss means write another answer. A failure means something is
  // broken. Folding them together hides which.
  const rate = answerRate([run("replied"), run("skipped"), run("failed")]);
  assert.deepEqual(
    { answered: rate.answered, unanswered: rate.unanswered, failed: rate.failed },
    { answered: 1, unanswered: 1, failed: 1 }
  );
});

test("no runs gives no rate rather than a confident zero", () => {
  const rate = answerRate([]);
  assert.equal(rate.rate, null);
  assert.equal(rate.total, 0);
});

test("the rate is a share of everything the automation looked at", () => {
  const rate = answerRate([run("replied"), run("replied"), run("skipped"), run("skipped")]);
  assert.equal(rate.rate, 0.5);
});

test("the answers doing the work come back most-used first", () => {
  const top = topAnswers([
    run("replied", "Delivery time", "faq"),
    run("replied", "Delivery time", "faq"),
    run("replied", "Opening hours", "faq"),
  ]);
  assert.deepEqual(top.map((entry) => [entry.label, entry.count]), [
    ["Delivery time", 2],
    ["Opening hours", 1],
  ]);
});

test("a run that answered nothing is not an answer", () => {
  assert.deepEqual(topAnswers([run("skipped", "Nothing matched"), run("failed", "Boom")]), []);
});

test("an answer with no label is skipped rather than shown blank", () => {
  assert.deepEqual(topAnswers([run("replied"), run("replied", "  ")]), []);
});

test("two answers on the same count sort by name, so the list never jitters", () => {
  const top = topAnswers([run("replied", "Zebra"), run("replied", "Apple")]);
  assert.deepEqual(top.map((entry) => entry.label), ["Apple", "Zebra"]);
});

test("the same label from different features stays two rows", () => {
  // An FAQ called "Delivery" and a bot called "Delivery" are different
  // things to go and edit.
  const top = topAnswers([run("replied", "Delivery", "faq"), run("replied", "Delivery", "chatbot")]);
  assert.equal(top.length, 2);
});
