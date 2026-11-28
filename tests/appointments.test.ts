import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HOURS,
  DEFAULT_SETTINGS,
  availableDates,
  durationLabel,
  formatClock,
  generateSlots,
  isClosedAllWeek,
  isValidTimeZone,
  parseClock,
  readHours,
  readSettings,
  utcToZoned,
  zonedDateKey,
  zonedTimeLabel,
  zonedToUtc,
  type AppointmentSettings,
} from "../src/lib/appointments.ts";

const IST = "Asia/Kolkata";
const LONDON = "Europe/London";

/** A Thursday. 2026-09-10 is a Thursday. */
const THURSDAY_8AM_IST = new Date("2026-09-10T02:30:00.000Z");

function settings(overrides: Partial<AppointmentSettings> = {}): AppointmentSettings {
  return { ...DEFAULT_SETTINGS, minNoticeMinutes: 0, ...overrides };
}

describe("timezone conversion", () => {
  it("turns a local wall time into the right instant", () => {
    // India is UTC+5:30 all year, so 09:00 there is 03:30 UTC.
    const instant = zonedToUtc(2026, 9, 10, 9, 0, IST);
    assert.equal(instant.toISOString(), "2026-09-10T03:30:00.000Z");
  });

  it("reads an instant back as the local clock", () => {
    const parts = utcToZoned(new Date("2026-09-10T03:30:00.000Z"), IST);
    assert.deepEqual(parts, {
      year: 2026,
      month: 9,
      day: 10,
      weekday: "thu",
      hour: 9,
      minute: 0,
    });
  });

  it("round-trips across a DST boundary", () => {
    // London is UTC+1 in July and UTC+0 in December. A one-pass conversion
    // gets one of these an hour wrong.
    const summer = zonedToUtc(2026, 7, 15, 9, 0, LONDON);
    assert.equal(summer.toISOString(), "2026-07-15T08:00:00.000Z");

    const winter = zonedToUtc(2026, 12, 15, 9, 0, LONDON);
    assert.equal(winter.toISOString(), "2026-12-15T09:00:00.000Z");
  });

  it("handles midnight, which some environments format as hour 24", () => {
    const instant = zonedToUtc(2026, 9, 10, 0, 0, IST);
    assert.equal(instant.toISOString(), "2026-09-09T18:30:00.000Z");
    assert.equal(zonedDateKey(instant, IST), "2026-09-10");
  });

  it("labels a time as the business would read it", () => {
    assert.equal(zonedTimeLabel(new Date("2026-09-10T03:30:00.000Z"), IST), "9:00 am");
    assert.equal(zonedTimeLabel(new Date("2026-09-10T09:00:00.000Z"), IST), "2:30 pm");
  });

  it("knows a timezone it cannot use", () => {
    assert.equal(isValidTimeZone(IST), true);
    assert.equal(isValidTimeZone("Mars/Olympus"), false);
  });
});

describe("clock parsing", () => {
  it("reads a time as minutes past midnight", () => {
    assert.equal(parseClock("09:30"), 570);
    assert.equal(parseClock("00:00"), 0);
    assert.equal(parseClock(" 9:05 "), 545);
  });

  it("refuses anything that is not a time", () => {
    assert.equal(parseClock("25:00"), null);
    assert.equal(parseClock("09:60"), null);
    assert.equal(parseClock("half nine"), null);
    assert.equal(parseClock(""), null);
  });

  it("formats back", () => {
    assert.equal(formatClock(570), "09:30");
    assert.equal(formatClock(0), "00:00");
  });
});

describe("readHours", () => {
  it("drops a window that will not parse rather than the whole day", () => {
    const week = readHours({
      mon: [
        { start: "09:00", end: "13:00" },
        { start: "nonsense", end: "18:00" },
        { start: "14:00", end: "18:00" },
      ],
    });
    assert.deepEqual(week.mon, [
      { start: "09:00", end: "13:00" },
      { start: "14:00", end: "18:00" },
    ]);
  });

  it("drops a window that ends before it starts", () => {
    assert.deepEqual(readHours({ tue: [{ start: "18:00", end: "09:00" }] }).tue, []);
  });

  it("closes a day whose value is not a list", () => {
    assert.deepEqual(readHours({ wed: "all day" }).wed, []);
    assert.deepEqual(readHours(null).mon, []);
  });

  it("sorts the windows of a day", () => {
    const week = readHours({
      fri: [
        { start: "14:00", end: "18:00" },
        { start: "09:00", end: "13:00" },
      ],
    });
    assert.equal(week.fri[0].start, "09:00");
  });

  it("recognises a week with nothing open", () => {
    assert.equal(isClosedAllWeek(readHours({})), true);
    assert.equal(isClosedAllWeek(DEFAULT_HOURS), false);
  });
});

