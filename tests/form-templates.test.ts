import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { FORM_TEMPLATES, findTemplate, templateScreens } from "../src/lib/form-templates.ts";
import { LIMITS, labelLimit, validateFlow, isAnswering, isChoosing } from "../src/lib/flow-json.ts";

// Run with: npm test
//
// The point of a prebuilt form is that it works on the first upload. So the
// interesting test is not that the data parses — it is that every bundled
// template survives the same validator the editor runs before sending a
// document to Meta. A template that Meta refuses is worse than no template:
// it fails after the user has already decided to trust it.

describe("the bundled templates", () => {
  for (const template of FORM_TEMPLATES) {
    it(`${template.slug} passes the flow validator`, () => {
      const screens = templateScreens(template);
      const result = validateFlow(screens);
      assert.deepEqual(
        result.errors,
        [],
        `${template.slug} produced: ${result.errors.join("; ")}`
      );
    });

    it(`${template.slug} stays inside Meta's label and title limits`, () => {
      for (const screen of templateScreens(template)) {
        assert.ok(screen.title.length <= LIMITS.screenTitle, `${screen.screenId} title too long`);
        assert.ok(
          screen.buttonLabel.length <= LIMITS.footerLabel,
          `${screen.screenId} button label too long`
        );

        for (const field of screen.fields) {
          assert.ok(
            field.label.length <= labelLimit(field.kind),
            `${screen.screenId}/${field.name} label is ${field.label.length} characters, over the ${labelLimit(field.kind)} allowed for a ${field.kind}`
          );
          assert.ok(
            field.helperText.length <= LIMITS.helperText,
            `${screen.screenId}/${field.name} helper text too long`
          );
          for (const option of field.options) {
            assert.ok(
              option.title.length <= LIMITS.optionTitle,
              `${screen.screenId}/${field.name} option "${option.title}" too long`
            );
          }
        }
      }
    });

    it(`${template.slug} gives every chooser something to choose`, () => {
      for (const screen of templateScreens(template)) {
        for (const field of screen.fields) {
          if (!isChoosing(field.kind)) continue;
          assert.ok(
            field.options.length >= 2,
            `${screen.screenId}/${field.name} is a ${field.kind} with ${field.options.length} option(s)`
          );
        }
      }
    });

    it(`${template.slug} has a button label WhatsApp will accept`, () => {
      // The CTA on the message bubble, not the footer inside the form.
      assert.ok(template.buttonText.length > 0, "no button text");
      assert.ok(template.buttonText.length <= 20, "WhatsApp caps the CTA at 20 characters");
    });
  }

  it("gives every answer in a form a distinct key", () => {
    for (const template of FORM_TEMPLATES) {
      const names = templateScreens(template)
        .flatMap((screen) => screen.fields)
        .filter((field) => isAnswering(field.kind))
        .map((field) => field.name);

      assert.equal(
        new Set(names).size,
        names.length,
        `${template.slug} repeats an answer key: ${names.join(", ")}`
      );
    }
  });

  it("has a unique slug and name per template", () => {
    const slugs = FORM_TEMPLATES.map((t) => t.slug);
    const names = FORM_TEMPLATES.map((t) => t.name);
    assert.equal(new Set(slugs).size, slugs.length);
    assert.equal(new Set(names).size, names.length);
  });

  it("builds fresh keys each time, so two forms from one template don't collide", () => {
    const first = templateScreens(FORM_TEMPLATES[0]);
    const second = templateScreens(FORM_TEMPLATES[0]);
    assert.notEqual(first[0].key, second[0].key);
    assert.notEqual(first[0].fields[0].key, second[0].fields[0].key);
    // The parts Meta sees must be identical, though.
    assert.equal(first[0].screenId, second[0].screenId);
    assert.equal(first[0].fields[0].name, second[0].fields[0].name);
  });
});

describe("findTemplate", () => {
  it("finds one by slug", () => {
    assert.equal(findTemplate("appointment")?.name, "Book an appointment");
  });

  it("returns undefined rather than throwing on a name nothing matches", () => {
    assert.equal(findTemplate("no-such-template"), undefined);
  });
});
