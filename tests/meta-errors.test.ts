import { strict as assert } from "node:assert";
import { test } from "node:test";
import { describeMetaError, hasDetailHelp, isMetaAuthError, metaErrorDetail } from "../src/lib/meta-errors.ts";

// Run with: npm test
//
// These are the sentences an operator reads when a send fails, so the thing
// worth pinning is that no path can leak the raw JSON envelope back to them —
// that is the bug this module exists to fix.

// The exact body Meta returned when the stored token expired in production.
const EXPIRED_TOKEN = {
  error: {
    message: "Authentication Error",
    code: 190,
    type: "OAuthException",
    fbtrace_id: "A29xKocep--lOwYvSsx3n2P",
  },
};

test("parses a real Meta error body", () => {
  const detail = metaErrorDetail(EXPIRED_TOKEN);
  assert.equal(detail.code, 190);
  assert.equal(detail.type, "OAuthException");
  assert.equal(detail.detail, "Authentication Error");
});

test("prefers error_data.details over the generic message", () => {
  const detail = metaErrorDetail({
    error: {
      message: "Invalid parameter",
      code: 100,
      error_data: { details: "template name (welcome_v2) does not exist in en_US" },
    },
  });
  assert.equal(detail.detail, "template name (welcome_v2) does not exist in en_US");
});

test("an unparsable body yields nulls rather than throwing", () => {
  for (const body of [null, undefined, "nope", 42, {}, { error: null }, { error: "boom" }]) {
    const detail = metaErrorDetail(body);
    assert.equal(detail.code, null);
    assert.equal(detail.detail, null);
  }
});

test("code 190 is a credential failure, not a message failure", () => {
  assert.equal(isMetaAuthError(401, EXPIRED_TOKEN), true);
});

test("a bad template is not a credential failure", () => {
  // Recording this against the connection would put a permanent warning on
  // the card for a fault in one message.
  assert.equal(
    isMetaAuthError(400, { error: { message: "Template not found", code: 132001 } }),
    false
  );
  assert.equal(
    isMetaAuthError(400, { error: { message: "Re-engagement message", code: 131047 } }),
    false
  );
});

test("a 401 OAuthException with no code still reads as a credential failure", () => {
  assert.equal(isMetaAuthError(401, { error: { type: "OAuthException" } }), true);
});

test("a 401 without an OAuth envelope is not assumed to be one", () => {
  assert.equal(isMetaAuthError(401, { something: "else" }), false);
});

test("the expired-token message names the fix and the token that lasts", () => {
  const message = describeMetaError(401, EXPIRED_TOKEN);
  assert.match(message, /expired or been revoked/);
  assert.match(message, /Integrations/);
  assert.match(message, /System User token does not expire/);
});

test("the test-number restriction names where to add the recipient", () => {
  const message = describeMetaError(400, {
    error: { message: "Recipient phone number not in allowed list", code: 131030 },
  });
  assert.match(message, /allowed list/);
  assert.match(message, /API Setup/);
});

test("an unrecognised code falls back to Meta's own wording", () => {
  const message = describeMetaError(400, {
    error: { message: "Something inventive went wrong", code: 999999 },
  });
  assert.match(message, /Something inventive went wrong/);
  assert.match(message, /999999/);
});

test("no branch ever returns the raw JSON envelope", () => {
  const bodies: unknown[] = [
    EXPIRED_TOKEN,
    { error: { message: "Invalid parameter", code: 100 } },
    { error: { message: "unknown", code: 987654 } },
    { error: { message: "Rate limit", code: 130429 } },
    {},
    null,
    "not json at all",
  ];

  for (const body of bodies) {
    const message = describeMetaError(400, body);
    assert.ok(message.length > 0, "every branch produces a message");
    assert.doesNotMatch(message, /[{}]/, `leaked JSON braces for ${JSON.stringify(body)}`);
    assert.doesNotMatch(message, /fbtrace_id/, "leaked Meta's trace id into operator-facing text");
  }
});

