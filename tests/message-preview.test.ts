import test from "node:test";
import assert from "node:assert/strict";
import {
  renderMessageBody,
  plainMessageText,
  renderButtons,
  templateMessageContent,
} from "../src/lib/message-preview.ts";

// The failure these exist for: a campaign sent a template to twenty people
// and the inbox showed nothing at all. Once it showed something, it showed
// "Template: neurachat__whatsapp_automation_for_modern_businesses" — the
// name of the file, not the sentence the customer received.

test("a template shows what was actually sent, not its filename", () => {
  const content = templateMessageContent({
    templateName: "neurachat__whatsapp_automation_for_modern_businesses",
    language: "en",
    body: "Hi Vivek 👋\n\nTurn your WhatsApp into a sales system.",
  });
  assert.match(renderMessageBody("template", content), /^Hi Vivek/);
});

test("a template with no recorded body falls back to its name", () => {
  // Rows written before the body was stored. Worse than the sentence,
  // better than a blank line in the inbox.
  assert.equal(
    renderMessageBody("template", { template_name: "order_update" }),
    "Template: order_update"
  );
});

test("a template with nothing at all still says what it is", () => {
  assert.equal(renderMessageBody("template", {}), "[template]");
});

test("the stored content keeps the template name and language beside the body", () => {
  // The name is what the Campaigns page matches on; the body is what a
  // person reads. Months later the template may have been edited or
  // deleted, so the sentence has to be kept, not re-derived.
  const content = templateMessageContent({
    templateName: "order_update",
    language: "en_US",
    body: "Your order has shipped.",
    source: "March promo",
  });
  assert.deepEqual(content, {
    template_name: "order_update",
    language: "en_US",
    body: "Your order has shipped.",
    source: "March promo",
  });
});

test("an empty body or source is left out rather than stored blank", () => {
  assert.deepEqual(templateMessageContent({ templateName: "t", language: "en", body: "   " }), {
    template_name: "t",
    language: "en",
  });
});

// --- the other kinds -------------------------------------------------------

test("plain text comes back as itself", () => {
  assert.equal(renderMessageBody("text", { body: "Hello there" }), "Hello there");
});

test("a tapped button reads as the customer's own words", () => {
  assert.equal(renderMessageBody("button", { button_reply: { title: "Book now" } }), "Book now");
  assert.equal(
    renderMessageBody("interactive", { list_reply: { title: "Tuesday 3pm" } }),
    "Tuesday 3pm"
  );
});

test("buttons we sent read as the question we asked", () => {
  assert.equal(
    renderMessageBody("interactive", { body: "Which day suits you?" }),
    "Which day suits you?"
  );
});

test("media says what it is, and carries its caption when there is one", () => {
  assert.equal(renderMessageBody("image", {}), "[image]");
  assert.equal(renderMessageBody("image", { caption: "Blue kurta" }), "[image] Blue kurta");
  assert.equal(renderMessageBody("document", { caption: "Invoice" }), "[document] Invoice");
});

test("a location names the place when Meta sent one", () => {
  assert.equal(renderMessageBody("location", { name: "Shop" }), "[location] Shop");
  assert.equal(renderMessageBody("location", {}), "[location]");
});

test("an unknown type names itself rather than rendering blank", () => {
  // A blank row in a conversation list reads as a bug in the product.
  assert.equal(renderMessageBody("sticker", {}), "[sticker]");
  assert.equal(renderMessageBody("", {}), "[message]");
});

test("the type is read whatever its case", () => {
  assert.equal(renderMessageBody("TEXT", { body: "Hi" }), "Hi");
  assert.equal(renderMessageBody("Template", { template_name: "t" }), "Template: t");
});

test("a non-string body does not become the word undefined", () => {
  assert.equal(renderMessageBody("text", { body: null }), "");
  assert.equal(renderMessageBody("text", {}), "");
});

// --- the copilot's version -------------------------------------------------

test("the copilot reads a placeholder as prose, not as a row", () => {
  assert.equal(plainMessageText("image", { caption: "Blue kurta" }), "(image) Blue kurta");
  assert.equal(plainMessageText("sticker", {}), "(sticker)");
});

test("the copilot reads real words unchanged", () => {
  assert.equal(plainMessageText("text", { body: "Hello there" }), "Hello there");
  assert.equal(plainMessageText("template", { body: "Hi Vivek" }), "Hi Vivek");
});

// --- buttons ---------------------------------------------------------------

test("quick replies come back as their titles", () => {
  assert.deepEqual(renderButtons({ buttons: [{ title: "Yes" }, { title: "No" }] }), ["Yes", "No"]);
});

test("a message with no buttons gives an empty list, not a crash", () => {
  for (const content of [{}, { buttons: null }, { buttons: "nope" }, { buttons: [{}] }]) {
    assert.deepEqual(renderButtons(content as Record<string, unknown>), []);
  }
});
