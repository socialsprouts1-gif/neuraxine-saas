import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BRAND,
  DEFAULT_HERO,
  DEFAULT_SITE_CONTENT,
  brandName,
  buildSiteContent,
  mergeSection,
} from "../src/lib/site-content.ts";

test("no saved rows renders exactly the built-in site", () => {
  // The landing page is the first thing anyone sees. An empty table, a
  // pending migration or a failed query must not blank it.
  assert.deepEqual(buildSiteContent([]), DEFAULT_SITE_CONTENT);
});

test("a saved section overrides only the fields it carries", () => {
  const hero = buildSiteContent([{ key: "hero", value: { headline: "New words" } }]).hero;

  assert.equal(hero.headline, "New words");
  assert.equal(hero.subheadline, DEFAULT_HERO.subheadline);
  assert.deepEqual(hero.pills, DEFAULT_HERO.pills);
});

test("an emptied list stays empty rather than falling back", () => {
  // Deleting every pill is a decision, not an absence. Merging element by
  // element would resurrect the defaults and look like the save failed.
  const hero = buildSiteContent([{ key: "hero", value: { pills: [] } }]).hero;
  assert.deepEqual(hero.pills, []);
});

test("switching off social proof survives the merge", () => {
  // false is falsy, and a merge that treats it as absent would keep showing
  // a claim someone deliberately turned off.
  const hero = buildSiteContent([{ key: "hero", value: { showSocialProof: false } }]).hero;
  assert.equal(hero.showSocialProof, false);
});

test("null and unknown keys are ignored, not stored", () => {
  const brand = mergeSection(DEFAULT_BRAND, {
    name: "Acme",
    nameAccent: null,
    somethingRemoved: "x",
  });

  assert.equal(brand.name, "Acme");
  assert.equal(brand.nameAccent, DEFAULT_BRAND.nameAccent);
  assert.equal("somethingRemoved" in brand, false);
});

test("junk in the row falls back rather than throwing", () => {
  assert.deepEqual(mergeSection(DEFAULT_BRAND, "not an object"), DEFAULT_BRAND);
  assert.deepEqual(mergeSection(DEFAULT_BRAND, ["an", "array"]), DEFAULT_BRAND);
  assert.deepEqual(mergeSection(DEFAULT_BRAND, null), DEFAULT_BRAND);
});

test("brandName joins the two halves and never comes back empty", () => {
  assert.equal(brandName(DEFAULT_BRAND), "Neura Chat");
  assert.equal(brandName({ ...DEFAULT_BRAND, nameAccent: "" }), "Neura");
  assert.equal(brandName({ ...DEFAULT_BRAND, name: "", nameAccent: "" }), "Neura Chat");
});
