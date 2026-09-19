import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  FEATURES,
  allFeatures,
  featureForPath,
  featureDef,
  pathAllowed,
  planLayer,
  resolveFeatures,
  togglableKeys,
} from "../src/lib/features.ts";

// Run with: npm test
//
// The dangerous direction here is a wrong "off". A feature wrongly left on
// costs nothing; a feature wrongly switched off takes a screen away from a
// paying customer with no error anyone can act on. So most of these check
// that absence, emptiness and nonsense all mean "on".

describe("the catalogue", () => {
  it("has a unique key per feature", () => {
    const keys = FEATURES.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("gives every feature at least one path", () => {
    for (const feature of FEATURES) {
      assert.ok(feature.paths.length > 0, `${feature.key} owns no path`);
      for (const path of feature.paths) {
        assert.ok(path.startsWith("/"), `${feature.key} path "${path}" is not absolute`);
      }
    }
  });

  it("never lets two features claim the same path", () => {
    const seen = new Map<string, string>();
    for (const feature of FEATURES) {
      for (const path of feature.paths) {
        const owner = seen.get(path);
        assert.equal(owner, undefined, `${path} is claimed by both ${owner} and ${feature.key}`);
        seen.set(path, feature.key);
      }
    }
  });

  it("leaves the locked ones out of what can be toggled", () => {
    const togglable = new Set(togglableKeys());
    for (const feature of FEATURES) {
      assert.equal(togglable.has(feature.key), !feature.locked, feature.key);
    }
  });
});

describe("resolveFeatures", () => {
  it("turns everything on when nothing has been configured", () => {
    const features = resolveFeatures();
    for (const feature of FEATURES) assert.equal(features[feature.key], true, feature.key);
  });

  it("applies the platform default", () => {
    const features = resolveFeatures({ platform: { commerce: false } });
    assert.equal(features.commerce, false);
    assert.equal(features.invoicing, true);
  });

  it("lets the plan restrict what the platform default allowed", () => {
    const features = resolveFeatures({ plan: ["inbox", "leads"] });
    assert.equal(features.leads, true);
    assert.equal(features.commerce, false);
    assert.equal(features.invoicing, false);
  });

  it("lets one workspace have what its plan does not include", () => {
    // The whole point of the override layer: a customer who negotiated.
    const features = resolveFeatures({
      plan: ["inbox"],
      org: { invoicing: true },
    });
    assert.equal(features.invoicing, true);
    assert.equal(features.commerce, false);
  });

  it("lets one workspace lose what its plan does include", () => {
    const features = resolveFeatures({
      plan: ["inbox", "commerce"],
      org: { commerce: false },
    });
    assert.equal(features.commerce, false);
  });

  it("treats an empty plan list as everything, not nothing", () => {
    // A plan row written before features existed has []. Reading that as
    // "this tier includes no screens" would strip the product from every
    // customer on it the moment this shipped.
    for (const plan of [[], null, undefined, "not an array", {}]) {
      const features = resolveFeatures({ plan });
      assert.equal(features.commerce, true, `plan ${JSON.stringify(plan)}`);
      assert.equal(features.invoicing, true);
    }
  });

  it("ignores junk in a stored layer rather than failing", () => {
    const features = resolveFeatures({
      platform: { commerce: "yes", no_such_feature: false, invoicing: false },
      org: "not an object",
    });
    // "yes" is not a boolean, so commerce keeps its default.
    assert.equal(features.commerce, true);
    assert.equal(features.invoicing, false);
    assert.equal("no_such_feature" in features, false);
  });

  it("forces the locked features on however hard a layer tries", () => {
    const features = resolveFeatures({
      platform: { inbox: false },
      plan: ["commerce"],
      org: { inbox: false, billing: false, settings: false },
    });
    assert.equal(features.inbox, true);
    assert.equal(features.billing, true);
    assert.equal(features.settings, true);
  });
});

describe("planLayer", () => {
  it("never restricts a locked feature", () => {
    const layer = planLayer(["commerce"]);
    assert.equal("inbox" in layer, false);
    assert.equal(layer.commerce, true);
  });

  it("drops entries that are not strings", () => {
    const layer = planLayer(["commerce", 42, null]);
    assert.equal(layer.commerce, true);
    assert.equal(layer.invoicing, false);
  });
});

describe("featureForPath", () => {
  it("finds the owner of an exact path", () => {
    assert.equal(featureForPath("/commerce")?.key, "commerce");
  });

  it("finds the owner of a child path", () => {
    assert.equal(featureForPath("/invoice/list")?.key, "invoicing");
    assert.equal(featureForPath("/invoice/settings")?.key, "invoicing");
  });

  it("prefers the longest matching prefix", () => {
    // "/leads/board" must not be claimed by a shorter unrelated entry.
    assert.equal(featureForPath("/leads/board")?.key, "leads");
  });

  it("does not match a path that merely starts with the same letters", () => {
    // "/commercial-terms" is not inside "/commerce".
    assert.equal(featureForPath("/commerce-terms"), undefined);
  });

  it("returns undefined for a path no feature claims", () => {
    assert.equal(featureForPath("/overview"), undefined);
    assert.equal(featureForPath("/"), undefined);
  });
});

describe("pathAllowed", () => {
  const features = { ...allFeatures(), invoicing: false };

  it("refuses a path whose feature is off", () => {
    assert.equal(pathAllowed("/invoice/list", features), false);
  });

  it("allows a path whose feature is on", () => {
    assert.equal(pathAllowed("/commerce", features), true);
  });

  it("allows a path no feature claims, so the dashboard never locks out", () => {
    assert.equal(pathAllowed("/overview", features), true);
  });

  it("allows a path whose feature is missing from the map entirely", () => {
    // A stored set written before a feature existed must not hide the new
    // screen from everyone until an admin goes and ticks it.
    assert.equal(pathAllowed("/commerce", { invoicing: false }), true);
  });
});

describe("featureDef", () => {
  it("finds one by key", () => {
    assert.equal(featureDef("invoicing")?.label, "Invoice");
  });

  it("returns undefined for a key nothing matches", () => {
    assert.equal(featureDef("nope"), undefined);
  });
});
