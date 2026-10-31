import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  authoriseUrl,
  buttonProblem,
  credentialProblem,
  emailIn,
  isSendableUrl,
  linkId,
  mentions,
  parseDirectMessage,
  withinMessagingWindow,
  redirectUri,
  ruleFor,
  ruleProblem,
  SCOPES,
  withinReplyWindow,
  type CommentRule,
} from "../src/lib/instagram.ts";

function rule(overrides: Partial<CommentRule> & { id: string; name: string }): CommentRule {
  return {
    keywords: [],
    mediaId: null,
    dmMessage: "Here you go!",
    publicReply: null,
    isActive: true,
    ...overrides,
  };
}

test("the consent screen asks for exactly the three scopes", () => {
  const url = authoriseUrl({ instagramAppId: "123", redirectUri: "https://x.in/cb", state: "s" });
  for (const scope of SCOPES) assert.ok(url.includes(scope), `missing ${scope}`);
  assert.ok(url.startsWith("https://www.instagram.com/oauth/authorize?"));
  assert.ok(url.includes("response_type=code"));
});

test("the redirect URI has no double slash, whatever the app url ends with", () => {
  // Meta compares the whole string, so one stray slash is a refused login.
  assert.equal(redirectUri("https://neurachat.in"), "https://neurachat.in/api/instagram/connect/callback");
  assert.equal(redirectUri("https://neurachat.in/"), "https://neurachat.in/api/instagram/connect/callback");
});

test("a keyword matches on a word boundary, not as a substring", () => {
  // The thing that makes a comment bot embarrassing: "hi" firing on
  // "this", "shipping" and "Chicago".
  assert.equal(mentions("hi there", "hi"), true);
  assert.equal(mentions("is this shipping to Chicago", "hi"), false);
  assert.equal(mentions("Send me the PRICE please", "price"), true);
});

test("a keyword with punctuation in it cannot break the pattern", () => {
  assert.equal(mentions("do you have 20% off", "20% off"), true);
  assert.equal(mentions("nothing here", "20% off"), false);
  // A keyword that is pure punctuation would match everything.
  assert.equal(mentions("anything", "   "), false);
});

test("a rule pinned to a post beats a catch-all", () => {
  const picked = ruleFor(
    { id: "c1", mediaId: "post-9", text: "price please" },
    [
      rule({ id: "any", name: "Everything", keywords: ["price"] }),
      rule({ id: "pinned", name: "This post", keywords: ["price"], mediaId: "post-9" }),
    ]
  );
  assert.equal(picked?.id, "pinned");
});

test("a named keyword beats a rule that answers every comment", () => {
  const picked = ruleFor({ id: "c1", mediaId: "p1", text: "price?" }, [
    rule({ id: "all", name: "DM everybody", keywords: [] }),
    rule({ id: "kw", name: "Price asks", keywords: ["price"] }),
  ]);
  assert.equal(picked?.id, "kw");
});

test("an empty keyword list really does mean every comment", () => {
  // A real campaign, not an unfinished rule.
  const picked = ruleFor({ id: "c1", mediaId: "p1", text: "🔥🔥" }, [
    rule({ id: "all", name: "DM everybody", keywords: [] }),
  ]);
  assert.equal(picked?.id, "all");
});

test("a rule pinned to another post does not fire", () => {
  const picked = ruleFor({ id: "c1", mediaId: "post-1", text: "price" }, [
    rule({ id: "other", name: "Other post", keywords: ["price"], mediaId: "post-2" }),
  ]);
  assert.equal(picked, null);
});

test("a switched-off rule never fires", () => {
  const picked = ruleFor({ id: "c1", mediaId: "p1", text: "price" }, [
    rule({ id: "off", name: "Paused", keywords: ["price"], isActive: false }),
  ]);
  assert.equal(picked, null);
});

test("a rule that does nothing is refused before it can be saved", () => {
  assert.match(ruleProblem({ name: "Empty", dmMessage: "", publicReply: "" }) ?? "", /does nothing/);
  assert.match(ruleProblem({ name: "", dmMessage: "hi" }) ?? "", /name/);
  assert.equal(ruleProblem({ name: "Fine", dmMessage: "hi" }), null);
  assert.equal(ruleProblem({ name: "Fine", publicReply: "thanks!" }), null);
});

test("a DM over Instagram's limit is caught here, not by Meta", () => {
  assert.match(ruleProblem({ name: "Long", dmMessage: "x".repeat(1200) }) ?? "", /1000 characters/);
});

