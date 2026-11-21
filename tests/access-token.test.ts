import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  InvalidAccessTokenError,
  assertUsableAccessToken,
  checkAccessToken,
} from "../src/lib/access-token.ts";

// Run with: npm test
//
// A token is only ever used as an HTTP header value, so the one thing that
// must never happen is storing a token that cannot be encoded as one. That is
// not hypothetical — see the em dash case below.

const GOOD = "EAAONUy3zTxABSUntIAIyAnM3Hu6cOcWwSRSg9V7IVDvfCAd-_x9";

test("a normal Meta token is accepted unchanged", () => {
  const check = checkAccessToken(GOOD);
  assert.equal(check.ok, true);
  assert.equal(check.token, GOOD);
  assert.equal(check.warning, undefined);
});

test("surrounding whitespace from a copy-paste is trimmed, not rejected", () => {
  const check = checkAccessToken(`  ${GOOD}\n`);
  assert.equal(check.ok, true);
  assert.equal(check.token, GOOD);
});

test("an empty field is refused before anything else", () => {
  assert.equal(checkAccessToken("   ").ok, false);
});

// The exact failure seen in production: autocorrect turned a hyphen into
// U+2014, fetch threw "character at index 21 has a value of 8212", and the
// operator saw "Failed to send message" with nothing to act on.
test("the em dash that broke production is refused, and named", () => {
  const check = checkAccessToken("EAAONUy3zTxABS—UntIAIyAnM3Hu6cOcWwSRSg9V7");
  assert.equal(check.ok, false);
  assert.match(check.error!, /em dash/);
  assert.match(check.error!, /autocorrect/);
  assert.match(check.error!, /character 15/);
});

test("the other punctuation substitutions are caught too", () => {
  for (const [char, expected] of [
    ["–", /en dash/],
    ["’", /curly quote/],
    ["“", /curly quote/],
    [" ", /non-breaking space/],
    ["​", /zero-width space/],
    ["…", /truncated display/],
  ] as const) {
    const check = checkAccessToken(`EAAO${char}Uy3zTxABS`);
    assert.equal(check.ok, false, `expected ${JSON.stringify(char)} to be refused`);
    assert.match(check.error!, expected);
  }
});

test("an internal line break is refused", () => {
  // Trimming only helps at the ends; a token broken across two lines by a
  // narrow text box still cannot go in a header.
  const check = checkAccessToken("EAAONUy3z\nTxABSUntIAIy");
  assert.equal(check.ok, false);
  assert.match(check.error!, /line break/);
});

test("every refusal explains the consequence, not just the character", () => {
  const check = checkAccessToken("EAAO—Uy3z");
  assert.match(check.error!, /HTTP header/);
  assert.match(check.error!, /would ever reach Meta/);
});

test("a token that does not start with EA saves, but says so", () => {
  const check = checkAccessToken("1046780474407369|abc123def456");
  assert.equal(check.ok, true, "an unusual token is still stored");
  assert.match(check.warning!, /normally start with/);
});

test("assertUsableAccessToken throws a typed error for a stored bad token", () => {
  assert.throws(
    () => assertUsableAccessToken("EAAO—Uy3z"),
    (error: unknown) => {
      assert.ok(error instanceof InvalidAccessTokenError);
      assert.match(error.message, /Update access token/);
      return true;
    }
  );
});

test("assertUsableAccessToken passes a good token through silently", () => {
  assert.doesNotThrow(() => assertUsableAccessToken(GOOD));
});

test("no accepted token can throw when built into a header", () => {
  // The property that actually matters, asserted against the real encoder.
  const candidates = [GOOD, `  ${GOOD} `, "1046780474407369|secret", "EA-_~!az09"];
  for (const candidate of candidates) {
    const check = checkAccessToken(candidate);
    assert.equal(check.ok, true);
    assert.doesNotThrow(
      () => new Headers({ Authorization: `Bearer ${check.token}` }),
      `Headers rejected an accepted token: ${candidate}`
    );
  }
});
