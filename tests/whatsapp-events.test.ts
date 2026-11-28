import test from "node:test";
import assert from "node:assert/strict";
import {
  EVENTS,
  carriesCode,
  readEvents,
  writeEvents,
  messageProblem,
  firstProblem,
  canSend,
  eventComponents,
  greetingName,
  eventSource,
  DEFAULT_EVENTS,
} from "../src/lib/whatsapp-events.ts";

const STORED = {
  org_id: "org-1",
  connection_id: "conn-1",
  messages: {
    otp: { enabled: false, template_name: "", language: "en", uses_name: false },
    signup: { enabled: true, template_name: "welcome_to_neurachat", language: "en", uses_name: true },
    trial_ended: { enabled: true, template_name: "trial_ended", language: "en", uses_name: false },
    payment_received: { enabled: false, template_name: "", language: "en", uses_name: false },
  },
};

test("stored settings come back whole", () => {
  const settings = readEvents(STORED);
  assert.equal(settings.orgId, "org-1");
  assert.equal(settings.messages.signup.templateName, "welcome_to_neurachat");
  assert.equal(settings.messages.trial_ended.enabled, true);
  assert.equal(settings.messages.payment_received.enabled, false);
});

test("nothing stored reads as every message off", () => {
  // A half-configured message that tries to send is one Meta error per
  // customer, and nobody would ever see them.
  for (const value of [null, undefined, {}, "nonsense", 42]) {
    const settings = readEvents(value);
    for (const event of EVENTS) {
      assert.equal(settings.messages[event.key].enabled, false, `${event.key} / ${String(value)}`);
    }
  }
  assert.deepEqual(readEvents(null), DEFAULT_EVENTS);
});

test("the old single-welcome shape is carried forward, not thrown away", () => {
  // The first version stored one flat message. Those rows still exist, and
  // silently switching somebody's welcome off on upgrade would be worse
  // than any migration.
  const settings = readEvents({
    org_id: "org-1",
    connection_id: "conn-1",
    enabled: true,
    template_name: "welcome_to_neurachat",
    language: "en_US",
    uses_name: true,
  });
  assert.equal(settings.messages.signup.enabled, true);
  assert.equal(settings.messages.signup.templateName, "welcome_to_neurachat");
  assert.equal(settings.messages.signup.language, "en_US");
  assert.equal(settings.orgId, "org-1");
  // The new events were never configured, so they stay off.
  assert.equal(settings.messages.trial_ended.enabled, false);
});

test("a new-shape row is not overwritten by the old-shape reading", () => {
  const settings = readEvents({ ...STORED, enabled: true, template_name: "stale_name" });
  assert.equal(settings.messages.signup.templateName, "welcome_to_neurachat");
});

test("enabled is only ever literally true", () => {
  const settings = readEvents({ messages: { signup: { enabled: "yes" } } });
  assert.equal(settings.messages.signup.enabled, false);
});

test("what is read can be written back unchanged", () => {
  assert.deepEqual(writeEvents(readEvents(STORED)), STORED);
});

test("a row saved before an event existed reads that event as off", () => {
  // Adding a fourth moment must not disturb the three somebody already
  // configured, and must not arrive switched on.
  const older = { ...STORED, messages: { ...STORED.messages, otp: undefined } };
  const settings = readEvents(older);
  assert.equal(settings.messages.otp.enabled, false);
  assert.equal(settings.messages.otp.templateName, "");
  assert.equal(settings.messages.signup.templateName, "welcome_to_neurachat");
});

// --- the code message is the odd one out -----------------------------------

test("the sign-up code event is marked as carrying a code", () => {
  assert.equal(carriesCode("otp"), true);
  assert.equal(carriesCode("signup"), false);
});

test("the code template is never sent somebody's name", () => {
  // Its one variable is the code, built by otpComponents in signup-otp.ts.
  // A name where Meta expects six digits is a message that reads as
  // nonsense to the customer and still counts against the number.
  const settings = readEvents({
    ...STORED,
    messages: {
      ...STORED.messages,
      otp: { enabled: true, template_name: "signup_code", language: "en", uses_name: true },
    },
  });
  assert.deepEqual(eventComponents(settings, "otp", "Vivek"), []);
});

// --- is it usable ----------------------------------------------------------

test("a configured message can send", () => {
  assert.equal(messageProblem(readEvents(STORED), "signup"), null);
  assert.equal(canSend(readEvents(STORED), "signup"), true);
});

test("a switched-off message is not a problem to report", () => {
  assert.equal(messageProblem(readEvents(STORED), "payment_received"), null);
  assert.equal(canSend(readEvents(STORED), "payment_received"), false);
});

test("each missing piece is named", () => {
  const noNumber = readEvents({ ...STORED, org_id: "" });
  assert.match(messageProblem(noNumber, "signup")!, /number/i);

  const noTemplate = readEvents({
    ...STORED,
    messages: { ...STORED.messages, signup: { ...STORED.messages.signup, template_name: "" } },
  });
  assert.match(messageProblem(noTemplate, "signup")!, /template/i);
});

test("a template name Meta would not accept is caught before sending", () => {
  const bad = readEvents({
    ...STORED,
    messages: { ...STORED.messages, signup: { ...STORED.messages.signup, template_name: "Welcome Message" } },
  });
  assert.match(messageProblem(bad, "signup")!, /lowercase/i);
});

test("a save refuses on the first broken message, and says which one", () => {
  const broken = readEvents({
    ...STORED,
    messages: { ...STORED.messages, trial_ended: { enabled: true, template_name: "" } },
  });
  const problem = firstProblem(broken);
  assert.match(problem!, /Free trial ended/);
});

test("nothing broken means nothing to refuse", () => {
  assert.equal(firstProblem(readEvents(STORED)), null);
});

// --- the parameters --------------------------------------------------------

test("a template with a name variable is sent exactly one parameter", () => {
  assert.deepEqual(eventComponents(readEvents(STORED), "signup", "Vivek"), [
    { type: "body", parameters: [{ type: "text", text: "Vivek" }] },
  ]);
});

test("a template with no variables is sent none", () => {
  // Meta counts them. One too many is refused exactly as hard as one too few.
  assert.deepEqual(eventComponents(readEvents(STORED), "trial_ended", "Vivek"), []);
});

test("a missing name never becomes an empty parameter", () => {
  const components = eventComponents(readEvents(STORED), "signup", "   ");
  assert.equal(components[0].parameters[0].text, "there");
});

test("the greeting uses a first name, not the whole one", () => {
  assert.equal(greetingName("Vivek Sharma"), "Vivek");
  assert.equal(greetingName(null), "");
});

test("every event has a label a person would recognise in their inbox", () => {
  assert.equal(eventSource("signup"), "New sign-up");
  assert.equal(eventSource("trial_ended"), "Free trial ended");
  assert.equal(eventSource("payment_received"), "Payment received");
});

test("every event in the list has somewhere to store its message", () => {
  // Adding a row to EVENTS and forgetting the settings shape would give a
  // control that saves into nothing.
  for (const event of EVENTS) {
    assert.ok(DEFAULT_EVENTS.messages[event.key], event.key);
  }
});
