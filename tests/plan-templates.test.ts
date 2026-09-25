import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_TEMPLATES,
  templateFor,
  matchTemplate,
  fillFor,
} from "../src/lib/plan-templates.ts";

test("every tier answers the same questions in the same order", () => {
  // The whole point: a pricing card is a comparison. If one tier talks
  // about seats third and another fourth, the cards cannot be read across.
  const counts = new Set(PLAN_TEMPLATES.map((template) => template.features.length));
  assert.equal(counts.size, 1, "tiers have different numbers of bullets");

  for (const template of PLAN_TEMPLATES) {
    assert.match(template.features[0], /messages a month/);
    assert.match(template.features[1], /contacts/);
    assert.match(template.features[2], /team seats/);
    assert.match(template.features[3], /WhatsApp number/);
  }
});

test("each tier says what it adds to the one below", () => {
  const [, growth, scale] = PLAN_TEMPLATES;
  assert.match(growth.features[4], /Everything in Starter/);
  assert.match(scale.features[4], /Everything in Growth/);
});

test("the allowances only ever go up", () => {
  const number = (line: string) => Number(line.replace(/[^0-9]/g, ""));
  for (let i = 1; i < PLAN_TEMPLATES.length; i += 1) {
    for (const field of [0, 1, 2]) {
      assert.ok(
        number(PLAN_TEMPLATES[i].features[field]) > number(PLAN_TEMPLATES[i - 1].features[field]),
        `${PLAN_TEMPLATES[i].name} bullet ${field} is not larger`
      );
    }
  }
});

test("a template is found by slug, whatever the casing", () => {
  assert.equal(templateFor("growth")?.name, "Growth");
  assert.equal(templateFor("  GROWTH  ")?.name, "Growth");
  assert.equal(templateFor("enterprise"), null);
});

test("a plan with an odd slug is still matched on its name", () => {
  // Refusing to help because of a slug nobody chose deliberately would
  // make this useless on exactly the plans that need it.
  assert.equal(matchTemplate({ slug: "plan-2", name: "Scale" })?.slug, "scale");
  assert.equal(matchTemplate({ slug: null, name: "growth" })?.slug, "growth");
  assert.equal(matchTemplate({ slug: "x", name: "Enterprise" }), null);
});

test("an empty plan gets both the description and the bullets", () => {
  const fill = fillFor({ slug: "starter", description: null, features: [] });
  assert.ok(fill?.description);
  assert.equal(fill?.features?.length, 5);
});

test("wording somebody already wrote is left alone", () => {
  // A button that tidies the cards must not overwrite copy that was
  // deliberately written.
  const fill = fillFor({
    slug: "starter",
    description: "Our own words",
    features: ["Our own bullet"],
  });
  assert.equal(fill, null);
});

test("only the missing half is filled", () => {
  const fill = fillFor({ slug: "growth", description: "Ours", features: [] });
  assert.equal(fill?.description, undefined);
  assert.ok(fill?.features);
});

test("blank strings count as missing, not as written", () => {
  const fill = fillFor({ slug: "growth", description: "   ", features: ["", "  "] });
  assert.ok(fill?.description);
  assert.ok(fill?.features);
});

test("overwrite replaces even what is written, when asked", () => {
  const fill = fillFor(
    { slug: "scale", description: "Ours", features: ["Ours"] },
    { overwrite: true }
  );
  assert.ok(fill?.description);
  assert.ok(fill?.features);
});

test("a plan with no matching template is left entirely alone", () => {
  assert.equal(fillFor({ slug: "enterprise", name: "Enterprise" }), null);
});
