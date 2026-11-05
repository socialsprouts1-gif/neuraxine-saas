import { test } from "node:test";
import assert from "node:assert/strict";
import { optOutConfirmation, readOptIntent } from "../src/lib/opt-out.ts";

test("the plain word is honoured", () => {
  for (const text of ["stop", "STOP", "  Stop  ", "unsubscribe", "opt out", "remove me"]) {
    assert.equal(readOptIntent(text), "stop", text);
  }
});

test("punctuation and emoji do not hide an opt-out", () => {
  // Someone who has to guess the punctuation has not been given a way out.
  for (const text of ["STOP.", "stop!", "stop 🙏", "*stop*", "“stop”"]) {
    assert.equal(readOptIntent(text), "stop", text);
  }
});

test("Hinglish and Hindi are read too", () => {
  for (const text of ["band karo", "BAND KAR DO", "rok do", "बंद करो", "mat bhejo"]) {
    assert.equal(readOptIntent(text), "stop", text);
  }
});

test("opting back in is understood", () => {
  for (const text of ["start", "resume", "subscribe", "unstop", "chalu karo"]) {
    assert.equal(readOptIntent(text), "start", text);
  }
});

test("a sentence containing the word is not an opt-out", () => {
  // The expensive mistake: silently removing a paying customer for saying
  // something ordinary, with nothing on screen explaining it.
  for (const text of [
    "please don't stop the delivery",
    "stop by on Tuesday",
    "can you stop the order",
    "I want to start my order",
    "when does the sale start",
  ]) {
    assert.equal(readOptIntent(text), null, text);
  }
});

test("yes is never an opt-in", () => {
  // It is the most common reply in the inbox and means whatever the last
  // question was.
  assert.equal(readOptIntent("yes"), null);
  assert.equal(readOptIntent("ok"), null);
});

test("words a shop hears every day are not opt-outs", () => {
  // These are on the SMS carrier list and all three are ordinary things
  // to say to a business that takes orders.
  for (const text of ["cancel", "end", "quit"]) {
    assert.equal(readOptIntent(text), null, text);
  }
});

test("nothing at all is not an intent", () => {
  assert.equal(readOptIntent(""), null);
  assert.equal(readOptIntent("   "), null);
  assert.equal(readOptIntent(null), null);
  assert.equal(readOptIntent(undefined), null);
  assert.equal(readOptIntent("🙏"), null);
});

test("the confirmation names the business and the way back", () => {
  const stopped = optOutConfirmation("stop", "Neurachat");
  assert.match(stopped, /Neurachat/);
  assert.match(stopped, /START/);

  const started = optOutConfirmation("start", "Neurachat");
  assert.match(started, /STOP/);
});

test("a business with no name still gets a sentence that reads", () => {
  assert.match(optOutConfirmation("stop", "  "), /this business/);
});
