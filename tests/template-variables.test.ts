import test from "node:test";
import assert from "node:assert/strict";
import {
  templateVariables,
  isNamedTemplate,
  variableCount,
  templateParameter,
  fillTemplateText,
} from "../src/lib/template-variables.ts";

// The failure these exist for: a template written in WhatsApp Manager as
// "Hi {{customer_name}}" was read as having no variables, because
// everything here counted digits. Meta refused all twenty recipients
// with 132000 — localizable_params (0) against an expected 1.

const REAL_BODY =
  "Hi {{customer_name}} \u{1F44B}\n\nTurn your WhatsApp into a powerful sales & support system with NeuraChat.";

test("the actual template that failed is read as having one variable", () => {
  assert.equal(variableCount(REAL_BODY), 1);
  assert.deepEqual(templateVariables(REAL_BODY), [{ token: "customer_name", named: true }]);
});

test("a named placeholder is not mistaken for no placeholder", () => {
  assert.equal(variableCount("Hi {{name}}"), 1);
  assert.equal(isNamedTemplate("Hi {{name}}"), true);
});

test("positional placeholders still work, and come back in numeric order", () => {
  assert.deepEqual(templateVariables("{{2}} then {{1}}"), [
    { token: "1", named: false },
    { token: "2", named: false },
  ]);
  assert.equal(isNamedTemplate("{{1}}"), false);
});

test("named placeholders keep the order they are written in", () => {
  // That is the order the form asks for them, so the two must agree.
  assert.deepEqual(
    templateVariables("{{last_name}}, {{first_name}}").map((v) => v.token),
    ["last_name", "first_name"]
  );
});

test("the same placeholder twice is one value, not two", () => {
  assert.equal(variableCount("Hi {{name}}, bye {{name}}"), 1);
  assert.equal(variableCount("{{1}} and {{1}}"), 1);
});

test("whitespace inside the braces is tolerated", () => {
  assert.deepEqual(templateVariables("Hi {{  customer_name  }}"), [
    { token: "customer_name", named: true },
  ]);
  assert.deepEqual(templateVariables("{{ 1 }}"), [{ token: "1", named: false }]);
});

test("a template with no placeholders needs no values", () => {
  assert.equal(variableCount("Just a plain sentence."), 0);
  assert.equal(isNamedTemplate("Just a plain sentence."), false);
  assert.deepEqual(templateVariables(""), []);
});

test("empty braces are not a variable", () => {
  assert.equal(variableCount("Hi {{}} there {{   }}"), 0);
});

test("named wins when both kinds appear, because Meta registered the named ones", () => {
  // Sending a parameter with no parameter_name into a NAMED template is
  // refused, so guessing positional here would fail every recipient.
  assert.deepEqual(templateVariables("{{1}} and {{name}}"), [{ token: "name", named: true }]);
});

// --- the parameter that goes to Meta --------------------------------------

test("a named variable carries parameter_name; a positional one must not", () => {
  assert.deepEqual(templateParameter({ token: "customer_name", named: true }, "Vivek"), {
    type: "text",
    parameter_name: "customer_name",
    text: "Vivek",
  });
  assert.deepEqual(templateParameter({ token: "1", named: false }, "Vivek"), {
    type: "text",
    text: "Vivek",
  });
});

test("an unfilled value becomes a space rather than an empty parameter", () => {
  // Meta refuses a blank one outright. Losing a word beats losing the
  // whole message.
  for (const value of [undefined, "", "   "]) {
    assert.equal(templateParameter({ token: "1", named: false }, value).text, " ");
  }
});

// --- the preview -----------------------------------------------------------

test("a named preview fills in, so what you see is what is sent", () => {
  assert.equal(fillTemplateText("Hi {{customer_name}}!", ["Vivek"]), "Hi Vivek!");
});

test("a positional preview fills in by index", () => {
  assert.equal(fillTemplateText("{{1}} owes {{2}}", ["Ann", "£5"]), "Ann owes £5");
});

test("an unfilled slot is left showing, not blanked out", () => {
  // Showing {{customer_name}} tells the author a value is still needed.
  assert.equal(fillTemplateText("Hi {{customer_name}}", []), "Hi {{customer_name}}");
  assert.equal(fillTemplateText("Hi {{customer_name}}", ["  "]), "Hi {{customer_name}}");
});

test("the same placeholder twice fills both times", () => {
  assert.equal(fillTemplateText("{{name}} — {{name}}", ["Ann"]), "Ann — Ann");
});
