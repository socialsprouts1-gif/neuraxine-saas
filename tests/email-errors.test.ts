import test from "node:test";
import assert from "node:assert/strict";
import { explainEmailFailure, isFailure } from "../src/lib/email-errors.ts";

test("nothing to explain when there is no error", () => {
  assert.equal(explainEmailFailure(null), null);
  assert.equal(explainEmailFailure(undefined), null);
  assert.equal(explainEmailFailure(""), null);
  assert.equal(explainEmailFailure("   "), null);
});

test("the unverified-domain refusal is named, because it is the common one", () => {
  // Resend's real body for an account with no verified domain.
  const body =
    '403 {"statusCode":403,"message":"You can only send testing emails to your own email address (owner@gmail.com). To send to other recipients, please verify a domain at resend.com/domains"}';
  const explained = explainEmailFailure(body);
  assert.ok(explained);
  assert.match(explained.summary, /not verified/i);
  assert.match(explained.fix, /resend\.com\/domains/);
});

test("a test email arriving is explained as proving little", () => {
  const explained = explainEmailFailure("domain is not verified");
  assert.ok(explained);
  assert.match(explained.fix, /test email arrives and a real signup does not/i);
});

test("a bad API key is told apart from a bad domain", () => {
  const explained = explainEmailFailure('401 {"message":"API key is invalid"}');
  assert.ok(explained);
  assert.match(explained.summary, /API key/i);
  assert.match(explained.fix, /redeploy/i);
});

test("Gmail's app-password refusal says it needs an App Password", () => {
  const explained = explainEmailFailure(
    "Invalid login: 535-5.7.8 Username and Password not accepted"
  );
  assert.ok(explained);
  assert.match(explained.fix, /App Password/);
});

test("an unreachable server explains the two TLS ports", () => {
  const explained = explainEmailFailure("connect ETIMEDOUT 74.125.24.108:465");
  assert.ok(explained);
  assert.match(explained.fix, /465/);
  assert.match(explained.fix, /587/);
});

test("rate limiting says nothing is lost", () => {
  const explained = explainEmailFailure("429 Too Many Requests");
  assert.ok(explained);
  assert.match(explained.fix, /sent again/i);
});

test("an unrecognised error is left alone rather than guessed at", () => {
  // Inventing an explanation for an error nobody has seen is how a wrong
  // fix gets followed confidently. The raw text is shown instead.
  assert.equal(explainEmailFailure("something nobody has seen before"), null);
});

test("only a failed row counts as a failure", () => {
  assert.equal(isFailure("failed"), true);
  assert.equal(isFailure("sent"), false);
  assert.equal(isFailure("sending"), false);
});
