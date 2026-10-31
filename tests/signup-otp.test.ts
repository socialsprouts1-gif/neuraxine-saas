import test from "node:test";
import assert from "node:assert/strict";
import {
  CODE_LENGTH,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_NUMBER,
  RESEND_COOLDOWN_SECONDS,
  canSendCode,
  canUseVerification,
  expiryFrom,
  maskedNumber,
  normaliseCode,
  otpComponents,
  type OtpRow,
} from "../src/lib/signup-otp.ts";
import {
  checkCode,
  codeMatches,
  generateCode,
  hashCode,
  newVerificationToken,
  normaliseVerificationToken,
} from "../src/lib/signup-otp-code.ts";
import { otpButtonIndex } from "../src/lib/template-unpack.ts";
import { signupCodeEmail } from "../src/lib/email-templates.ts";
import { isMarketing, suppressible } from "../src/lib/email-kinds.ts";
import { variableCount } from "../src/lib/template-variables.ts";

const BRAND = {
  name: "Neura Chat",
  appUrl: "https://neurachat.in",
  supportEmail: "support@neurachat.in",
  logoUrl: null,
  unsubscribeUrl: null,
};

const SECRET = "a-test-secret";
const NOW = new Date("2026-10-03T12:00:00.000Z");

function row(over: Partial<OtpRow> = {}): OtpRow {
  return {
    wa_id: "918237982569",
    code_hash: hashCode("918237982569", "123456", SECRET),
    expires_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    attempts: 0,
    sends: 1,
    last_sent_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    window_started_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    verified_at: null,
    verification_token: null,
    consumed_at: null,
    ...over,
  };
}

// --- the code itself -------------------------------------------------------

test("a code is six digits, zero-padded", () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateCode();
    assert.match(code, /^\d{6}$/);
    assert.equal(code.length, CODE_LENGTH);
  }
});

test("the code is never what gets stored", () => {
  const hash = hashCode("918237982569", "123456", SECRET);
  assert.doesNotMatch(hash, /123456/);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("the same code hashes differently for a different number", () => {
  // Otherwise a hash lifted from one row would verify against another.
  assert.notEqual(
    hashCode("918237982569", "123456", SECRET),
    hashCode("918767512569", "123456", SECRET)
  );
});

test("the same code hashes differently under a different secret", () => {
  assert.notEqual(
    hashCode("918237982569", "123456", SECRET),
    hashCode("918237982569", "123456", "another")
  );
});

test("a code matches its own hash and nothing else", () => {
  const stored = hashCode("918237982569", "123456", SECRET);
  assert.equal(codeMatches(stored, "918237982569", "123456", SECRET), true);
  assert.equal(codeMatches(stored, "918237982569", "123457", SECRET), false);
  assert.equal(codeMatches(stored, "918767512569", "123456", SECRET), false);
  assert.equal(codeMatches(stored, "918237982569", "123456", "wrong-secret"), false);
});

test("a stored hash of the wrong shape is refused, not crashed on", () => {
  // A truncated or empty column must come back false rather than throw out
  // of timingSafeEqual, which rejects buffers of different lengths.
  for (const stored of ["", "   ", "abc", "0".repeat(63)]) {
    assert.equal(codeMatches(stored, "918237982569", "123456", SECRET), false, stored);
  }
});

test("what people paste is read as a code", () => {
  assert.equal(normaliseCode("123 456"), "123456");
  assert.equal(normaliseCode("123-456"), "123456");
  assert.equal(normaliseCode("  123456  "), "123456");
  // Autofill pastes the sentence the code was in.
  assert.equal(normaliseCode("Your code is 123456"), "123456");
});

test("anything that is not six digits is not a code", () => {
  for (const bad of ["", "12345", "1234567", "abcdef", "12 34"]) {
    assert.equal(normaliseCode(bad), null, bad);
  }
});

test("a verification token is 32 hex characters", () => {
  const token = newVerificationToken();
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.equal(normaliseVerificationToken(token), token);
  assert.equal(normaliseVerificationToken(token.toUpperCase()), token);
});

test("anything else is not a verification token", () => {
  for (const bad of ["", "short", "g".repeat(32), `${"a".repeat(32)}x`]) {
    assert.equal(normaliseVerificationToken(bad), null, bad);
  }
});

// --- when a code can be sent -----------------------------------------------

test("a number nobody has asked about can be sent a code", () => {
  const verdict = canSendCode(null, NOW);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.ok && verdict.resetWindow, true);
});

test("a code just sent means waiting, and the refusal says how long", () => {
  const verdict = canSendCode(row({ last_sent_at: new Date(NOW.getTime() - 10_000).toISOString() }), NOW);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.retryAfterSeconds, RESEND_COOLDOWN_SECONDS - 10);
  // "Try again later" with no number in it is what makes somebody press the
  // button eleven more times.
  assert.match(verdict.ok === false ? verdict.reason : "", /50 seconds/);
});

