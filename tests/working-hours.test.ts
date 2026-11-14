import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isWithinWorkingHours,
  localClock,
  parseClock,
  type WorkingHoursRule,
} from "../src/lib/working-hours.ts";

function rule(overrides: Partial<WorkingHoursRule> = {}): WorkingHoursRule {
  return {
    working_hours_enabled: true,
    working_hours_timezone: "UTC",
    working_hours_start: "09:00",
    working_hours_end: "18:00",
    working_days: [1, 2, 3, 4, 5],
    ...overrides,
  };
}

// 2026-08-27 is a Thursday.
const thursdayNoon = new Date("2026-08-27T12:00:00Z");
const thursdayNight = new Date("2026-08-27T22:00:00Z");
const saturdayNoon = new Date("2026-08-29T12:00:00Z");

test("parseClock reads HH:MM and rejects anything else", () => {
  assert.equal(parseClock("09:00"), 540);
  assert.equal(parseClock("9:05"), 545);
  assert.equal(parseClock("23:59"), 1439);
  assert.equal(parseClock("24:00"), null);
  assert.equal(parseClock("09:60"), null);
  assert.equal(parseClock("nine"), null);
  assert.equal(parseClock(""), null);
});

test("localClock reports the wall clock in the given zone", () => {
  // 12:00 UTC is 17:30 in Kolkata, same day.
  assert.deepEqual(localClock("Asia/Kolkata", thursdayNoon), { day: 4, minutes: 17 * 60 + 30 });
  // 22:00 UTC on Thursday is already Friday in Sydney.
  assert.equal(localClock("Australia/Sydney", thursdayNight)?.day, 5);
});

test("localClock returns null for a zone the runtime doesn't know", () => {
  assert.equal(localClock("Mars/Olympus", thursdayNoon), null);
});

test("open inside the window on a working day", () => {
  assert.equal(isWithinWorkingHours(rule(), thursdayNoon), true);
});

test("closed outside the window and on a non-working day", () => {
  assert.equal(isWithinWorkingHours(rule(), thursdayNight), false);
  assert.equal(isWithinWorkingHours(rule(), saturdayNoon), false);
});

test("the window is evaluated in the assistant's timezone, not UTC", () => {
  // 12:00 UTC is 05:00 in Los Angeles — before a 09:00 opening.
  const la = rule({ working_hours_timezone: "America/Los_Angeles" });
  assert.equal(isWithinWorkingHours(la, thursdayNoon), false);

  // The same instant is 17:30 in Kolkata, still inside 09:00-18:00.
  const kolkata = rule({ working_hours_timezone: "Asia/Kolkata" });
  assert.equal(isWithinWorkingHours(kolkata, thursdayNoon), true);
});

test("an overnight window wraps midnight and belongs to the day it opened on", () => {
  const nightShift = rule({
    working_hours_start: "22:00",
    working_hours_end: "06:00",
    working_days: [4], // Thursday only
  });

  // 22:00 Thursday — the shift has just opened.
  assert.equal(isWithinWorkingHours(nightShift, thursdayNight), true);
  // 02:00 Friday still counts as Thursday's shift.
  assert.equal(
    isWithinWorkingHours(nightShift, new Date("2026-08-28T02:00:00Z")),
    true
  );
  // 07:00 Friday is after it closed, and Friday is not a working day.
  assert.equal(
    isWithinWorkingHours(nightShift, new Date("2026-08-28T07:00:00Z")),
    false
  );
  // 02:00 Thursday belongs to Wednesday's shift, which is not scheduled.
  assert.equal(
    isWithinWorkingHours(nightShift, new Date("2026-08-27T02:00:00Z")),
    false
  );
});

test("open by default when the rule is off or unusable", () => {
  // Silence is the failure mode a customer cannot diagnose, so every
  // degenerate configuration answers rather than going quiet.
  assert.equal(isWithinWorkingHours(rule({ working_hours_enabled: false }), saturdayNoon), true);
  assert.equal(isWithinWorkingHours(rule({ working_hours_start: "" }), thursdayNight), true);
  assert.equal(
    isWithinWorkingHours(rule({ working_hours_start: "09:00", working_hours_end: "09:00" }), thursdayNight),
    true
  );
  assert.equal(
    isWithinWorkingHours(rule({ working_hours_timezone: "Nowhere/Nothing" }), thursdayNight),
    true
  );
});

test("no working days selected means never on duty", () => {
  // The one case where silence is what was actually asked for.
  assert.equal(isWithinWorkingHours(rule({ working_days: [] }), thursdayNoon), false);
});