test("the private reply window is seven days, and the future is not in it", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  assert.equal(withinReplyWindow("2026-10-29T12:00:00Z", now), true);
  assert.equal(withinReplyWindow("2026-10-23T13:00:00Z", now), true);
  assert.equal(withinReplyWindow("2026-10-22T12:00:00Z", now), false);
  assert.equal(withinReplyWindow("2026-11-01T12:00:00Z", now), false);
  assert.equal(withinReplyWindow("not a date", now), false);
});

// --- the credentials -------------------------------------------------
//
// These exist because of a real afternoon lost to them: the whole block
// was pasted into Vercel's value box, so the id became
// "INSTAGRAM_APP_ID        = 1480246337381870\nINSTAGRAM_APP_SECRET..."
// and went into a query string on instagram.com — taking the secret
// with it, into browser history and two sets of server logs. Instagram
// answered "Page isn't available", which reads as a broken integration
// rather than a mistyped setting.

test("a plain id and secret are accepted", () => {
  assert.equal(credentialProblem("1480246337381870", "abc123def456"), null);
});

test("a whole pasted block is refused, and says the secret is in it", () => {
  const pasted = "INSTAGRAM_APP_ID        = 1480246337381870\nINSTAGRAM_APP_SECRET = s3cr3t";
  const problem = credentialProblem(pasted, "s3cr3t");
  assert.ok(problem, "the block should be refused");
  assert.match(problem, /resetting in Meta/);
});

test("an id with the name and equals sign is refused", () => {
  assert.ok(credentialProblem("INSTAGRAM_APP_ID = 1480246337381870", "s3cr3t"));
});

test("a missing id is named before anything else", () => {
  assert.match(credentialProblem("", "")!, /INSTAGRAM_APP_ID is not set/);
});

test("a missing secret is named once the id is good", () => {
  assert.match(credentialProblem("1480246337381870", "")!, /INSTAGRAM_APP_SECRET is not set/);
});

test("a secret with whitespace in it is refused", () => {
  assert.ok(credentialProblem("1480246337381870", "INSTAGRAM_APP_SECRET = s3cr3t"));
});

test("a bad id never reaches the authorise url", () => {
  // The guard is the only thing between a pasted block and a secret in
  // somebody's browser history, so this asserts the order: refuse
  // first, build the url second.
  const pasted = "INSTAGRAM_APP_ID = 1480246337381870\nINSTAGRAM_APP_SECRET = s3cr3t";
  assert.ok(credentialProblem(pasted, "s3cr3t"));

  const url = authoriseUrl({
    instagramAppId: pasted,
    redirectUri: redirectUri("https://neurachat.in"),
    state: "state",
  });
  assert.ok(url.includes("s3cr3t"), "without the guard the secret lands in the url");
});

// --- direct messages -------------------------------------------------

const HOUR = 60 * 60 * 1000;

function messaging(items: Record<string, unknown>[]) {
  return { time: 1_767_000_000, messaging: items };
}

function dm(overrides: Record<string, unknown> = {}) {
  return {
    sender: { id: "customer" },
    recipient: { id: "business" },
    timestamp: 1_767_000_000_000,
    message: { mid: "m1", text: "what is the price?" },
    ...overrides,
  };
}

test("a plain direct message is read", () => {
  const [parsed] = parseDirectMessage(messaging([dm()]));
  assert.equal(parsed.messageId, "m1");
  assert.equal(parsed.fromId, "customer");
  assert.equal(parsed.toId, "business");
  assert.equal(parsed.text, "what is the price?");
});

test("an echo of the business's own message is dropped", () => {
  // Instagram sends back everything the business itself sends, in the
  // same shape, marked only by is_echo. Reading one as inbound makes the
  // bot answer itself and then answer that answer.
  const parsed = parseDirectMessage(
    messaging([dm({ message: { mid: "m2", text: "Here you go!", is_echo: true } })])
  );
  assert.deepEqual(parsed, []);
});

test("a deleted message is dropped", () => {
  const parsed = parseDirectMessage(
    messaging([dm({ message: { mid: "m3", text: "oops", is_deleted: true } })])
  );
  assert.deepEqual(parsed, []);
});

test("a sticker or reaction with no text is dropped", () => {
  // Nothing for a keyword matcher to work with, and answering a story
  // reaction with a chatbot menu reads as broken.
  const parsed = parseDirectMessage(messaging([dm({ message: { mid: "m4" } })]));
  assert.deepEqual(parsed, []);
});

