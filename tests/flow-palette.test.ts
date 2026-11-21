import test from "node:test";
import assert from "node:assert/strict";
import { NODE_DEFS, NODE_GROUPS } from "../src/types/flow.ts";

// The palette as a thing somebody has to read.
//
// It was reported as looking machine-made, and the reason was measurable
// rather than a matter of taste: eight of the eleven Send components
// carried the identical cyan, so the column was eight tiles that differed
// only by a glyph nobody can resolve at 16px. These are the rules that
// stop it drifting back.

function hex(value: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  };
}

/** Hue in degrees, which is what the eye actually sorts these by. */
function hue({ r, g, b }: { r: number; g: number; b: number }): number {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return (h * 60 + 360) % 360;
}

/** The shortest way round the colour wheel between two hues. */
function apart(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

test("every component declares a colour we can actually use", () => {
  for (const def of NODE_DEFS) {
    assert.match(def.accent, /^#[0-9A-Fa-f]{6}$/, `${def.kind} has no usable accent`);
  }
});

test("no two components in a group share a colour", () => {
  for (const group of NODE_GROUPS) {
    const items = NODE_DEFS.filter((def) => def.group === group);
    const seen = new Map<string, string>();
    for (const def of items) {
      const clash = seen.get(def.accent.toUpperCase());
      assert.equal(
        clash,
        undefined,
        `${group}: ${def.kind} and ${clash} are both ${def.accent}`
      );
      seen.set(def.accent.toUpperCase(), def.kind);
    }
  }
});

test("components next to each other in a group are visibly different colours", () => {
  // Adjacency is what matters: two similar blues at opposite ends of a
  // list are fine, and two next to each other read as a mistake.
  for (const group of NODE_GROUPS) {
    const items = NODE_DEFS.filter((def) => def.group === group);
    for (let i = 1; i < items.length; i += 1) {
      const previous = items[i - 1];
      const current = items[i];
      const gap = apart(hue(hex(previous.accent)), hue(hex(current.accent)));
      // Grey has no hue to compare, so it is exempt — it is distinct from
      // every colour by being the only one without one.
      const grey = (c: string) => {
        const { r, g, b } = hex(c);
        return Math.max(r, g, b) - Math.min(r, g, b) < 30;
      };
      if (grey(previous.accent) || grey(current.accent)) continue;
      assert.ok(
        gap >= 25,
        `${previous.kind} and ${current.kind} sit next to each other and are only ${gap.toFixed(
          0
        )}° apart`
      );
    }
  }
});

test("every component says what it is, in words as well as a picture", () => {
  for (const def of NODE_DEFS) {
    assert.ok(def.label.trim().length > 0, `${def.kind} has no label`);
    assert.ok(
      def.description.trim().length > 10,
      `${def.kind} has no description worth reading`
    );
  }
});

test("the ten WhatsApp message types are all in the Send group", () => {
  const send = NODE_DEFS.filter((def) => def.group === "Send").map((def) => def.kind);
  for (const kind of [
    "send_text",
    "send_buttons",
    "send_list",
    "send_media",
    "send_template",
    "send_cta",
    "send_form",
    "send_product",
    "send_location",
    "send_contact",
  ] as const) {
    assert.ok(send.includes(kind), `${kind} is not where somebody would look for it`);
  }
});
