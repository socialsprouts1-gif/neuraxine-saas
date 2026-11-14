import test from "node:test";
import assert from "node:assert/strict";
import {
  RESERVED_LABELS,
  brandTheme,
  brandThemeCss,
  contrast,
  domainProblem,
  hostKey,
  parseHex,
  slugFromHost,
  slugProblem,
  wordmark,
} from "../src/lib/brand.ts";

// The rules that decide whose logo a visitor sees.
//
// Every one of these is invisible until it is wrong on a live domain, and
// wrong here means one agency's customers looking at another agency's
// login page. That is the single worst failure a white label can have, so
// the matching is settled in tests rather than on a production host.

test("hostKey normalises what a request actually carries", () => {
  assert.equal(hostKey("App.Acme.COM"), "app.acme.com");
  assert.equal(hostKey("app.acme.com:3000"), "app.acme.com");
  assert.equal(hostKey("app.acme.com."), "app.acme.com");
  assert.equal(hostKey("www.acme.com"), "acme.com");
  assert.equal(hostKey("  acme.com  "), "acme.com");
  assert.equal(hostKey("[::1]:3000"), "::1");
  assert.equal(hostKey(null), "");
  assert.equal(hostKey(undefined), "");
  assert.equal(hostKey(""), "");
});

test("www of a custom domain is the same front door", () => {
  // Somebody who types www in front of the agency's domain is at the
  // agency's door, not at nobody's.
  assert.equal(hostKey("www.app.acme.com"), "app.acme.com");
});

test("a platform subdomain names its brand", () => {
  assert.equal(slugFromHost("acme.neurachat.in", "neurachat.in"), "acme");
  assert.equal(slugFromHost("ACME.neurachat.in", "neurachat.in"), "acme");
  assert.equal(slugFromHost("acme-two.neurachat.in", "neurachat.in"), "acme-two");
});

test("the platform's own domain names no brand", () => {
  assert.equal(slugFromHost("neurachat.in", "neurachat.in"), null);
  assert.equal(slugFromHost("www.neurachat.in", "neurachat.in"), null);
});

test("a deeper name is not a brand", () => {
  // a.b.neurachat.in is a host nobody configured. Reading it as brand "a"
  // would mean a typo quietly serves somebody else's login page.
  assert.equal(slugFromHost("a.b.neurachat.in", "neurachat.in"), null);
});

test("another domain entirely names no brand", () => {
  assert.equal(slugFromHost("acme.example.com", "neurachat.in"), null);
  // The root as a suffix of a longer word is not the root.
  assert.equal(slugFromHost("acme.evilneurachat.in", "neurachat.in"), null);
});

test("infrastructure subdomains are never a brand", () => {
  for (const label of ["www", "api", "admin", "app", "mail", "staging"]) {
    assert.equal(
      slugFromHost(`${label}.neurachat.in`, "neurachat.in"),
      null,
      `${label} should not resolve to a brand`
    );
  }
  assert.ok(RESERVED_LABELS.has("app"));
});

test("no root domain configured means no subdomain brands", () => {
  assert.equal(slugFromHost("acme.neurachat.in", ""), null);
});

test("slugProblem refuses what cannot be a subdomain", () => {
  assert.equal(slugProblem("acme"), null);
  assert.equal(slugProblem("acme-two"), null);
  assert.equal(slugProblem("a1"), "Too short — three characters or more.");
  assert.match(slugProblem("") ?? "", /short name/i);
  // Typed with a capital, stored lowercase — the action lower-cases too,
  // so this is accepted rather than thrown back at somebody over a shift key.
  assert.equal(slugProblem("Acme"), null);
  assert.match(slugProblem("acme.com") ?? "", /lowercase/);
  assert.match(slugProblem("-acme") ?? "", /lowercase/);
  assert.match(slugProblem("acme-") ?? "", /lowercase/);
  assert.match(slugProblem("admin") ?? "", /reserved/);
  assert.match(slugProblem("a".repeat(41)) ?? "", /too long/i);
});

