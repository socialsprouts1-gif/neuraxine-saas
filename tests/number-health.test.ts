import test from "node:test";
import assert from "node:assert/strict";
import {
  healthChecks,
  worstTone,
  headline,
  type NumberFacts,
} from "../src/lib/number-health.ts";

const healthy: NumberFacts = {
  wabaId: "1662708401531431",
  phoneNumberId: "998877665544332",
  numberOnWaba: true,
  wabaNumbers: ["+91 74477 39348"],
  businessVerification: "verified",
  accountReview: "APPROVED",
  qualityRating: "GREEN",
  platformType: "CLOUD_API",
  numberStatus: "CONNECTED",
  wabaName: "Neurachat",
  ownershipType: "CLIENT_OWNED",
  canManageTemplates: true,
  connectionAppId: "999813322854160",
  deploymentAppId: "999813322854160",
};

const find = (facts: NumberFacts, label: string) =>
  healthChecks(facts).find((check) => check.label === label)!;

test("a healthy account comes back clean", () => {
  const checks = healthChecks(healthy);
  assert.equal(worstTone(checks), "ok");
  assert.ok(checks.every((check) => check.tone === "ok"));
});

test("a clean result says to look at the message, not the account", () => {
  const line = headline(healthChecks(healthy));
  assert.match(line, /no problem/i);
  assert.match(line, /failed recipients/i);
});

test("a clean result names the one gate no Graph call can see", () => {
  // Everything else being clear is exactly when Advanced Access is worth
  // raising: Standard only reaches assets connected to your own app, and a
  // CLIENT_OWNED account belongs to someone else's business.
  const line = headline(healthChecks(healthy));
  assert.match(line, /Advanced Access/);
  assert.match(line, /whatsapp_business_management/);
});

// --- the one this exists for -----------------------------------------------

test("a number that is not on the configured account is the first check and is fatal", () => {
  const checks = healthChecks({
    ...healthy,
    numberOnWaba: false,
    wabaNumbers: ["+91 90000 11111", "+91 90000 22222"],
  });

  assert.equal(checks[0].label, "Number is on this account");
  assert.equal(checks[0].tone, "bad");
  // Names what the account does hold, so the right one can be found.
  assert.match(checks[0].detail, /\+91 90000 11111, \+91 90000 22222/);
});

test("an empty account says so rather than printing an empty list", () => {
  const check = find({ ...healthy, numberOnWaba: false, wabaNumbers: [] }, "Number is on this account");
  assert.match(check.detail, /no numbers at all/);
});

test("verification is reported for THIS account, not the portfolio", () => {
  const check = find({ ...healthy, businessVerification: "not_verified" }, "Business verification");
  assert.equal(check.tone, "bad");
  assert.match(check.detail, /THIS account/);
  assert.match(check.detail, /does not carry over/);
});

test("verification pending is a warning, not a failure", () => {
  assert.equal(find({ ...healthy, businessVerification: "pending" }, "Business verification").tone, "warn");
});

test("Meta's casing does not change the verdict", () => {
  assert.equal(find({ ...healthy, businessVerification: "VERIFIED" }, "Business verification").tone, "ok");
  assert.equal(find({ ...healthy, accountReview: "approved" }, "Account review").tone, "ok");
  assert.equal(find({ ...healthy, platformType: "cloud_api" }, "Platform").tone, "ok");
});

test("a field Meta did not return is unknown, never a failure", () => {
  for (const facts of [
    { ...healthy, businessVerification: null },
    { ...healthy, accountReview: undefined },
    { ...healthy, numberStatus: "" },
    { ...healthy, platformType: null },
  ]) {
    assert.equal(worstTone(healthChecks(facts)), "unknown", JSON.stringify(facts));
  }
});

test("an unrated number is not painted red", () => {
  assert.equal(find({ ...healthy, qualityRating: "UNKNOWN" }, "Quality rating").tone, "unknown");
  assert.equal(find({ ...healthy, qualityRating: null }, "Quality rating").tone, "unknown");
});

test("a number still on the WhatsApp Business app is called out", () => {
  const check = find({ ...healthy, platformType: "NOT_APPLICABLE" }, "Platform");
  assert.equal(check.tone, "bad");
  assert.match(check.detail, /Cloud API/);
});

test("red quality and yellow quality are told apart", () => {
  assert.equal(find({ ...healthy, qualityRating: "YELLOW" }, "Quality rating").tone, "warn");
  assert.equal(find({ ...healthy, qualityRating: "RED" }, "Quality rating").tone, "bad");
});

test("a flagged number blocks, a pending one warns", () => {
  assert.equal(find({ ...healthy, numberStatus: "FLAGGED" }, "Number status").tone, "bad");
  assert.equal(find({ ...healthy, numberStatus: "PENDING" }, "Number status").tone, "warn");
});

// --- the summary line ------------------------------------------------------

