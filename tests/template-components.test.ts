import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateComponents,
  templateSendable,
} from "../src/lib/template-components.ts";

const IMG = "https://cdn.example.com/diwali.jpg";

test("a plain template with no variables sends no components at all", () => {
  const result = buildTemplateComponents({ bodyText: "Thanks for shopping with us." });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.components, []);
});

test("body variables become exactly as many parameters as the template declares", () => {
  const result = buildTemplateComponents(
    { bodyText: "Hi {{1}}, your order {{2}} is ready." },
    ["Asha", "NX-1024"]
  );
  assert.equal(result.ok, true);
  const [body] = result.ok ? result.components : [];
  assert.equal(body.type, "body");
  assert.deepEqual(body.parameters, [
    { type: "text", text: "Asha" },
    { type: "text", text: "NX-1024" },
  ]);
});

test("a missing value becomes a space rather than dropping the parameter", () => {
  // One fewer parameter than declared is a 400. A blank is not.
  const result = buildTemplateComponents({ bodyText: "Hi {{1}}, ref {{2}}." }, ["Asha"]);
  assert.equal(result.ok && result.components[0].parameters?.length, 2);
  assert.deepEqual(result.ok && result.components[0].parameters?.[1], {
    type: "text",
    text: " ",
  });
});

test("extra values are ignored, because the template decides the count", () => {
  const result = buildTemplateComponents({ bodyText: "Hi {{1}}." }, ["Asha", "spare", "more"]);
  assert.equal(result.ok && result.components[0].parameters?.length, 1);
});

// --- the header, which was never built at all ------------------------------

test("an image header sends a header component with the link", () => {
  const result = buildTemplateComponents({
    bodyText: "Our Diwali offer is live.",
    headerFormat: "IMAGE",
    headerMediaUrl: IMG,
  });

  assert.equal(result.ok, true);
  const [header] = result.ok ? result.components : [];
  assert.equal(header.type, "header");
  assert.deepEqual(header.parameters, [{ type: "image", image: { link: IMG } }]);
});

test("video and document headers use their own parameter names", () => {
  for (const [format, key] of [
    ["VIDEO", "video"],
    ["DOCUMENT", "document"],
  ] as const) {
    const result = buildTemplateComponents({
      bodyText: "x",
      headerFormat: format,
      headerMediaUrl: IMG,
    });
    assert.equal(result.ok && result.components[0].parameters?.[0][key] !== undefined, true, format);
  }
});

test("header comes before body, which is the order Meta expects", () => {
  const result = buildTemplateComponents(
    { bodyText: "Hi {{1}}.", headerFormat: "IMAGE", headerMediaUrl: IMG },
    ["Asha"]
  );
  assert.deepEqual(result.ok && result.components.map((c) => c.type), ["header", "body"]);
});

test("a media header with no media is refused here, not by Meta per recipient", () => {
  const result = buildTemplateComponents({
    bodyText: "x",
    headerFormat: "IMAGE",
    headerMediaUrl: "",
  });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /image header/);
  assert.match(result.ok === false ? result.error : "", /Meta refuses the whole message/);
});

test("a non-https media link is refused, because Meta will not fetch it", () => {
  const result = buildTemplateComponents({
    bodyText: "x",
    headerFormat: "IMAGE",
    headerMediaUrl: "http://cdn.example.com/a.jpg",
  });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /https/);
});

test("format casing from the database does not change the outcome", () => {
  const result = buildTemplateComponents({
    bodyText: "x",
    headerFormat: "image",
    headerMediaUrl: IMG,
  });
  assert.equal(result.ok, true);
});

// --- text headers ----------------------------------------------------------

test("a text header with no variable adds no component", () => {
  const result = buildTemplateComponents({
    bodyText: "x",
    headerFormat: "TEXT",
    headerText: "Order update",
  });
  assert.deepEqual(result.ok && result.components, []);
});

test("a text header with a variable is filled", () => {
  const result = buildTemplateComponents(
    { bodyText: "Body {{1}}.", headerFormat: "TEXT", headerText: "Order {{1}}" },
    ["NX-1024"]
  );
  assert.equal(result.ok, true);
  const components = result.ok ? result.components : [];
  assert.equal(components[0].type, "header");
  assert.deepEqual(components[0].parameters, [{ type: "text", text: "NX-1024" }]);
  assert.equal(components[1].type, "body");
});

test("NONE and a missing header format both mean no header", () => {
  for (const headerFormat of ["NONE", null, undefined]) {
    const result = buildTemplateComponents({ bodyText: "x", headerFormat });
    assert.deepEqual(result.ok && result.components, []);
  }
});

// --- the pre-flight check --------------------------------------------------

test("templateSendable names the problem before a campaign starts", () => {
  assert.equal(templateSendable({ bodyText: "x" }), null);
  assert.equal(templateSendable({ bodyText: "x", headerFormat: "IMAGE", headerMediaUrl: IMG }), null);

  const problem = templateSendable({ bodyText: "x", headerFormat: "IMAGE" });
  assert.match(problem ?? "", /image header/);
});

test("a template needing variables is still sendable — blanks are legal, missing media is not", () => {
  assert.equal(templateSendable({ bodyText: "Hi {{1}}." }), null);
});