test("whitespace-only text counts as no text", () => {
  const parsed = parseDirectMessage(messaging([dm({ message: { mid: "m5", text: "   " } })]));
  assert.deepEqual(parsed, []);
});

test("several messages in one delivery are all read", () => {
  const parsed = parseDirectMessage(
    messaging([
      dm({ message: { mid: "a", text: "hello" } }),
      dm({ message: { mid: "b", text: "are you open?" } }),
    ])
  );
  assert.deepEqual(parsed.map((item) => item.messageId), ["a", "b"]);
});

test("seconds and milliseconds both become a sane timestamp", () => {
  // Meta sends seconds on the entry and milliseconds on the message, and
  // reading one as the other puts the message in 1970 or the year 57000.
  const [inSeconds] = parseDirectMessage({ time: 1_767_000_000, messaging: [dm({ timestamp: undefined })] });
  const [inMillis] = parseDirectMessage(messaging([dm()]));
  assert.equal(inSeconds.at, inMillis.at);
  assert.equal(new Date(inMillis.at!).getUTCFullYear(), 2025);
});

test("the messaging window is open for 24 hours after the last message", () => {
  const now = Date.now();
  assert.equal(withinMessagingWindow(new Date(now - HOUR).toISOString(), now), true);
  assert.equal(withinMessagingWindow(new Date(now - 23.9 * HOUR).toISOString(), now), true);
  assert.equal(withinMessagingWindow(new Date(now - 25 * HOUR).toISOString(), now), false);
});

test("a contact who has never written has no open window", () => {
  // There is no template fallback on Instagram as there is on WhatsApp,
  // so "never" has to mean no, not "send and let Meta refuse it".
  assert.equal(withinMessagingWindow(null), false);
  assert.equal(withinMessagingWindow("not a date"), false);
});

// --- buttons ---------------------------------------------------------

test("three buttons are fine and four are not", () => {
  const ok = [
    { label: "Price list", url: "https://neurachat.in/pricing" },
    { label: "Book a call", url: "https://neurachat.in/book" },
    { label: "WhatsApp us", url: "https://wa.me/919999999999" },
  ];
  assert.equal(buttonProblem(ok), null);
  assert.match(buttonProblem([...ok, { label: "One more", url: "https://a.com" }])!, /Remove 1/);
});

test("a button label over 20 characters is refused, not trimmed", () => {
  // Instagram refuses the whole message rather than shortening the
  // label, so the automation looks like it never fired.
  const problem = buttonProblem([
    { label: "Click here for the full price list", url: "https://neurachat.in" },
  ]);
  assert.match(problem!, /20/);
});

test("a button needs a real web address", () => {
  assert.ok(buttonProblem([{ label: "Email us", url: "mailto:hi@neurachat.in" }]));
  assert.ok(buttonProblem([{ label: "Call", url: "tel:+919999999999" }]));
  assert.ok(buttonProblem([{ label: "Site", url: "neurachat.in" }]));
  assert.equal(buttonProblem([{ label: "Site", url: "https://neurachat.in" }]), null);
});

test("a blank label is caught before it reaches Instagram", () => {
  assert.match(buttonProblem([{ label: "  ", url: "https://neurachat.in" }])!, /needs a label/);
});

test("only http and https are sendable", () => {
  assert.equal(isSendableUrl("https://neurachat.in"), true);
  assert.equal(isSendableUrl("http://neurachat.in"), true);
  assert.equal(isSendableUrl("javascript:alert(1)"), false);
  assert.equal(isSendableUrl("ftp://files.example.com"), false);
});

test("a link id is unguessable and url-safe", () => {
  const id = linkId();
  assert.equal(id.length, 10);
  assert.match(id, /^[a-z2-9]+$/);
  // No lookalikes: an id read off a phone screen must not be ambiguous.
  assert.ok(!/[l1o0]/.test(id));
});

// --- email capture ---------------------------------------------------

test("an email is found inside a normal sentence", () => {
  assert.equal(emailIn("sure, it's me@example.com thanks!"), "me@example.com");
  assert.equal(emailIn("Vivek@Neurachat.IN"), "vivek@neurachat.in");
});

test("trailing punctuation is not part of the address", () => {
  assert.equal(emailIn("send it to hi@neurachat.in."), "hi@neurachat.in");
  assert.equal(emailIn("hi@neurachat.in, thanks"), "hi@neurachat.in");
});

test("text with no address gives nothing", () => {
  assert.equal(emailIn("what is the price?"), null);
  assert.equal(emailIn("@neuraxine"), null);
  assert.equal(emailIn("me@localhost"), null);
});
