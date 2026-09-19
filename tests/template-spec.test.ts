import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildComponents,
  specFromRow,
  fillVariables,
  normaliseName,
  validateTemplate,
  variablesIn,
  type TemplateSpec,
} from "../src/lib/template-spec.ts";

function spec(overrides: Partial<TemplateSpec> = {}): TemplateSpec {
  return {
    name: "order_update",
    language: "en_US",
    category: "UTILITY",
    headerFormat: "NONE",
    headerText: "",
    headerMediaUrl: "",
    body: "Hi {{1}}, your order {{2}} has shipped.",
    footer: "",
    buttons: [],
    samples: ["Vivek", "#1234"],
    ...overrides,
  };
}

test("variablesIn finds placeholders in order, without duplicates", () => {
  assert.deepEqual(variablesIn("Hi {{1}}, order {{2}} — {{1}} again"), [1, 2]);
  assert.deepEqual(variablesIn("{{ 3 }} then {{1}}"), [1, 3]);
  assert.deepEqual(variablesIn("no variables"), []);
});

test("normaliseName produces what Meta accepts", () => {
  assert.equal(normaliseName("Order Update"), "order_update");
  assert.equal(normaliseName("  Welcome — New Customer!  "), "welcome_new_customer");
  assert.equal(normaliseName("a--b__c"), "a_b_c");
  assert.equal(normaliseName("_leading_and_trailing_"), "leading_and_trailing");
});

test("a well-formed template validates", () => {
  assert.equal(validateTemplate(spec()).ok, true);
});

function errorsFor(overrides: Partial<TemplateSpec>): string[] {
  const result = validateTemplate(spec(overrides));
  return result.ok ? [] : result.errors;
}

test("the body is required and capped", () => {
  assert.match(errorsFor({ body: "" }).join(" "), /body/i);
  assert.match(errorsFor({ body: "x".repeat(1100) }).join(" "), /1024/);
});

test("a body of only variables is refused", () => {
  // Meta rejects these every time; catching it here saves a review cycle.
  assert.match(errorsFor({ body: "{{1}} {{2}}" }).join(" "), /only variables/i);
});

test("variables must run 1..n with no gaps", () => {
  const errors = errorsFor({ body: "Hi {{1}}, ref {{3}}", samples: ["a", "b"] });
  assert.match(errors.join(" "), /no gaps/i);
});

test("every variable needs a sample", () => {
  assert.match(errorsFor({ samples: ["Vivek"] }).join(" "), /example for each/i);
  assert.deepEqual(errorsFor({ samples: ["Vivek", "#1234"] }), []);
});

test("the name must be lowercase with underscores", () => {
  assert.match(errorsFor({ name: "Order Update" }).join(" "), /lowercase/i);
  assert.deepEqual(errorsFor({ name: "order_update_2" }), []);
});

test("a footer cannot carry variables", () => {
  assert.match(errorsFor({ footer: "Reply to {{1}}" }).join(" "), /footer cannot contain/i);
});

test("a media header needs a sample file", () => {
  assert.match(errorsFor({ headerFormat: "IMAGE" }).join(" "), /sample file/i);
  assert.deepEqual(
    errorsFor({ headerFormat: "IMAGE", headerMediaUrl: "https://x.test/a.jpg" }),
    []
  );
});

test("button counts follow Meta's limits", () => {
  const quick = (text: string) => ({ type: "QUICK_REPLY" as const, text });
  assert.deepEqual(errorsFor({ buttons: [quick("a"), quick("b"), quick("c")] }), []);
  assert.match(
    errorsFor({ buttons: [quick("a"), quick("b"), quick("c"), quick("d")] }).join(" "),
    /3 quick replies/i
  );
});

test("quick replies cannot be interleaved with action buttons", () => {
  const errors = errorsFor({
    buttons: [
      { type: "QUICK_REPLY", text: "Yes" },
      { type: "URL", text: "Track", url: "https://x.test" },
      { type: "QUICK_REPLY", text: "No" },
    ],
  });
  assert.match(errors.join(" "), /together/i);
});

test("a link button needs a real URL and a call button a real number", () => {
  assert.match(
    errorsFor({ buttons: [{ type: "URL", text: "Track", url: "not a url" }] }).join(" "),
    /https/i
  );
  assert.match(
    errorsFor({ buttons: [{ type: "PHONE_NUMBER", text: "Call", phone_number: "abc" }] }).join(" "),
    /international/i
  );
});

test("authentication templates cannot carry link buttons", () => {
  const errors = errorsFor({
    category: "AUTHENTICATION",
    buttons: [{ type: "URL", text: "Open", url: "https://x.test" }],
  });
  assert.match(errors.join(" "), /Authentication/i);
});

// --- the payload ----------------------------------------------------------

test("body examples nest as an array of arrays, as Meta requires", () => {
  const body = buildComponents(spec()).find((c) => c.type === "BODY");
  assert.deepEqual(body?.example, { body_text: [["Vivek", "#1234"]] });
});

test("a body with no variables carries no example", () => {
  const body = buildComponents(spec({ body: "Your order has shipped.", samples: [] })).find(
    (c) => c.type === "BODY"
  );
  assert.equal(body?.example, undefined);
});

