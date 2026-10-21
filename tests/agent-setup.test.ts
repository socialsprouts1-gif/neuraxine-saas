import test from "node:test";
import assert from "node:assert/strict";
import {
  LANGUAGES,
  STEPS,
  TONES,
  checkSummary,
  checklist,
  isLanguage,
  isTone,
  languageLabel,
  stepNumber,
  stepsNeedingWork,
  styleInstructions,
  type AgentForCheck,
} from "../src/lib/agent-setup.ts";

function agent(over: Partial<AgentForCheck> = {}): AgentForCheck {
  return {
    name: "Sales Sam",
    systemPrompt: "You are the sales assistant for a clothing shop in Pune. Answer sizing questions.",
    primaryLanguage: "en",
    handoffKeywords: ["human"],
    offHoursMessage: "We are closed, leave a message.",
    workingHoursEnabled: true,
    useKnowledgeBase: true,
    knowledgeCount: 3,
    hasKey: true,
    ...over,
  };
}

test("the five steps are numbered from one, in order", () => {
  assert.equal(STEPS.length, 5);
  assert.equal(stepNumber("persona"), 1);
  assert.equal(stepNumber("settings"), 5);
});

// --- language and tone -----------------------------------------------------

test("every language carries its own script as well as its English name", () => {
  // The person choosing Tamil for their customers reads Tamil; a list that
  // only says "Tamil" is a list written for somebody else.
  for (const language of LANGUAGES) {
    assert.ok(language.code && language.label && language.native, language.code);
  }
});

test("no language is listed twice", () => {
  const codes = LANGUAGES.map((language) => language.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("only the listed languages and tones are accepted", () => {
  assert.equal(isLanguage("hi"), true);
  assert.equal(isLanguage("klingon"), false);
  assert.equal(isTone("professional"), true);
  assert.equal(isTone("shouty"), false);
});

test("a language reads with both names, or just the one when they match", () => {
  assert.equal(languageLabel("en"), "English");
  assert.match(languageLabel("ta"), /Tamil \(தமிழ்\)/);
  // An unknown code falls back rather than rendering blank.
  assert.equal(languageLabel("nope"), "English");
});

test("the picker actually changes what the model is told", () => {
  // A language picker that only coloured a label would be the worst kind of
  // setting: visible, saved, and doing nothing.
  const hindi = styleInstructions({ language: "hi", multilingual: false, tone: "professional" });
  assert.match(hindi, /Reply in Hindi/);
  assert.match(hindi, /professional/i);
});

test("Hinglish is told not to answer in Devanagari", () => {
  // Otherwise a model told "Hindi" answers Latin-script messages in
  // Devanagari, which reads as a different person replying.
  const text = styleInstructions({ language: "hinglish", multilingual: false, tone: "friendly" });
  assert.match(text, /Latin characters/);
  assert.match(text, /Devanagari/);
});

test("multilingual adds the instruction to follow the customer instead", () => {
  const off = styleInstructions({ language: "en", multilingual: false, tone: "concise" });
  const on = styleInstructions({ language: "en", multilingual: true, tone: "concise" });
  assert.doesNotMatch(off, /language of their last message/);
  assert.match(on, /language of their last message/);
});

test("every tone produces a sentence", () => {
  for (const tone of TONES) {
    const text = styleInstructions({ language: "en", multilingual: false, tone: tone.key });
    assert.match(text, new RegExp(tone.label, "i"), tone.key);
  }
});

// --- the checklist ---------------------------------------------------------

test("a fully set-up agent passes every check", () => {
  const summary = checkSummary(checklist(agent()));
  assert.equal(summary.ready, true);
  assert.equal(summary.next, null);
});

test("no API key fails, because every customer would get an error", () => {
  const items = checklist(agent({ hasKey: false }));
  const key = items.find((item) => item.key === "key")!;
  assert.equal(key.done, false);
  assert.equal(key.step, "model");
});

test("a placeholder-length prompt counts as no prompt", () => {
  // Short enough to be something nobody replaced is the same as empty.
  assert.equal(checklist(agent({ systemPrompt: "be nice" }))[1].done, false);
  assert.equal(checklist(agent({ systemPrompt: "   " }))[1].done, false);
});

test("knowledge is only required when the agent is told to use it", () => {
  assert.equal(
    checklist(agent({ useKnowledgeBase: false, knowledgeCount: 0 })).find((i) => i.key === "knowledge")!.done,
    true
  );
  assert.equal(
    checklist(agent({ useKnowledgeBase: true, knowledgeCount: 0 })).find((i) => i.key === "knowledge")!.done,
    false
  );
});

test("an after-hours message is only required when there are working hours", () => {
  assert.equal(
    checklist(agent({ workingHoursEnabled: false, offHoursMessage: "" })).find((i) => i.key === "offhours")!.done,
    true
  );
  assert.equal(
    checklist(agent({ workingHoursEnabled: true, offHoursMessage: "" })).find((i) => i.key === "offhours")!.done,
    false
  );
});

test("the next thing to do is the first outstanding one", () => {
  const summary = checkSummary(checklist(agent({ handoffKeywords: [], hasKey: false })));
  assert.equal(summary.ready, false);
  assert.equal(summary.next?.key, "key");
});

test("every check names a step you can actually go to", () => {
  const keys = new Set(STEPS.map((step) => step.key));
  for (const item of checklist(agent())) {
    assert.ok(keys.has(item.step), `${item.key} points at ${item.step}`);
  }
});

test("the steps with something outstanding are the ones marked", () => {
  const marked = stepsNeedingWork(checklist(agent({ handoffKeywords: [], hasKey: false })));
  assert.deepEqual([...marked].sort(), ["model", "safety"]);
});

test("every check explains why it matters, not just what it is", () => {
  // A checklist padded with items nobody can see the point of teaches
  // people to skim, and then the one that matters is skimmed too.
  for (const item of checklist(agent())) {
    assert.ok(item.why.length > 20, item.key);
  }
});
