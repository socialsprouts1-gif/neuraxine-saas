import test from "node:test";
import assert from "node:assert/strict";
import {
  readRole,
  isGroupRole,
  checkIcon,
  initials,
  checkLogoUrl,
  readAudience,
  filterAudience,
  describeAudience,
  sortMembers,
  GROUP_ICONS,
  withAlpha,
  type GroupRole,
} from "../src/lib/group-identity.ts";

// --- roles -----------------------------------------------------------------

test("only the two known roles are roles", () => {
  assert.equal(isGroupRole("admin"), true);
  assert.equal(isGroupRole("member"), true);
  assert.equal(isGroupRole("owner"), false);
  assert.equal(isGroupRole(null), false);
});

test("anything unrecognised reads as an ordinary member, never an admin", () => {
  assert.equal(readRole("admin"), "admin");
  assert.equal(readRole("member"), "member");
  assert.equal(readRole("ADMIN"), "member");
  assert.equal(readRole(undefined), "member");
  assert.equal(readRole(""), "member");
});

// --- icons -----------------------------------------------------------------

test("every offered icon passes its own check", () => {
  for (const icon of GROUP_ICONS) {
    const result = checkIcon(icon);
    assert.equal(result.ok, true, `${icon} was rejected`);
  }
});

test("an empty icon clears it rather than failing", () => {
  const result = checkIcon("   ");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.icon, null);
});

test("letters are refused, because a 40px tile is not a text box", () => {
  const result = checkIcon("VIP");
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /emoji/i);
});

test("a joined emoji sequence is still one icon", () => {
  // Family: four code points plus three zero-width joiners.
  const result = checkIcon("\u{1F468}‍\u{1F469}‍\u{1F467}");
  assert.equal(result.ok, true);
});

test("a wall of emoji is refused", () => {
  const result = checkIcon("🎯🎯🎯🎯🎯🎯🎯🎯🎯");
  assert.equal(result.ok, false);
});

// --- initials --------------------------------------------------------------

test("initials take the first and last word", () => {
  assert.equal(initials("Wholesale Buyers"), "WB");
  assert.equal(initials("South Delhi Society Committee"), "SC");
});

test("a single word gives its first two letters", () => {
  assert.equal(initials("Dealers"), "DE");
});

test("initials never come back empty", () => {
  assert.equal(initials("   "), "?");
});

test("initials survive a non-latin name", () => {
  // One grapheme, so one letter — not a crash and not a mojibake half-pair.
  assert.equal(initials("दिल्ली"), "दि");
});

// --- logo url --------------------------------------------------------------

test("an https logo is kept", () => {
  const result = checkLogoUrl("https://cdn.example.com/logo.png");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.url, "https://cdn.example.com/logo.png");
});

test("clearing the logo is allowed", () => {
  const result = checkLogoUrl("");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.url, null);
});

test("javascript: and data: are refused", () => {
  for (const bad of ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="]) {
    const result = checkLogoUrl(bad);
    assert.equal(result.ok, false, `${bad} was accepted`);
  }
});

test("plain http is refused", () => {
  const result = checkLogoUrl("http://cdn.example.com/logo.png");
  assert.equal(result.ok, false);
});

test("something that is not a URL at all is refused with advice", () => {
  const result = checkLogoUrl("my logo");
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /https:\/\//);
});

// --- audience --------------------------------------------------------------

const member = (name: string, role: GroupRole) => ({ name, waId: "91987654321", role });

const people = [
  member("Zoya", "member"),
  member("Arun", "admin"),
  member("Bilal", "member"),
  member("Chetna", "admin"),
];

test("the narrower audience is never the accident", () => {
  assert.equal(readAudience("admins"), "admins");
  assert.equal(readAudience("everyone"), "everyone");
  assert.equal(readAudience("ADMINS"), "everyone");
  assert.equal(readAudience(undefined), "everyone");
});

test("admins-only sends to the admins", () => {
  assert.deepEqual(
    filterAudience(people, "admins").map((m) => m.name),
    ["Arun", "Chetna"]
  );
});

test("everyone sends to everyone, and does not hand back the same array", () => {
  const all = filterAudience(people, "everyone");
  assert.equal(all.length, 4);
  assert.notEqual(all, people);
});

test("admins-only with no admins says so before sending, not after", () => {
  const line = describeAudience("admins", 0, 12);
  assert.match(line, /nobody/i);
});

test("the audience line counts what it will actually reach", () => {
  assert.match(describeAudience("admins", 2, 12), /2 key contacts/);
  assert.match(describeAudience("admins", 1, 12), /1 key contact\b/);
  assert.match(describeAudience("everyone", 2, 12), /all 12 members/);
  assert.match(describeAudience("everyone", 0, 1), /all 1 member,/);
});

// --- ordering --------------------------------------------------------------

test("admins come first, then alphabetically", () => {
  assert.deepEqual(
    sortMembers(people).map((m) => m.name),
    ["Arun", "Chetna", "Bilal", "Zoya"]
  );
});

test("somebody with no name sorts by their number", () => {
  const sorted = sortMembers([
    { name: null, waId: "919000000002", role: "member" as GroupRole },
    { name: null, waId: "919000000001", role: "member" as GroupRole },
  ]);
  assert.equal(sorted[0].waId, "919000000001");
});

test("sorting leaves the original list alone", () => {
  const original = [...people];
  sortMembers(people);
  assert.deepEqual(people, original);
});

// --- tile colour -----------------------------------------------------------

test("a six-digit hex keeps its value and gains an alpha pair", () => {
  assert.equal(withAlpha("#00FF87", 1), "#00FF87ff");
  assert.equal(withAlpha("#00FF87", 0), "#00FF8700");
  assert.equal(withAlpha("#00FF87", 0.2), "#00FF8733");
});

test("anything that is not a hex colour falls back rather than rendering nothing", () => {
  assert.equal(withAlpha("green", 1), "#00FF87ff");
  assert.equal(withAlpha("", 1), "#00FF87ff");
  assert.equal(withAlpha("#fff", 1), "#00FF87ff");
});

test("an out-of-range opacity is clamped, not wrapped", () => {
  assert.equal(withAlpha("#00FF87", 5), "#00FF87ff");
  assert.equal(withAlpha("#00FF87", -1), "#00FF8700");
});