test("once the cooldown is up, another code can go", () => {
  const verdict = canSendCode(
    row({ last_sent_at: new Date(NOW.getTime() - RESEND_COOLDOWN_SECONDS * 1000).toISOString() }),
    NOW
  );
  assert.equal(verdict.ok, true);
});

test("a number that has had its day's codes is refused", () => {
  const verdict = canSendCode(row({ sends: MAX_SENDS_PER_NUMBER }), NOW);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /today/);
});

test("the day's tally is a rolling window, not a midnight reset", () => {
  // Counted from the first code, so somebody starting at 11pm does not get
  // twice as many.
  const verdict = canSendCode(
    row({
      sends: MAX_SENDS_PER_NUMBER,
      window_started_at: new Date(NOW.getTime() - 25 * 3_600_000).toISOString(),
      last_sent_at: new Date(NOW.getTime() - 25 * 3_600_000).toISOString(),
    }),
    NOW
  );
  assert.equal(verdict.ok, true);
  assert.equal(verdict.ok && verdict.resetWindow, true);
});

test("a row with unreadable dates is not a free pass", () => {
  // A junk timestamp must not read as "the window is over, send away".
  const verdict = canSendCode(
    row({ sends: MAX_SENDS_PER_NUMBER, window_started_at: null, last_sent_at: null }),
    NOW
  );
  assert.equal(verdict.ok, true);
  assert.equal(verdict.ok && verdict.resetWindow, true);
});

// --- checking what was typed ----------------------------------------------

test("the right code is accepted", () => {
  assert.deepEqual(checkCode(row(), "123456", SECRET, NOW), { ok: true });
});

test("spaces in a pasted code do not make it wrong", () => {
  assert.deepEqual(checkCode(row(), "123 456", SECRET, NOW), { ok: true });
});

test("a wrong code is refused without saying how many guesses are left", () => {
  const verdict = checkCode(row(), "999999", SECRET, NOW);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.exhausted, undefined);
  // The number of guesses left is useful to somebody guessing and nobody else.
  assert.doesNotMatch(verdict.ok === false ? verdict.reason : "", /\d/);
});

test("an expired code says so, rather than just 'wrong'", () => {
  // Retyping the same expired digits four times is what a single "invalid
  // code" message gets you.
  const verdict = checkCode(
    row({ expires_at: new Date(NOW.getTime() - 1000).toISOString() }),
    "123456",
    SECRET,
    NOW
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.exhausted, true);
  assert.match(verdict.ok === false ? verdict.reason : "", /expired/);
});

test("a million guesses are not available", () => {
  const verdict = checkCode(row({ attempts: MAX_ATTEMPTS }), "123456", SECRET, NOW);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.exhausted, true);
});

test("a code already used to make an account cannot be used again", () => {
  const verdict = checkCode(row({ consumed_at: NOW.toISOString() }), "123456", SECRET, NOW);
  assert.equal(verdict.ok, false);
});

test("an unreadable expiry is treated as expired, not as forever", () => {
  const verdict = checkCode(row({ expires_at: "not a date" }), "123456", SECRET, NOW);
  assert.equal(verdict.ok, false);
});

test("a code sent now expires, and not immediately", () => {
  const expires = Date.parse(expiryFrom(NOW));
  assert.ok(expires > NOW.getTime());
  assert.ok(expires - NOW.getTime() <= 15 * 60_000);
});

// --- turning a verified number into an account -----------------------------

test("a freshly verified number can be turned into an account", () => {
  assert.deepEqual(
    canUseVerification({ verified_at: NOW.toISOString(), consumed_at: null }, NOW),
    { ok: true }
  );
});

test("a number that was never verified cannot", () => {
  const verdict = canUseVerification({ verified_at: null, consumed_at: null }, NOW);
  assert.equal(verdict.ok, false);
});

test("a verification that has been sitting around is asked for again", () => {
  const verdict = canUseVerification(
    { verified_at: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(), consumed_at: null },
    NOW
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.exhausted, true);
});

