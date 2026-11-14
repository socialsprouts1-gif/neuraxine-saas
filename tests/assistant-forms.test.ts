import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { formInstructions, readFormOffer } from "../src/lib/assistant-forms.ts";

// Run with: npm test
//
// The marker is the whole contract between the model and the sender, so the
// cases that matter are the ones where a model is sloppy — different case,
// extra spaces, the marker mid-sentence, a name that does not exist — and
// the one where it is hostile, because the reply is text the customer can
// influence.

const ALLOWED = ["Book an appointment", "Customer feedback"];

describe("readFormOffer", () => {
  it("takes the marker out and names the form", () => {
    const offer = readFormOffer(
      "Of course, I can book you in.\n[[form: Book an appointment]]",
      ALLOWED
    );
    assert.equal(offer.text, "Of course, I can book you in.");
    assert.equal(offer.formName, "Book an appointment");
  });

  it("forgives capitalisation and stray spaces, and returns the business's own spelling", () => {
    const offer = readFormOffer("Sure.\n[[FORM:   book an APPOINTMENT   ]]", ALLOWED);
    assert.equal(offer.formName, "Book an appointment");
    assert.equal(offer.text, "Sure.");
  });

  it("still strips a marker naming a form that does not exist, and sends no form", () => {
    // The customer must never see the marker, even when the model made the
    // name up — a stray "[[form: ...]]" in a chat looks like a broken bot.
    const offer = readFormOffer("Here you go.\n[[form: Refund request]]", ALLOWED);
    assert.equal(offer.text, "Here you go.");
    assert.equal(offer.formName, null);
  });

  it("sends only the first valid form when a confused model asks for two", () => {
    const offer = readFormOffer(
      "Both then.\n[[form: Customer feedback]]\n[[form: Book an appointment]]",
      ALLOWED
    );
    assert.equal(offer.formName, "Customer feedback");
    assert.equal(offer.text, "Both then.");
  });

  it("handles a marker written mid-sentence without eating the words around it", () => {
    const offer = readFormOffer("Tap [[form: Customer feedback]] to tell us.", ALLOWED);
    assert.equal(offer.text, "Tap  to tell us.");
    assert.equal(offer.formName, "Customer feedback");
  });

  it("leaves an ordinary reply alone", () => {
    const reply = "We open at 10am and close at 8pm.";
    const offer = readFormOffer(reply, ALLOWED);
    assert.equal(offer.text, reply);
    assert.equal(offer.formName, null);
  });

  it("sends nothing when the assistant has no forms attached", () => {
    const offer = readFormOffer("Sure.\n[[form: Book an appointment]]", []);
    assert.equal(offer.formName, null);
    assert.equal(offer.text, "Sure.");
  });

  it("returns empty text when the model wrote only a marker", () => {
    // The caller decides what to do with this — there is nothing to send
    // before the form, which is a choice and not a failure.
    const offer = readFormOffer("[[form: Book an appointment]]", ALLOWED);
    assert.equal(offer.text, "");
    assert.equal(offer.formName, "Book an appointment");
  });

  it("is not fooled by a marker a customer typed into their own message", () => {
    // The reply is the model's, but a model can be talked into echoing.
    // Echoing is harmless as long as the name still has to be on the list.
    const offer = readFormOffer("You asked for [[form: Admin panel]].", ALLOWED);
    assert.equal(offer.formName, null);
    assert.equal(offer.text, "You asked for .");
  });

  it("collapses the blank space a stripped marker leaves behind", () => {
    const offer = readFormOffer("First line.\n\n[[form: Customer feedback]]\n\nLast line.", ALLOWED);
    assert.equal(offer.text, "First line.\n\nLast line.");
  });
});

describe("formInstructions", () => {
  it("says nothing at all when no forms are attached", () => {
    // An assistant told about a capability it does not have will promise it.
    assert.equal(formInstructions([]), "");
  });

  it("lists each form by its exact name", () => {
    const text = formInstructions([
      { name: "Book an appointment", description: "Pick a date and time" },
      { name: "Customer feedback", description: null },
    ]);
    assert.ok(text.includes('"Book an appointment" — Pick a date and time'));
    assert.ok(text.includes('"Customer feedback"'));
    assert.ok(text.includes("[[form:"));
    assert.ok(text.includes("Never invent one."));
  });
});
