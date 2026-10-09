import { test } from "node:test";
import assert from "node:assert/strict";
import { normalise, parseObject } from "../src/lib/conversation-analysis.ts";

test("parseObject reads a bare object, a fence, or a preamble", () => {
  assert.deepEqual(parseObject('{"score":80}'), { score: 80 });
  assert.deepEqual(parseObject('```json\n{"score":80}\n```'), { score: 80 });
  assert.deepEqual(parseObject('Here you go:\n{"score":80}\nHope that helps'), { score: 80 });
});

test("parseObject refuses anything that is not an object", () => {
  assert.equal(parseObject("[1,2]"), null);
  assert.equal(parseObject("not json"), null);
  assert.equal(parseObject(""), null);
});

test("a well-formed analysis survives intact", () => {
  const result = normalise({
    score: 87,
    reasons: ["asked pricing", "requested demo"],
    intent: "Demo Request",
    sentiment: "positive",
    summary: "Runs a real estate firm.",
    nextAction: "Book a demo",
    needsHuman: false,
    needsHumanReason: null,
  });

  assert.equal(result.score, 87);
  assert.deepEqual(result.reasons, ["asked pricing", "requested demo"]);
  assert.equal(result.intent, "Demo Request");
  assert.equal(result.sentiment, "positive");
  assert.equal(result.needsHuman, false);
  assert.equal(result.needsHumanReason, null);
});

test("the score is clamped to 0-100 and rounded", () => {
  // A score outside the range would fail the database check constraint and
  // take the whole analysis down with it.
  assert.equal(normalise({ score: 140 }).score, 100);
  assert.equal(normalise({ score: -20 }).score, 0);
  assert.equal(normalise({ score: 72.6 }).score, 73);
  assert.equal(normalise({ score: "not a number" }).score, 0);
  assert.equal(normalise({}).score, 0);
});

test("an intent outside the list falls back to Other", () => {
  // Anything else would render as a label no filter can match.
  assert.equal(normalise({ intent: "Buying Intent" }).intent, "Other");
  assert.equal(normalise({ intent: "Refund" }).intent, "Refund");
  assert.equal(normalise({}).intent, "Other");
});

test("sentiment is one of three values, whatever the model wrote", () => {
  assert.equal(normalise({ sentiment: "POSITIVE" }).sentiment, "positive");
  assert.equal(normalise({ sentiment: "negative" }).sentiment, "negative");
  assert.equal(normalise({ sentiment: "furious" }).sentiment, "neutral");
  assert.equal(normalise({}).sentiment, "neutral");
});

test("reasons are trimmed, emptied and capped", () => {
  const result = normalise({
    reasons: ["  asked pricing  ", "", "   ", "shared team size", "a", "b", "c", "d", "e"],
  });
  assert.equal(result.reasons[0], "asked pricing");
  assert.ok(!result.reasons.includes(""));
  assert.ok(result.reasons.length <= 6);
});

test("reasons that are not a list do not crash the analysis", () => {
  assert.deepEqual(normalise({ reasons: "asked pricing" }).reasons, []);
  assert.deepEqual(normalise({}).reasons, []);
});

test("needsHuman is only true when the model said exactly true", () => {
  // Escalating on a truthy string would send every conversation to a person.
  assert.equal(normalise({ needsHuman: true }).needsHuman, true);
  assert.equal(normalise({ needsHuman: "true" }).needsHuman, false);
  assert.equal(normalise({ needsHuman: 1 }).needsHuman, false);
  assert.equal(normalise({}).needsHuman, false);
});

test("a blank escalation reason becomes null, not an empty string", () => {
  assert.equal(normalise({ needsHuman: true, needsHumanReason: "   " }).needsHumanReason, null);
  assert.equal(
    normalise({ needsHuman: true, needsHumanReason: "asked for a manager" }).needsHumanReason,
    "asked for a manager"
  );
});

test("a partial answer still renders rather than throwing", () => {
  const result = normalise({ summary: "Wants pricing." });
  assert.equal(result.summary, "Wants pricing.");
  assert.equal(result.nextAction, "");
  assert.equal(result.score, 0);
});