test("one verification makes one account", () => {
  // The whole reason it is spent by a conditional update: two tabs must not
  // both turn one verified number into a workspace.
  const verdict = canUseVerification(
    { verified_at: NOW.toISOString(), consumed_at: NOW.toISOString() },
    NOW
  );
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /Sign in/);
});

// --- what goes to Meta -----------------------------------------------------

test("a code-only template is sent just its body", () => {
  assert.deepEqual(otpComponents("123456", null), [
    { type: "body", parameters: [{ type: "text", text: "123456" }] },
  ]);
});

test("a copy-code button is sent the code a second time", () => {
  // The one shape in the API where the same value goes in twice. Leaving the
  // button off a template that has one is refused exactly as hard as sending
  // one to a template that has none.
  assert.deepEqual(otpComponents("123456", 0), [
    { type: "body", parameters: [{ type: "text", text: "123456" }] },
    { type: "button", sub_type: "url", index: 0, parameters: [{ type: "text", text: "123456" }] },
  ]);
});

test("the button's position is read out of what Meta returned", () => {
  assert.equal(
    otpButtonIndex([
      { type: "BODY", text: "{{1}} is your code." },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }] },
    ]),
    0
  );
});

test("a copy-code button that is not the first is found at its own index", () => {
  assert.equal(
    otpButtonIndex([
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Open" }, { type: "OTP" }] },
    ]),
    1
  );
});

test("a template with no copy-code button says so, which is a complete answer", () => {
  // A code-only authentication template is perfectly valid and is sent with
  // just its body.
  assert.equal(otpButtonIndex([{ type: "BODY", text: "{{1}}" }]), null);
  assert.equal(otpButtonIndex([{ type: "BUTTONS", buttons: [{ type: "URL" }] }]), null);
});

test("junk where the components should be is null, not a crash", () => {
  for (const junk of [null, undefined, "", 0, {}, [null], [{ type: "BUTTONS" }]]) {
    assert.equal(otpButtonIndex(junk), null, JSON.stringify(junk));
  }
});

// --- what is shown back ----------------------------------------------------

test("the number shown back is enough to spot a typo and no more", () => {
  const masked = maskedNumber("918237982569");
  assert.match(masked, /569$/);
  assert.doesNotMatch(masked, /8237/);
  assert.match(masked, /^\+91/);
});

test("masking something too short to mask does not invent digits", () => {
  assert.equal(maskedNumber("12"), "12");
  assert.equal(maskedNumber(""), "");
});

// --- the code by email, when WhatsApp cannot take it -----------------------

test("the code email carries the code", () => {
  const body = signupCodeEmail(BRAND, { code: "123456", minutes: 10 });
  assert.match(body.subject, /123456/);
  assert.match(body.html, /123456/);
  assert.match(body.text, /123456/);
});

test("the code email sends nobody anywhere but our own site", () => {
  // A verification message with a button to click is the exact shape of a
  // phishing mail, and teaching customers that ours carry one is a habit
  // somebody else will use later. The footer's own links are all that is
  // left, and this fails the moment an action button is added.
  const body = signupCodeEmail(BRAND, { code: "123456", minutes: 10 });
  const hrefs = [...body.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(
      href.startsWith("mailto:") || href === BRAND.appUrl,
      `${href} is not our own site`
    );
  }
  assert.doesNotMatch(body.text, /https?:\/\//);
});

test("the code email says when it stops working", () => {
  const body = signupCodeEmail(BRAND, { code: "123456", minutes: 10 });
  assert.match(body.text, /10 minutes/);
});

test("a sign-up code is never treated as marketing", () => {
  // An unsubscribe link on the one message somebody is actively waiting
  // for would be absurd, and a code that can be suppressed is a person who
  // cannot create an account.
  assert.equal(isMarketing("signup_code"), false);
  assert.equal(suppressible("signup_code"), false);
});

// --- the shape a code template has to have ---------------------------------

test("a code template declares exactly one variable", () => {
  // The obvious thing to write — "Hi {{1}}, your code is {{2}}" — declares
  // two, and Meta refuses it with 132000 for every customer. Both the admin
  // screen and the sender count it, so this is the rule they share.
  assert.equal(variableCount("Your sign-up code is {{1}}. It expires in 10 minutes."), 1);
  assert.equal(variableCount("Hi {{1}}, your code is {{2}}."), 2);
  assert.equal(variableCount("Your code is on its way."), 0);
});

test("a named variable counts too, so a NAMED template is not read as empty", () => {
  assert.equal(variableCount("Your code is {{code}}."), 1);
});