// Meta reuses code 100 for "bad field" and for "that object does not exist
// or you cannot see it". The generic text for 100 sends people looking at
// their message when the problem is asset assignment on the token.
test("code 100 subcode 33 is about permissions, not the message body", () => {
  const message = describeMetaError(400, {
    error: {
      message: "Unsupported post request. Object with ID '1203608382834277' does not exist…",
      code: 100,
      type: "GraphMethodException",
      error_subcode: 33,
    },
  });
  assert.match(message, /System User/);
  assert.match(message, /does not update an existing token/);
  assert.doesNotMatch(message, /rejected one of the message's fields/);
});

test("code 100 without that subcode keeps the generic field wording", () => {
  const message = describeMetaError(400, {
    error: { message: "Invalid parameter", code: 100 },
  });
  assert.match(message, /rejected one of the message's fields/);
});

test("an integrity block says it is the account, not the message", () => {
  const text = describeMetaError(400, {
    error: { code: 139000, message: "Blocked by Integrity" },
  });
  // The operator's first instinct is to retry or reword; the text has to
  // head that off.
  assert.match(text, /not on this message/);
  assert.match(text, /Account Quality/);
});

test("Meta's user-facing wording beats our generic text for code 100", () => {
  // The real shape of a template rejection: `message` stays a useless
  // "Invalid parameter" while error_user_title/msg carry the actual fault.
  const said = describeMetaError(400, {
    error: {
      message: "Invalid parameter",
      type: "OAuthException",
      code: 100,
      error_subcode: 2388043,
      error_user_title: "Template Name Already Exists",
      error_user_msg: "A template with this name already exists in this account.",
    },
  });

  assert.match(said, /already exists/i);
  assert.doesNotMatch(said, /rejected one of the message's fields/);
});

test("a subcode is always quoted, so it can be looked up", () => {
  const said = describeMetaError(400, {
    error: { message: "Invalid parameter", code: 100, error_subcode: 2388099 },
  });

  assert.match(said, /100\/2388099/);
});

test("user wording is still reported when only the title is present", () => {
  const said = describeMetaError(400, {
    error: { message: "Invalid parameter", code: 100, error_user_title: "Media Upload Error" },
  });

  assert.match(said, /Media Upload Error/);
});

test("2388339 points at the account, not at the template's fields", () => {
  const said = describeMetaError(400, {
    error: {
      message: "Invalid parameter",
      code: 100,
      error_subcode: 2388339,
      error_user_title: "Invalid WhatsApp account usage",
      error_user_msg: "WhatsApp accounts cannot be used with this API.",
    },
  });

  // Both halves. Meta states the refusal; our hint says what causes it and
  // that the template's fields are not where to go looking.
  assert.match(said, /WhatsApp accounts cannot be used with this API/);
  assert.match(said, /WhatsApp Business Account/i);
  assert.match(said, /100\/2388339/);
});

test("our hint never replaces what Meta actually said", () => {
  // The bug this guards: a subcode we recognise used to suppress
  // error_user_msg entirely, so an operator whose real fault was not the
  // one the hint guesses at was sent to check something already correct.
  const said = describeMetaError(400, {
    error: {
      message: "Invalid parameter",
      code: 100,
      error_subcode: 2388042,
      error_user_title: "Template Name Already Exists",
      error_user_msg: "A template named order_shipped already exists in en_US.",
    },
  });

  assert.match(said, /order_shipped/);
  assert.match(said, /Delete it in Meta/);
});

test("the hint still stands alone when Meta says nothing user-facing", () => {
  const said = describeMetaError(400, {
    error: { message: "Invalid parameter", code: 100, error_subcode: 2388042 },
  });

  assert.match(said, /already exists/i);
  assert.match(said, /100\/2388042/);
});

// --- faults Meta explains only in prose -----------------------------------

test("the coexistence catalogue refusal is named for what it is", () => {
  // A bare #10 reads as a missing permission. This one is not: Meta blocks
  // the catalogue endpoints on an SMB-type account outright, so sending
  // someone to App Review costs them weeks for nothing.
  const said = describeMetaError(400, {
    error: {
      message: "(#10) This operation can not be performed on SMB business type",
      type: "OAuthException",
      code: 10,
    },
  });

  assert.match(said, /WhatsApp Business app/);
  assert.match(said, /Commerce Manager/);
  assert.doesNotMatch(said, /catalog_management/);
  // Meta's own words survive, so the reason can still be looked up.
  assert.match(said, /SMB business type/);
});

test("hasDetailHelp answers for the caller that needs to know", () => {
  assert.equal(
    hasDetailHelp({ error: { code: 10, message: "(#10) ... SMB business type" } }),
    true
  );
  assert.equal(hasDetailHelp({ error: { code: 10, message: "(#10) Something else" } }), false);
  assert.equal(hasDetailHelp(null), false);
});

test("an ordinary permission refusal still gets the permission text", () => {
  const said = describeMetaError(400, {
    error: { message: "(#10) Application does not have permission", code: 10 },
  });
  assert.match(said, /permission/i);
  assert.doesNotMatch(said, /WhatsApp Business app/);
});
