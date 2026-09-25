import test from "node:test";
import assert from "node:assert/strict";
import { GUIDES, guideBySlug, guideSlugs, totalMinutes } from "../src/lib/guides.ts";

// A handbook with a dead link or an empty section in it is worse than no
// handbook: the reader concludes the product is unfinished rather than
// that one page is. These check the things a proofread would miss.

test("every guide has a slug nothing else uses", () => {
  const slugs = guideSlugs();
  assert.equal(new Set(slugs).size, slugs.length);
});

test("slugs are URL-safe, because they are the address", () => {
  for (const slug of guideSlugs()) {
    assert.match(slug, /^[a-z0-9-]+$/, `${slug} would not survive a URL`);
  }
});

test("a guide can be found by its slug, and a wrong one returns null", () => {
  assert.equal(guideBySlug("how-it-works")?.title, "How Neura Chat works");
  assert.equal(guideBySlug("nope"), null);
  assert.equal(guideBySlug(""), null);
});

test("nothing is published empty", () => {
  for (const guide of GUIDES) {
    assert.ok(guide.title.trim(), `${guide.slug} has no title`);
    assert.ok(guide.summary.trim(), `${guide.slug} has no summary`);
    assert.ok(guide.blocks.length > 0, `${guide.slug} has no content`);
    assert.ok(guide.minutes > 0, `${guide.slug} claims to take no time to read`);
  }
});

test("no block is a heading with nothing under it", () => {
  for (const guide of GUIDES) {
    for (const block of guide.blocks) {
      switch (block.kind) {
        case "text":
        case "warn":
          assert.ok(block.body.trim().length > 20, `${guide.slug} has a stub paragraph`);
          break;
        case "flow":
          assert.ok(block.lanes.length >= 2, `${guide.slug} has a flow with one box`);
          block.lanes.forEach((lane) => assert.ok(lane.label.trim(), `${guide.slug} unlabelled lane`));
          break;
        case "steps":
          assert.ok(block.steps.length >= 2, `${guide.slug} has a one-step list`);
          block.steps.forEach((step) => {
            assert.ok(step.title.trim(), `${guide.slug} untitled step`);
            assert.ok(step.body.trim(), `${guide.slug} empty step`);
          });
          break;
        case "tips":
          assert.ok(block.tips.length >= 1, `${guide.slug} has an empty tip list`);
          block.tips.forEach((tip) => {
            assert.ok(tip.title.trim(), `${guide.slug} untitled tip`);
            assert.ok(tip.body.trim(), `${guide.slug} empty tip`);
          });
          break;
        case "compare":
          assert.ok(block.good.length > 0 && block.bad.length > 0, `${guide.slug} half a comparison`);
          break;
        case "table":
          assert.ok(block.head.length >= 2, `${guide.slug} has a one-column table`);
          block.rows.forEach((row) =>
            assert.equal(
              row.length,
              block.head.length,
              `${guide.slug} has a row that does not match its header`
            )
          );
          break;
      }
    }
  }
});

test("the 24-hour rule is covered, because it explains most failures", () => {
  // Named deliberately: this is the concept behind the errors people hit
  // most, and a handbook that omits it has missed its job.
  const guide = guideBySlug("the-24-hour-rule");
  assert.ok(guide);
  assert.match(JSON.stringify(guide), /template/i);
});

test("reading time is honest enough to add up", () => {
  assert.equal(
    totalMinutes(),
    GUIDES.reduce((sum, guide) => sum + guide.minutes, 0)
  );
  assert.ok(totalMinutes() > 0);
});

test("every icon is one the page knows how to render", () => {
  const known = new Set(["map", "clock", "split", "rocket", "lightbulb", "inbox", "bot"]);
  for (const guide of GUIDES) {
    assert.ok(known.has(guide.icon), `${guide.slug} asks for an icon that does not exist`);
  }
});