describe("generateSlots", () => {
  it("cuts a day into slots at the configured spacing", () => {
    const slots = generateSlots({
      settings: settings({
        hours: { ...DEFAULT_HOURS, thu: [{ start: "09:00", end: "11:00" }] },
        horizonDays: 1,
      }),
      now: THURSDAY_8AM_IST,
    });

    assert.deepEqual(
      slots.map((slot) => slot.timeLabel),
      ["9:00 am", "9:30 am", "10:00 am", "10:30 am"]
    );
  });

  it("leaves a gap after each booking when a buffer is set", () => {
    const slots = generateSlots({
      settings: settings({
        hours: { ...DEFAULT_HOURS, thu: [{ start: "09:00", end: "11:00" }] },
        horizonDays: 1,
        slotMinutes: 30,
        bufferMinutes: 15,
      }),
      now: THURSDAY_8AM_IST,
    });

    assert.deepEqual(
      slots.map((slot) => slot.timeLabel),
      ["9:00 am", "9:45 am", "10:30 am"]
    );
  });

  it("will not offer a slot the service does not fit in", () => {
    const slots = generateSlots({
      settings: settings({
        hours: { ...DEFAULT_HOURS, thu: [{ start: "09:00", end: "10:00" }] },
        horizonDays: 1,
      }),
      // A 45-minute service cannot start at 9:30 in an hour that ends at 10.
      durationMinutes: 45,
      now: THURSDAY_8AM_IST,
    });

    assert.deepEqual(
      slots.map((slot) => slot.timeLabel),
      ["9:00 am"]
    );
  });

  it("respects the shortest notice", () => {
    const slots = generateSlots({
      settings: settings({
        hours: { ...DEFAULT_HOURS, thu: [{ start: "09:00", end: "11:00" }] },
        horizonDays: 1,
        // It is 8:00; an hour's notice rules out 9:00 but not 9:30.
        minNoticeMinutes: 90,
      }),
      now: THURSDAY_8AM_IST,
    });

    assert.equal(slots[0].timeLabel, "9:30 am");
  });

  it("skips a slot that is already booked", () => {
    const slots = generateSlots({
      settings: settings({
        hours: { ...DEFAULT_HOURS, thu: [{ start: "09:00", end: "11:00" }] },
        horizonDays: 1,
      }),
      now: THURSDAY_8AM_IST,
      booked: [{ startsAt: "2026-09-10T03:30:00.000Z", durationMinutes: 30 }],
    });

    assert.equal(
      slots.some((slot) => slot.timeLabel === "9:00 am"),
      false
    );
    assert.equal(slots[0].timeLabel, "9:30 am");
  });

  it("keeps offering a slot until it hits the per-slot limit", () => {
    const config = settings({
      hours: { ...DEFAULT_HOURS, thu: [{ start: "09:00", end: "10:00" }] },
      horizonDays: 1,
      maxPerSlot: 2,
    });

    const one = generateSlots({
      settings: config,
      now: THURSDAY_8AM_IST,
      booked: [{ startsAt: "2026-09-10T03:30:00.000Z", durationMinutes: 30 }],
    });
    assert.equal(one[0].timeLabel, "9:00 am");

    const two = generateSlots({
      settings: config,
      now: THURSDAY_8AM_IST,
      booked: [
        { startsAt: "2026-09-10T03:30:00.000Z", durationMinutes: 30 },
        { startsAt: "2026-09-10T03:30:00.000Z", durationMinutes: 30 },
      ],
    });
    assert.equal(two[0].timeLabel, "9:30 am");
  });

  it("offers nothing inside a blackout", () => {
    const slots = generateSlots({
      settings: settings({
        hours: { ...DEFAULT_HOURS, thu: [{ start: "09:00", end: "11:00" }] },
        horizonDays: 1,
      }),
      now: THURSDAY_8AM_IST,
      blackouts: [
        { startsAt: "2026-09-09T18:30:00.000Z", endsAt: "2026-09-10T18:30:00.000Z" },
      ],
    });

    assert.deepEqual(slots, []);
  });

  it("honours a day that is closed", () => {
    const slots = generateSlots({
      settings: settings({ hours: { ...DEFAULT_HOURS, thu: [] }, horizonDays: 1 }),
      now: THURSDAY_8AM_IST,
    });
    assert.deepEqual(slots, []);
  });

  it("handles two windows in a day without offering the lunch hour", () => {
    const slots = generateSlots({
      settings: settings({
        hours: {
          ...DEFAULT_HOURS,
          thu: [
            { start: "09:00", end: "10:00" },
            { start: "14:00", end: "15:00" },
          ],
        },
        horizonDays: 1,
      }),
      now: THURSDAY_8AM_IST,
    });

    assert.deepEqual(
      slots.map((slot) => slot.timeLabel),
      ["9:00 am", "9:30 am", "2:00 pm", "2:30 pm"]
    );
  });

  it("only returns the day asked for", () => {
    const slots = generateSlots({
      settings: settings({ horizonDays: 7 }),
      now: THURSDAY_8AM_IST,
      onlyDate: "2026-09-12",
    });

    assert.equal(slots.length > 0, true);
    assert.equal(
      slots.every((slot) => slot.date === "2026-09-12"),
      true
    );
  });

  it("stops at the limit rather than generating a fortnight", () => {
    const slots = generateSlots({
      settings: settings({ horizonDays: 60 }),
      now: THURSDAY_8AM_IST,
      limit: 5,
    });
    assert.equal(slots.length, 5);
  });

  it("returns slots in order", () => {
    const slots = generateSlots({ settings: settings({ horizonDays: 5 }), now: THURSDAY_8AM_IST });
    const sorted = [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    assert.deepEqual(slots, sorted);
  });
});

describe("availableDates", () => {
  it("groups slots into days with a count each", () => {
    const slots = generateSlots({
      settings: settings({
        hours: { ...DEFAULT_HOURS, thu: [{ start: "09:00", end: "10:00" }], fri: [{ start: "09:00", end: "10:30" }] },
        horizonDays: 2,
      }),
      now: THURSDAY_8AM_IST,
    });

    const dates = availableDates(slots);
    assert.deepEqual(
      dates.map((day) => ({ date: day.date, count: day.count })),
      [
        { date: "2026-09-10", count: 2 },
        { date: "2026-09-11", count: 3 },
      ]
    );
    // The label is whatever the runtime's ICU calls that month — "Sep" on
    // one Node build, "Sept" on another — so only the parts we control are
    // asserted.
    assert.match(dates[0].label, /^Thu 10 /);
    assert.match(dates[1].label, /^Fri 11 /);
  });
});

describe("readSettings", () => {
  it("falls back to the defaults for a missing row", () => {
    assert.deepEqual(readSettings(null), DEFAULT_SETTINGS);
  });

  it("clamps a value outside what the column allows", () => {
    const result = readSettings({ slot_minutes: 100000, max_per_slot: 0, horizon_days: -5 });
    assert.equal(result.slotMinutes, 480);
    assert.equal(result.maxPerSlot, 1);
    assert.equal(result.horizonDays, 1);
  });

  it("refuses a timezone the runtime does not know", () => {
    assert.equal(readSettings({ timezone: "Mars/Olympus" }).timezone, DEFAULT_SETTINGS.timezone);
    assert.equal(readSettings({ timezone: LONDON }).timezone, LONDON);
  });
});

describe("durationLabel", () => {
  it("reads the way a person would say it", () => {
    assert.equal(durationLabel(30), "30 min");
    assert.equal(durationLabel(60), "1 hr");
    assert.equal(durationLabel(90), "1 hr 30 min");
    assert.equal(durationLabel(120), "2 hr");
  });
});
