import test from "node:test";
import assert from "node:assert/strict";
import {
  templateFieldsFromComponents,
  needsUnpacking,
  storableHeaderFormat,
  resolveTemplateShape,
} from "../src/lib/template-unpack.ts";
import { variablesIn } from "../src/lib/template-spec.ts";

// The bug these exist for, in one line: a template created in WhatsApp
// Manager synced with components_json full and body_text empty, so the
// sender counted zero variables and Meta refused every recipient with
// 132000.

test("the body comes back with its variables intact", () => {
  const fields = templateFieldsFromComponents([
    { type: "BODY", text: "Hi {{1}}, your order is on its way." },
  ]);
  assert.equal(fields.bodyText, "Hi {{1}}, your order is on its way.");
  assert.equal(variablesIn(fields.bodyText).length, 1);
});

test("this is the exact failure — one body variable, counted", () => {
  // Meta said: number of localizable_params (0) does not match the
  // expected number of params (1).
  const components = [{ type: "BODY", text: "WhatsApp automation for {{1}}" }];
  const before = variablesIn("");
  const after = variablesIn(templateFieldsFromComponents(components).bodyText);
  assert.equal(before.length, 0);
  assert.equal(after.length, 1);
});

test("a text header is recognised and kept separately from the body", () => {
  const fields = templateFieldsFromComponents([
    { type: "HEADER", format: "TEXT", text: "Order {{1}}" },
    { type: "BODY", text: "Thanks {{1}}." },
  ]);
  assert.equal(fields.headerFormat, "TEXT");
  assert.equal(fields.headerText, "Order {{1}}");
  assert.equal(fields.bodyText, "Thanks {{1}}.");
});

test("a media header is recognised, so the send builds a header component", () => {
  // Without this the media-header fix stays disarmed on synced templates.
  for (const format of ["IMAGE", "VIDEO", "DOCUMENT"]) {
    const fields = templateFieldsFromComponents([
      { type: "HEADER", format },
      { type: "BODY", text: "Hello" },
    ]);
    assert.equal(fields.headerFormat, format);
    assert.equal(fields.headerText, null, `${format} should carry no header text`);
  }
});

test("a header with text but no format is treated as a text header", () => {
  const fields = templateFieldsFromComponents([{ type: "HEADER", text: "Hello" }]);
  assert.equal(fields.headerFormat, "TEXT");
  assert.equal(fields.headerText, "Hello");
});

test("no header means NONE, not an empty string nobody checks for", () => {
  const fields = templateFieldsFromComponents([{ type: "BODY", text: "Hello" }]);
  assert.equal(fields.headerFormat, "NONE");
  assert.equal(fields.headerText, null);
});

test("a footer is kept, and an empty one is null rather than blank", () => {
  assert.equal(
    templateFieldsFromComponents([{ type: "FOOTER", text: "Reply STOP to opt out" }]).footerText,
    "Reply STOP to opt out"
  );
  assert.equal(templateFieldsFromComponents([{ type: "FOOTER", text: "" }]).footerText, null);
});

test("lowercase component types are read too", () => {
  const fields = templateFieldsFromComponents([
    { type: "header", format: "image" },
    { type: "body", text: "Hi {{1}}" },
  ]);
  assert.equal(fields.headerFormat, "IMAGE");
  assert.equal(fields.bodyText, "Hi {{1}}");
});

test("buttons and anything unknown are ignored without breaking the rest", () => {
  const fields = templateFieldsFromComponents([
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Shop" }] },
    { type: "BODY", text: "Hello" },
    { type: "CAROUSEL" },
  ]);
  assert.equal(fields.bodyText, "Hello");
});

test("rubbish in gives empty defaults, not a crash", () => {
  // This runs over every template on every account. One odd shape must
  // not stop the rest syncing.
  for (const input of [null, undefined, "nope", 42, {}, [null], [{}], [[]]]) {
    const fields = templateFieldsFromComponents(input);
    assert.equal(fields.bodyText, "");
    assert.equal(fields.headerFormat, "NONE");
  }
});

// --- when to write it back -------------------------------------------------

test("an empty body is filled in from Meta", () => {
  assert.equal(
    needsUnpacking({ body_text: null }, templateFieldsFromComponents([{ type: "BODY", text: "Hi" }])),
    true
  );
});