test("domainProblem refuses a URL pasted where a domain goes", () => {
  assert.equal(domainProblem(""), null);
  assert.equal(domainProblem("app.acme.com"), null);
  assert.match(domainProblem("https://app.acme.com") ?? "", /no https/i);
  assert.match(domainProblem("app.acme.com/login") ?? "", /slashes/i);
  assert.match(domainProblem("app.acme.com:3000") ?? "", /no port/i);
  assert.match(domainProblem("localhost") ?? "", /needs a dot/i);
  assert.match(domainProblem("app acme.com") ?? "", /spaces|no https|slashes/i);
});

test("the platform's own host is recognised without a lookup", () => {
  // brandFromHost short-circuits on this comparison before it touches the
  // database. If hostKey ever stopped dropping www, the platform's own
  // site would start doing a brand query on every single page load.
  assert.equal(hostKey("www.neurachat.in"), hostKey("neurachat.in"));
  assert.equal(hostKey("NEURACHAT.IN:443"), hostKey("neurachat.in"));
  assert.notEqual(hostKey("acme.neurachat.in"), hostKey("neurachat.in"));
});

test("wordmark joins the two halves of a name", () => {
  assert.equal(wordmark({ name: "Acme", nameAccent: "Chat" }), "AcmeChat");
  assert.equal(wordmark({ name: "Acme", nameAccent: "" }), "Acme");
});

// --- the agency's colour ---------------------------------------------------

test("parseHex takes a six-digit hex and nothing else", () => {
  assert.deepEqual(parseHex("#2F6BFF"), { r: 47, g: 107, b: 255 });
  assert.equal(parseHex("#2f6"), null);
  assert.equal(parseHex("2F6BFF"), null);
  assert.equal(parseHex("rgb(1,2,3)"), null);
  assert.equal(parseHex(""), null);
});

test("a derived theme is readable in both themes", () => {
  // The whole reason brandTheme exists. A mid blue is unreadable as text
  // on a dark page; a yellow is unreadable as text on a white one. Both
  // are colours agencies pick.
  for (const hex of ["#2F6BFF", "#FFD400", "#111111", "#FFFFFF", "#7C3AED", "#00FF87"]) {
    const theme = brandTheme(hex);
    assert.ok(theme, `${hex} produced no theme`);

    const darkPage = { r: 11, g: 11, b: 16 };
    const white = { r: 255, g: 255, b: 255 };
    const nearBlack = { r: 5, g: 5, b: 8 };

    const darkInk = parseHex(theme.dark.ink);
    const lightInk = parseHex(theme.light.ink);
    const darkFill = parseHex(theme.dark.accent);
    assert.ok(darkInk && lightInk && darkFill);

    assert.ok(
      contrast(darkInk, darkPage) >= 4.4,
      `${hex}: dark-mode text only reaches ${contrast(darkInk, darkPage).toFixed(2)}:1`
    );
    assert.ok(
      contrast(lightInk, white) >= 4.4,
      `${hex}: light-mode text only reaches ${contrast(lightInk, white).toFixed(2)}:1`
    );
    assert.ok(
      contrast(darkFill, nearBlack) >= 4.4,
      `${hex}: button text only reaches ${contrast(darkFill, nearBlack).toFixed(2)}:1`
    );
  }
});

test("a colour that already reads is left alone", () => {
  const theme = brandTheme("#00FF87");
  assert.equal(theme?.dark.accent, "#00FF87");
});

test("brandThemeCss names the variables globals.css uses", () => {
  const css = brandThemeCss("#2F6BFF");
  for (const token of ["--color-accent:", "--color-accent-ink:", "--accent:", "--accent-ink:"]) {
    assert.ok(css.includes(token), `missing ${token}`);
  }
  assert.ok(css.includes('[data-theme="light"]'), "light mode is not overridden");
  assert.equal(brandThemeCss("not a colour"), "");
});

test("contrast is the WCAG ratio", () => {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  assert.equal(Math.round(contrast(white, black)), 21);
  assert.equal(Math.round(contrast(white, white)), 1);
});