test("the headline counts the blocking problems", () => {
  const one = headline(healthChecks({ ...healthy, accountReview: "REJECTED" }));
  assert.match(one, /^1 thing here will stop/);

  const two = headline(
    healthChecks({ ...healthy, accountReview: "REJECTED", numberStatus: "RESTRICTED" })
  );
  assert.match(two, /^2 things here will stop/);
});

test("warnings alone do not claim anything is blocked", () => {
  const line = headline(healthChecks({ ...healthy, qualityRating: "YELLOW" }));
  assert.match(line, /Nothing is blocked outright/);
  assert.match(line, /1 thing needs attention/);
});

test("worstTone ranks bad over warn over unknown", () => {
  assert.equal(worstTone([{ label: "a", tone: "warn", detail: "" }, { label: "b", tone: "bad", detail: "" }]), "bad");
  assert.equal(worstTone([{ label: "a", tone: "unknown", detail: "" }, { label: "b", tone: "warn", detail: "" }]), "warn");
  assert.equal(worstTone([{ label: "a", tone: "ok", detail: "" }]), "ok");
});

// --- which account this is -------------------------------------------------

test("the account's name and kind are reported, never judged", () => {
  const check = find({ ...healthy, wabaName: "Neurachat", ownershipType: "CLIENT_OWNED" }, "Which account this is");
  assert.equal(check.tone, "ok");
  assert.match(check.detail, /Neurachat/);
  assert.match(check.detail, /CLIENT_OWNED/);
});

test("an unfamiliar ownership type is passed through rather than called a fault", () => {
  // Meta's enum here is not stable enough to branch on. Anything it says
  // is reported as-is; guessing which values are fatal is how an error
  // message ends up confidently wrong.
  const check = find({ ...healthy, wabaName: "X", ownershipType: "SOMETHING_NEW" }, "Which account this is");
  assert.equal(check.tone, "ok");
  assert.match(check.detail, /SOMETHING_NEW/);
});

test("an account Meta would not name is unknown, not a failure", () => {
  const facts = { ...healthy, wabaName: null, ownershipType: null };
  assert.equal(find(facts, "Which account this is").tone, "unknown");
  assert.equal(worstTone(healthChecks(facts)), "unknown");
});

test("the identity line explains why a template is not on every number", () => {
  const check = find({ ...healthy, wabaName: "Neurachat" }, "Which account this is");
  assert.match(check.detail, /Templates belong to an account/);
});

// --- templates -------------------------------------------------------------

test("a token that can read templates is reported as able to create them", () => {
  const check = find(healthy, "Templates");
  assert.equal(check.tone, "ok");
  assert.match(check.detail, /same permission/);
});

test("a token refused template management is a blocking problem", () => {
  const check = find(
    { ...healthy, canManageTemplates: false, manageProblem: "Meta said no." },
    "Templates"
  );
  assert.equal(check.tone, "bad");
  assert.equal(check.detail, "Meta said no.");
});

test("a refusal with no reason still explains the shape of the problem", () => {
  const check = find({ ...healthy, canManageTemplates: false }, "Templates");
  assert.equal(check.tone, "bad");
  assert.match(check.detail, /separate permissions/);
});

test("a probe that could not run is unknown, not a pass", () => {
  // The whole point: a check that did not happen must never read as one
  // that happened and succeeded.
  const check = find({ ...healthy, canManageTemplates: null }, "Templates");
  assert.equal(check.tone, "unknown");
  assert.equal(worstTone(healthChecks({ ...healthy, canManageTemplates: null })), "unknown");
});

test("a template refusal makes the headline name a blocking problem", () => {
  const line = headline(healthChecks({ ...healthy, canManageTemplates: false }));
  assert.match(line, /^1 thing here will stop/);
});

// --- which Meta app issued the token ---------------------------------------

test("a token from the deployment's own app is reported as matching", () => {
  const check = find(healthy, "Which Meta app");
  assert.equal(check.tone, "ok");
  assert.match(check.detail, /999813322854160/);
});

test("a token from another app is flagged, because approvals are per app", () => {
  const check = find({ ...healthy, connectionAppId: "111111111111111" }, "Which Meta app");
  assert.equal(check.tone, "warn");
  assert.match(check.detail, /111111111111111/);
  assert.match(check.detail, /999813322854160/);
  assert.match(check.detail, /approves a permission for one app/);
});

test("a mismatch warns rather than failing — it is not automatically a fault", () => {
  // A deployment may legitimately hold connections made through another
  // app. Calling that broken would be asserting a cause again.
  const checks = healthChecks({ ...healthy, connectionAppId: "111111111111111" });
  assert.equal(worstTone(checks), "warn");
});

test("nothing to compare against is unknown, not a pass", () => {
  assert.equal(find({ ...healthy, deploymentAppId: null }, "Which Meta app").tone, "unknown");
  assert.equal(find({ ...healthy, connectionAppId: null }, "Which Meta app").tone, "unknown");
});
