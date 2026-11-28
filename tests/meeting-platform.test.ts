import test from "node:test";
import assert from "node:assert/strict";
import {
  MEETING_PLATFORMS,
  PLATFORM_LABEL,
  readPlatform,
  checkLink,
  confirmationMessage,
  rescheduleMessage,
  cancellationMessage,
  type ConfirmationInput,
} from "../src/lib/meeting-platform.ts";

const base: ConfirmationInput = {
  businessName: "Umm Clothing",
  title: "WhatsApp automation",
  whenText: "Tue 22 Sept, 5:15 pm",
  durationMinutes: 30,
  platform: "google_meet",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
};

test("every platform has a label", () => {
  for (const platform of MEETING_PLATFORMS) {
    assert.ok(PLATFORM_LABEL[platform]?.length > 2, platform);
  }
});

test("only a known platform is accepted", () => {
  assert.equal(readPlatform("zoom"), "zoom");
  assert.equal(readPlatform("skype"), null);
  assert.equal(readPlatform(""), null);
  assert.equal(readPlatform(null), null);
});

// --- the link ------------------------------------------------------------

test("a platform that is a link needs one", () => {
  const result = checkLink("zoom", "");
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.error : "", /no way in/);
});

test("a place or a call needs no link", () => {
  assert.equal(checkLink("in_person", null).ok, true);
  assert.equal(checkLink("phone", "").ok, true);
});

test("the link has to match the platform", () => {
  // Picking Google Meet and pasting a Zoom link produces a confirmation
  // that reads correctly and sends the customer to the wrong place.
  const wrong = checkLink("google_meet", "https://zoom.us/j/123");
  assert.equal(wrong.ok, false);
  assert.match(wrong.ok === false ? wrong.error : "", /does not look like a Google Meet link/);

  assert.equal(checkLink("google_meet", "https://meet.google.com/abc-defg-hij").ok, true);
  assert.equal(checkLink("zoom", "https://acme.zoom.us/j/123").ok, true);
  assert.equal(checkLink("calendly", "https://calendly.com/x/30min").ok, true);
});

test("an insecure or malformed link is refused", () => {
  assert.equal(checkLink("zoom", "http://zoom.us/j/1").ok, false);
  assert.equal(checkLink("zoom", "https://").ok, false);
});

test("a look-alike host does not pass", () => {
  // meet.google.com.evil.example is not meet.google.com.
  assert.equal(checkLink("google_meet", "https://meet.google.com.evil.example/x").ok, false);
});

// --- what the customer reads ---------------------------------------------

test("the confirmation says what, when, how long and how to join", () => {
  const text = confirmationMessage(base);
  assert.match(text, /confirmed/);
  assert.match(text, /WhatsApp automation/);
  assert.match(text, /Tue 22 Sept, 5:15 pm/);
  assert.match(text, /30 min/);
  assert.match(text, /meet\.google\.com/);
});

test("a meeting with nowhere to say simply does not say it", () => {
  // A blank "Where:" line is worse than no line at all.
  const text = confirmationMessage({
    ...base,
    platform: "other",
    meetingUrl: null,
    location: null,
  });
  assert.doesNotMatch(text, /Where:/);
  assert.doesNotMatch(text, /Join on/);
  assert.match(text, /confirmed/);
});

test("an in-person meeting gives the address, not a link", () => {
  const text = confirmationMessage({
    ...base,
    platform: "in_person",
    meetingUrl: null,
    location: "12 MG Road, Akola",
  });
  assert.match(text, /Where: 12 MG Road, Akola/);
  assert.doesNotMatch(text, /Join on/);
});

test("a phone meeting says we will call, and names the number when given", () => {
  assert.match(
    confirmationMessage({ ...base, platform: "phone", meetingUrl: null, location: "+91 90000 00000" }),
    /call you on \+91 90000 00000/
  );
  assert.match(
    confirmationMessage({ ...base, platform: "phone", meetingUrl: null, location: null }),
    /call you at that time/
  );
});

test("a reschedule says it moved and gives the new time", () => {
  const text = rescheduleMessage({ ...base, whenText: "Wed 23 Sept, 9:00 am" });
  assert.match(text, /has moved/);
  assert.match(text, /Now: Wed 23 Sept, 9:00 am/);
  assert.match(text, /meet\.google\.com/);
});

test("a cancellation offers to rebook rather than ending flatly", () => {
  const text = cancellationMessage(base);
  assert.match(text, /cancelled/);
  assert.match(text, /rebook/);
});

test("no message leaves an empty placeholder line", () => {
  for (const text of [
    confirmationMessage(base),
    rescheduleMessage(base),
    cancellationMessage(base),
  ]) {
    assert.doesNotMatch(text, /undefined|null|:\s*$/m);
  }
});
