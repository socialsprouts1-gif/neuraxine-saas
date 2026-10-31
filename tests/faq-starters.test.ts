import test from "node:test";
import assert from "node:assert/strict";
import { FAQ_STARTERS, availableStarters } from "../src/lib/faq-starters.ts";

test("every starter carries the keywords that make it fire", () => {
  // Keywords are the whole mechanism — a starter without them would be a
  // worked example of the mistake it exists to prevent.
  for (const starter of FAQ_STARTERS) {
    assert.ok(starter.keywords.length >= 3, starter.question);
    assert.ok(starter.question.trim().length > 0);
    assert.ok(starter.answer.trim().length > 0);
    assert.ok(starter.category.trim().length > 0);
  }
});

test("keywords are lowercase, so they match the normaliser", () => {
  for (const starter of FAQ_STARTERS) {
    for (const keyword of starter.keywords) {
      assert.equal(keyword, keyword.toLowerCase(), `${starter.question}: ${keyword}`);
    }
  }
});

test("no two starters ask the same question", () => {
  const seen = new Set(FAQ_STARTERS.map((s) => s.question.toLowerCase()));
  assert.equal(seen.size, FAQ_STARTERS.length);
});

test("an empty workspace is offered all of them", () => {
  assert.equal(availableStarters([]).length, FAQ_STARTERS.length);
});

test("a question already added is not offered again", () => {
  const left = availableStarters(["What are your opening hours?"]);
  assert.equal(left.length, FAQ_STARTERS.length - 1);
  assert.ok(!left.some((s) => s.question === "What are your opening hours?"));
});

test("matching ignores case and surrounding space", () => {
  const left = availableStarters(["  what are YOUR opening hours?  "]);
  assert.equal(left.length, FAQ_STARTERS.length - 1);
});

test("an unrelated question takes nothing away", () => {
  assert.equal(availableStarters(["Do you gift wrap?"]).length, FAQ_STARTERS.length);
});