test("a text header example is a flat array", () => {
  const components = buildComponents(
    spec({ headerFormat: "TEXT", headerText: "Order {{1}}", samples: ["#1234", "b"] })
  );
  const header = components.find((c) => c.type === "HEADER");
  assert.equal(header?.format, "TEXT");
  assert.deepEqual(header?.example, { header_text: ["#1234"] });
});

test("a media header carries the uploaded handle, not the URL", () => {
  // Meta does not fetch a link here. header_handle must be the handle its
  // Resumable Upload API returned for the bytes; a URL in this field is
  // refused as "Invalid parameter (code 100)" naming no field at all.
  const header = buildComponents(
    spec({ headerFormat: "IMAGE", headerMediaUrl: "https://x.test/a.jpg" }),
    "4::aW1hZ2UvanBlZw==:ARZhandle"
  ).find((c) => c.type === "HEADER");

  assert.equal(header?.format, "IMAGE");
  assert.equal(header?.text, undefined);
  assert.deepEqual(header?.example, { header_handle: ["4::aW1hZ2UvanBlZw==:ARZhandle"] });
});

test("a media header falls back to the URL only when no handle was uploaded", () => {
  // Rendering a preview needs something; a submission never takes this path
  // because submitTemplate uploads first and refuses to continue if it fails.
  const header = buildComponents(
    spec({ headerFormat: "IMAGE", headerMediaUrl: "https://x.test/a.jpg" })
  ).find((c) => c.type === "HEADER");

  assert.deepEqual(header?.example, { header_handle: ["https://x.test/a.jpg"] });
});

test("components come out in Meta's order and omit empty parts", () => {
  const kinds = buildComponents(
    spec({
      headerFormat: "TEXT",
      headerText: "Update",
      footer: "Reply STOP to opt out",
      buttons: [{ type: "QUICK_REPLY", text: "Thanks" }],
    })
  ).map((c) => c.type);

  assert.deepEqual(kinds, ["HEADER", "BODY", "FOOTER", "BUTTONS"]);
  assert.deepEqual(buildComponents(spec()).map((c) => c.type), ["BODY"]);
});

test("buttons keep their own shape per type", () => {
  const buttons = buildComponents(
    spec({
      buttons: [
        { type: "QUICK_REPLY", text: "Yes" },
        { type: "URL", text: "Track", url: "https://x.test/t" },
        { type: "PHONE_NUMBER", text: "Call", phone_number: "+919876543210" },
      ],
    })
  ).find((c) => c.type === "BUTTONS")?.buttons;

  assert.deepEqual(buttons, [
    { type: "QUICK_REPLY", text: "Yes" },
    { type: "URL", text: "Track", url: "https://x.test/t" },
    { type: "PHONE_NUMBER", text: "Call", phone_number: "+919876543210" },
  ]);
});

test("fillVariables substitutes, and leaves a missing one visible", () => {
  assert.equal(fillVariables("Hi {{1}}, order {{2}}", ["Vivek", "#9"]), "Hi Vivek, order #9");
  // Better a visible {{2}} in a preview than a silent gap in a real send.
  assert.equal(fillVariables("Hi {{1}}, order {{2}}", ["Vivek"]), "Hi Vivek, order {{2}}");
});

test("specFromRow reopens a saved template with every part intact", () => {
  const restored = specFromRow({
    name: "order_update",
    language: "hi",
    category: "MARKETING",
    header_format: "IMAGE",
    header_text: "",
    header_media_url: "https://x.test/a.jpg",
    body_text: "Hi {{1}}, your order is on the way.",
    footer_text: "Reply STOP to opt out",
    buttons: [{ type: "URL", text: "Track", url: "https://x.test/t" }],
    variable_samples: ["Vivek"],
  });

  assert.equal(restored.name, "order_update");
  assert.equal(restored.language, "hi");
  assert.equal(restored.category, "MARKETING");
  assert.equal(restored.headerFormat, "IMAGE");
  assert.equal(restored.body, "Hi {{1}}, your order is on the way.");
  assert.deepEqual(restored.buttons, [{ type: "URL", text: "Track", url: "https://x.test/t" }]);
  assert.deepEqual(restored.samples, ["Vivek"]);
});

test("specFromRow survives a row synced from WhatsApp Manager", () => {
  // Those rows carry a name and nothing else. The builder should open empty
  // rather than throw, so the template can at least be seen and rebuilt.
  const restored = specFromRow({ name: "synced_one", language: "en_US", category: "UTILITY" });

  assert.equal(restored.body, "");
  assert.equal(restored.headerFormat, "NONE");
  assert.deepEqual(restored.buttons, []);
  assert.deepEqual(restored.samples, []);
});

test("specFromRow drops button shapes it does not recognise", () => {
  const restored = specFromRow({
    name: "x",
    language: "en_US",
    category: "UTILITY",
    buttons: [{ type: "FLOW", text: "Open" }, null, "nonsense", { type: "QUICK_REPLY", text: "Yes" }],
  });

  assert.deepEqual(restored.buttons, [{ type: "QUICK_REPLY", text: "Yes" }]);
});

test("specFromRow falls back when the stored header format is junk", () => {
  const restored = specFromRow({
    name: "x",
    language: "en_US",
    category: "NOPE",
    header_format: "CAROUSEL",
  });

  assert.equal(restored.headerFormat, "NONE");
  assert.equal(restored.category, "UTILITY");
});