test("a body already stored here is left alone", () => {
  // Otherwise every sync overwrites what somebody edited in this app with
  // Meta's copy.
  assert.equal(
    needsUnpacking(
      { body_text: "My own wording" },
      templateFieldsFromComponents([{ type: "BODY", text: "Meta's wording" }])
    ),
    false
  );
});

test("a missing header format is filled in even when the body is already there", () => {
  assert.equal(
    needsUnpacking(
      { body_text: "Hello", header_format: null },
      templateFieldsFromComponents([
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Hello" },
      ])
    ),
    true
  );
});

test("a template with nothing to add is not rewritten", () => {
  assert.equal(
    needsUnpacking(
      { body_text: "Hello", header_format: "NONE" },
      templateFieldsFromComponents([{ type: "BODY", text: "Hello" }])
    ),
    false
  );
});

test("a location header is flattened for storage, not written and rejected", () => {
  // There is a check constraint on the column. Writing LOCATION fails the
  // whole upsert, and sync upserts in a loop — so one template with a
  // location header would stop every other template on the account from
  // syncing at all.
  assert.equal(storableHeaderFormat("LOCATION"), "NONE");
  for (const format of ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"] as const) {
    assert.equal(storableHeaderFormat(format), format);
  }
});

test("the unpacker still reports LOCATION honestly", () => {
  // Flattening happens at the storage boundary, not in the reading.
  assert.equal(
    templateFieldsFromComponents([{ type: "HEADER", format: "LOCATION" }]).headerFormat,
    "LOCATION"
  );
});

// --- what actually gets sent -----------------------------------------------

test("Meta's body wins over an empty column — the whole bug, in one case", () => {
  // The row a WhatsApp Manager template synced into: components full,
  // body_text never written. Reading the column gave zero variables, so
  // zero parameters went out and Meta refused all twenty recipients.
  const shape = resolveTemplateShape({
    body_text: null,
    header_format: null,
    components_json: [{ type: "BODY", text: "WhatsApp automation for {{1}}" }],
  });
  assert.equal(shape.bodyText, "WhatsApp automation for {{1}}");
  assert.equal(variablesIn(shape.bodyText).length, 1);
});

test("this works without anybody pressing Sync first", () => {
  // The point of resolving rather than repairing: a row that has never
  // been re-synced still sends correctly.
  const unrepaired = { body_text: "", header_format: "NONE" as const };
  const shape = resolveTemplateShape({
    ...unrepaired,
    components_json: [{ type: "BODY", text: "Hi {{1}}" }],
  });
  assert.equal(variablesIn(shape.bodyText).length, 1);
});

test("Meta's copy wins even when ours says something different", () => {
  // Ours is a convenience; the send has to match what Meta declared or
  // the whole message is refused.
  const shape = resolveTemplateShape({
    body_text: "Hello",
    components_json: [{ type: "BODY", text: "Hello {{1}}" }],
  });
  assert.equal(shape.bodyText, "Hello {{1}}");
});

test("a media header is picked up from Meta too", () => {
  const shape = resolveTemplateShape({
    body_text: "Hi",
    header_format: null,
    header_media_url: "https://cdn.example.com/a.jpg",
    components_json: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Hi" },
    ],
  });
  assert.equal(shape.headerFormat, "IMAGE");
  // The URL is ours — Meta only says a header exists, not what to put in it.
  assert.equal(shape.headerMediaUrl, "https://cdn.example.com/a.jpg");
});

test("a template made in this app keeps its own fields", () => {
  // Nothing from Meta to prefer, so ours is all there is.
  const shape = resolveTemplateShape({
    body_text: "Our own copy {{1}}",
    header_format: "TEXT",
    header_text: "Header",
    components_json: [],
  });
  assert.equal(shape.bodyText, "Our own copy {{1}}");
  assert.equal(shape.headerFormat, "TEXT");
  assert.equal(shape.headerText, "Header");
});

test("rubbish in components_json falls back rather than blanking the send", () => {
  for (const junk of [null, undefined, "nope", {}, [null]]) {
    const shape = resolveTemplateShape({ body_text: "Hi {{1}}", components_json: junk });
    assert.equal(shape.bodyText, "Hi {{1}}");
  }
});
