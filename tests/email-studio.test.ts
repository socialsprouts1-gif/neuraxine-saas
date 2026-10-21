import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  AUTOMATIC_KINDS,
  isOn,
  offSummary,
  readSwitches,
  switchesFromTicked,
} from "../src/lib/email-automation.ts";
import {
  fillIn,
  paragraphs,
  preheaderFrom,
  slugify,
  templateProblem,
  unknownVariables,
} from "../src/lib/email-compose.ts";

test("a deployment that has never opened the screen still sends everything", () => {
  const switches = readSwitches(null);
  for (const row of AUTOMATIC_KINDS) assert.equal(switches[row.kind], true);
});

test("switching off a kind stops it, and leaves the others alone", () => {
  const switches = readSwitches({ trial_followup: false });
  assert.equal(isOn(switches, "trial_followup"), false);
  assert.equal(isOn(switches, "trial_ending"), true);
});

test("a receipt cannot be switched off, however the row is edited", () => {
  const switches = readSwitches({ payment_received: false });
  assert.equal(isOn(switches, "payment_received"), true);
  assert.equal(switchesFromTicked([]).payment_received, true);
});

test("a kind nobody has heard of is not blocked by the switches", () => {
  // Campaign sends and sign-up codes do not appear on the list, and a
  // list that silently vetoes anything missing from it would swallow them.
  assert.equal(isOn(readSwitches({}), "campaign"), true);
  assert.equal(isOn(readSwitches({}), "signup_code"), true);
});

test("unticked boxes mean off, which is the whole point of the form", () => {
  const switches = switchesFromTicked(["welcome", "trial_ending"]);
  assert.equal(switches.welcome, true);
  assert.equal(switches.trial_ending, true);
  assert.equal(switches.trial_followup, false);
});

test("the summary names what is off, and says nothing when nothing is", () => {
  assert.equal(offSummary(readSwitches({})), null);
  assert.equal(offSummary(readSwitches({ trial_followup: false })), "Trial follow-up");
});

test("placeholders are filled in, and an unknown one leaves a gap not a tag", () => {
  assert.equal(fillIn("Hi {{workspace}}", { workspace: "umm clothing" }), "Hi umm clothing");
  assert.equal(fillIn("Hi {{frist_name}}", {}), "Hi ");
  assert.equal(fillIn("Hi {{ workspace }}", { workspace: "a" }), "Hi a");
});

test("a value missing for this recipient leaves a gap too", () => {
  // A workspace that never had a plan has no plan name, and "Your  plan"
  // is a slightly terse sentence where "Your {{plan}} plan" is a bug
  // report.
  assert.equal(fillIn("Your {{plan}} plan", { plan: null }), "Your  plan");
  assert.equal(fillIn("Your {{plan}} plan", { plan: "   " }), "Your  plan");
});

test("a typo in a placeholder is caught before it is sent", () => {
  assert.deepEqual(unknownVariables("{{workspace}} and {{frist_name}}"), ["frist_name"]);
  const problem = templateProblem({
    name: "Offer",
    subject: "Hi {{frist_name}}",
    body: "Something",
  });
  assert.match(problem ?? "", /frist_name/);
});

test("half a button is refused, because it is the failure that looks fine", () => {
  const base = { name: "Offer", subject: "Hi", body: "Something" };
  assert.match(templateProblem({ ...base, actionLabel: "See plans" }) ?? "", /nowhere to go/);
  assert.match(templateProblem({ ...base, actionPath: "/billing" }) ?? "", /no label/);
  assert.equal(templateProblem({ ...base, actionLabel: "See plans", actionPath: "/billing" }), null);
});

test("an absolute button link is refused, so a domain move does not break it", () => {
  const problem = templateProblem({
    name: "Offer",
    subject: "Hi",
    body: "Something",
    actionLabel: "See plans",
    actionPath: "https://neurachat.in/billing",
  });
  assert.match(problem ?? "", /start with \//);
});

test("an empty template says which part is missing", () => {
  assert.match(templateProblem({ name: "", subject: "a", body: "b" }) ?? "", /name/);
  assert.match(templateProblem({ name: "a", subject: "", body: "b" }) ?? "", /subject/);
  assert.match(templateProblem({ name: "a", subject: "b", body: "  " }) ?? "", /no body/);
});

test("paragraphs split on blank lines and keep single breaks", () => {
  assert.deepEqual(paragraphs("one\n\ntwo"), ["one", "two"]);
  assert.deepEqual(paragraphs("one\ntwo"), ["one\ntwo"]);
  assert.deepEqual(paragraphs("a\r\n\r\nb"), ["a", "b"]);
  assert.deepEqual(paragraphs("\n\n  \n\n"), []);
});

test("the preheader is the opening line, trimmed to fit", () => {
  assert.equal(preheaderFrom("First line.\n\nSecond."), "First line.");
  assert.equal(preheaderFrom("x".repeat(300)).length, 140);
  assert.equal(preheaderFrom(""), "");
});

test("a slug survives a name made entirely of punctuation", () => {
  assert.equal(slugify("October Offer!"), "october-offer");
  assert.equal(slugify("!!!"), "template");
  assert.equal(slugify("  spaced  out  "), "spaced-out");
});
