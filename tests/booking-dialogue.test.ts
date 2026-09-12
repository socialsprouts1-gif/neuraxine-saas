import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_PREFIX,
  MAX_LIST_ROWS,
  datePrompt,
  fillTemplate,
  isEmptyPrompt,
  prunePrompt,
  readIntent,
  timePrompt,
  typePrompt,
  type BookableType,
} from "../src/lib/booking-dialogue.ts";
import { DEFAULT_HOURS, DEFAULT_SETTINGS, generateSlots } from "../src/lib/appointments.ts";

const KEYWORDS = ["book", "appointment", "schedule"];

function intent(text: string, buttonId: string | null = null, inSession = false) {
  return readIntent({ text, buttonId, keywords: KEYWORDS, inSession });
}

function service(overrides: Partial<BookableType> = {}): BookableType {
  return {
    id: "type-1",
    name: "Consultation",
    description: "A first chat",
    durationMinutes: 30,
    priceCents: 50000,
    ...overrides,
  };
}

describe("readIntent", () => {
  it("reads a tapped row back as the choice it was", () => {
    assert.deepEqual(intent("", `${BOOKING_PREFIX}:type:abc`), { kind: "type", typeId: "abc" });
    assert.deepEqual(intent("", `${BOOKING_PREFIX}:date:2026-09-11`), {
      kind: "date",
      date: "2026-09-11",
    });
    assert.deepEqual(intent("", `${BOOKING_PREFIX}:cancel`), { kind: "cancel" });
    assert.deepEqual(intent("", `${BOOKING_PREFIX}:dates`), { kind: "dates" });
  });

  it("keeps the colons inside an ISO timestamp", () => {
    const result = intent("", `${BOOKING_PREFIX}:time:2026-09-11T03:30:00.000Z`);
    assert.deepEqual(result, { kind: "time", startsAt: "2026-09-11T03:30:00.000Z" });
  });

  it("ignores a button that is not ours", () => {
    assert.deepEqual(intent("", "flow-7:2"), { kind: "none" });
  });

  it("starts on a keyword anywhere in a sentence", () => {
    assert.deepEqual(intent("hi, can I book something for friday"), { kind: "start" });
    assert.deepEqual(intent("APPOINTMENT"), { kind: "start" });
  });

  it("does not start on a word that merely contains a keyword", () => {
    assert.deepEqual(intent("do you do bookkeeping"), { kind: "none" });
    assert.deepEqual(intent("scheduled maintenance"), { kind: "none" });
  });

  it("only reads cancel as cancel while a booking is in progress", () => {
    assert.deepEqual(intent("cancel", null, true), { kind: "cancel" });
    // Outside a booking, "cancel" is as likely to be about an order.
    assert.deepEqual(intent("cancel", null, false), { kind: "none" });
  });

  it("never reads typed text as a date", () => {
    assert.deepEqual(intent("11th September please", null, true), { kind: "none" });
    assert.deepEqual(intent("tomorrow at 3", null, true), { kind: "none" });
  });

  it("has nothing to say about an empty message", () => {
    assert.deepEqual(intent(""), { kind: "none" });
    assert.deepEqual(intent("👍"), { kind: "none" });
  });
});

describe("typePrompt", () => {
  it("puts the length and price on the row", () => {
    const prompt = typePrompt("What would you like?", [service()]);
    const row = prompt.sections[0].rows[0];
    assert.equal(row.title, "Consultation");
    assert.match(row.description ?? "", /30 min/);
    assert.match(row.description ?? "", /500/);
  });

  it("leaves the price off a service that has none", () => {
    const prompt = typePrompt("hi", [service({ priceCents: 0 })]);
    assert.equal(/₹/.test(prompt.sections[0].rows[0].description ?? ""), false);
  });

  it("clips a name too long for a WhatsApp row", () => {
    const prompt = typePrompt("hi", [
      service({ name: "An extremely long service name that will not fit" }),
    ]);
    assert.equal(prompt.sections[0].rows[0].title.length <= 24, true);
  });

  it("always leaves a way out", () => {
    const prompt = typePrompt("hi", [service()]);
    const ids = prompt.sections.flatMap((section) => section.rows.map((row) => row.id));
    assert.equal(ids.includes(`${BOOKING_PREFIX}:cancel`), true);
  });
});

describe("datePrompt and timePrompt", () => {
  const slots = generateSlots({
    settings: {
      ...DEFAULT_SETTINGS,
      minNoticeMinutes: 0,
      horizonDays: 5,
      hours: { ...DEFAULT_HOURS, thu: [{ start: "09:00", end: "11:00" }] },
    },
    now: new Date("2026-09-10T02:30:00.000Z"),
  });

  it("offers only days that have something free", () => {
    const prompt = datePrompt(slots, "Consultation");
    const dates = prompt.sections[0].rows.map((row) => row.id);
    assert.equal(dates.length > 0, true);
    assert.equal(
      dates.every((id) => id.startsWith(`${BOOKING_PREFIX}:date:`)),
      true
    );
  });

  it("says how many times are free on each day", () => {
    const prompt = datePrompt(slots, null);
    assert.match(prompt.sections[0].rows[0].description ?? "", /\d+ times? free/);
  });

  it("names the service in the question when there is one", () => {
    assert.match(datePrompt(slots, "Consultation").body, /^Consultation/);
    assert.equal(datePrompt(slots, null).body, "Which day suits you?");
  });

  it("gives a way back to the day list from the times", () => {
    const prompt = timePrompt(slots, "Thu 10 Sep");
    const ids = prompt.sections.flatMap((section) => section.rows.map((row) => row.id));
    assert.equal(ids.includes(`${BOOKING_PREFIX}:dates`), true);
    assert.equal(ids.includes(`${BOOKING_PREFIX}:cancel`), true);
  });
});

describe("prunePrompt", () => {
  it("never lets a list exceed what Meta accepts", () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      service({ id: `t${index}`, name: `Service ${index}` })
    );
    const pruned = prunePrompt(typePrompt("hi", many));
    const rows = pruned.sections.reduce((total, section) => total + section.rows.length, 0);
    assert.equal(rows <= MAX_LIST_ROWS, true);
  });

  it("drops a section left with no rows rather than sending an empty one", () => {
    const pruned = prunePrompt({
      body: "hi",
      buttonText: "Go",
      sections: [
        { title: "A", rows: Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, title: `${i}` })) },
        { title: "B", rows: [{ id: "y", title: "y" }] },
      ],
    });
    assert.equal(pruned.sections.length, 1);
  });
});

describe("isEmptyPrompt", () => {
  it("recognises a menu that offers nothing but the way out", () => {
    assert.equal(isEmptyPrompt(typePrompt("hi", [])), true);
    assert.equal(isEmptyPrompt(typePrompt("hi", [service()])), false);
  });
});

describe("fillTemplate", () => {
  it("fills what it knows", () => {
    assert.equal(
      fillTemplate("See you {{date}} at {{time}}.", { date: "Thu 11 Sep", time: "10:30 am" }),
      "See you Thu 11 Sep at 10:30 am."
    );
  });

  it("tolerates spaces inside the braces", () => {
    assert.equal(fillTemplate("at {{ time }}", { time: "9 am" }), "at 9 am");
  });

  it("leaves a placeholder it does not know alone, so a typo is visible", () => {
    assert.equal(fillTemplate("at {{tiem}}", { time: "9 am" }), "at {{tiem}}");
  });

  it("substitutes a value that is genuinely blank", () => {
    assert.equal(fillTemplate("at {{location}}.", { location: "" }), "at .");
  });
});
