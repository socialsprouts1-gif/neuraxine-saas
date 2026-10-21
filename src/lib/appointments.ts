// Working out when a business is free.
//
// The rules are simple to state and easy to get wrong: a weekly pattern of
// opening windows, in the business's own timezone, minus what is already
// booked, minus blackout dates, minus anything too soon to be worth
// offering. Every one of those has a way of producing a slot that looks
// plausible and is not — an hour that does not exist on the morning the
// clocks go forward, a slot offered at 9:00 for a booking made at 8:58, two
// customers sent the same time because nothing checked what was taken.
//
// So it lives here, on its own, with no database and no network, and it is
// tested. The chat side is in appointment-bot.ts.

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

/** One opening window, as "HH:MM" in the business's timezone. */
export interface Window {
  start: string;
  end: string;
}

export type WeeklyHours = Record<Weekday, Window[]>;

export interface AppointmentSettings {
  timezone: string;
  /** How far apart the offered start times are, in minutes. */
  slotMinutes: number;
  /** Padding after each booking, so back-to-back appointments have a gap. */
  bufferMinutes: number;
  /** Nothing is offered sooner than this from now. */
  minNoticeMinutes: number;
  /** How many days ahead to look. */
  horizonDays: number;
  /** How many bookings may share one start time. */
  maxPerSlot: number;
  hours: WeeklyHours;
}

export interface Booked {
  /** ISO instant. */
  startsAt: string;
  durationMinutes: number;
}

export interface Blackout {
  startsAt: string;
  endsAt: string;
}

export interface Slot {
  /** ISO instant, which is what goes in the database. */
  startsAt: string;
  /** "10:30 am", in the business's timezone. */
  timeLabel: string;
  /** "2026-09-11", in the business's timezone — how days are grouped. */
  date: string;
  /** "Thu 11 Sep", in the business's timezone. */
  dateLabel: string;
}

export const DEFAULT_HOURS: WeeklyHours = {
  sun: [],
  mon: [{ start: "09:00", end: "18:00" }],
  tue: [{ start: "09:00", end: "18:00" }],
  wed: [{ start: "09:00", end: "18:00" }],
  thu: [{ start: "09:00", end: "18:00" }],
  fri: [{ start: "09:00", end: "18:00" }],
  sat: [{ start: "09:00", end: "14:00" }],
};

export const DEFAULT_SETTINGS: AppointmentSettings = {
  timezone: "Asia/Kolkata",
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 60,
  horizonDays: 14,
  maxPerSlot: 1,
  hours: DEFAULT_HOURS,
};

const MINUTE = 60_000;

// ------------------------------------------------------------- timezones

/**
 * How far ahead of UTC the zone is at that instant, in minutes.
 *
 * Formatting the instant in the zone and reading it back as if it were UTC
 * gives the offset, which is the only way to get it without shipping a
 * timezone database. Intl already has one.
 */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  // Midnight comes back as hour 24 in some environments, which Date.UTC
  // rolls into the next day and would put the offset out by exactly a day.
  const hour = read("hour") % 24;

  const asIfUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    hour,
    read("minute"),
    read("second")
  );
  return (asIfUtc - instant.getTime()) / MINUTE;
}

/**
 * The instant at which the clock in `timeZone` reads that local time.
 *
 * Two passes. The first guesses the offset from the naive instant, the
 * second corrects it using the offset actually in force at the result — the
 * two differ only across a DST boundary, which is exactly where a one-pass
 * conversion silently lands an hour out.
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const first = naive - offsetMinutes(new Date(naive), timeZone) * MINUTE;
  const second = naive - offsetMinutes(new Date(first), timeZone) * MINUTE;
  return new Date(second);
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  weekday: Weekday;
  hour: number;
  minute: number;
}

/** What the clock and calendar in `timeZone` read at that instant. */
export function utcToZoned(instant: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = read("weekday").slice(0, 3).toLowerCase() as Weekday;

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    weekday: WEEKDAYS.includes(weekday) ? weekday : "mon",
    hour: Number(read("hour")) % 24,
    minute: Number(read("minute")),
  };
}

/** "2026-09-11" for that instant, in that zone. */
export function zonedDateKey(instant: Date, timeZone: string): string {
  const { year, month, day } = utcToZoned(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "Thu 11 Sep" for that instant, in that zone. */
export function zonedDateLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
}

/** "10:30 am" for that instant, in that zone. */
export function zonedTimeLabel(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(instant)
    .toLowerCase();
}

// ----------------------------------------------------------------- hours

/** "09:30" as minutes past midnight, or null if it is not a time at all. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Minutes past midnight back as "09:30". */
export function formatClock(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/**
 * Reads whatever is stored in the hours column into a usable week.
 *
 * The column is jsonb and was written by a form, so it can be anything.
 * A day that will not parse becomes closed rather than throwing: a bad
 * Tuesday should cost you Tuesday, not the whole booking system.
 */
export function readHours(value: unknown): WeeklyHours {
  const source = (value ?? {}) as Record<string, unknown>;
  const week = {} as WeeklyHours;

  for (const day of WEEKDAYS) {
    const raw = source[day];
    if (!Array.isArray(raw)) {
      week[day] = [];
      continue;
    }
    week[day] = raw
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const { start, end } = entry as { start?: unknown; end?: unknown };
        if (typeof start !== "string" || typeof end !== "string") return null;
        const from = parseClock(start);
        const to = parseClock(end);
        if (from === null || to === null || to <= from) return null;
        return { start: formatClock(from), end: formatClock(to) };
      })
      .filter((window): window is Window => window !== null)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  return week;
}

/** True when the week has no opening hours at all. */
export function isClosedAllWeek(hours: WeeklyHours): boolean {
  return WEEKDAYS.every((day) => hours[day].length === 0);
}

// ------------------------------------------------------------ generation

function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && startB < endA;
}

/**
 * The times a customer can be offered.
 *
 * `now` is a parameter rather than read from the clock so this is testable
 * and so a caller can generate the same list twice — the chat flow shows a
 * list and then has to recognise what came back from it.
 */
export function generateSlots(args: {
  settings: AppointmentSettings;
  /** The chosen service's length. Falls back to the slot length. */
  durationMinutes?: number;
  now: Date;
  booked?: Booked[];
  blackouts?: Blackout[];
  /** Stop after this many, so a long horizon cannot produce thousands. */
  limit?: number;
  /** Only slots on this date, "YYYY-MM-DD" in the business timezone. */
  onlyDate?: string;
}): Slot[] {
  const { settings, now } = args;
  const duration = Math.max(5, args.durationMinutes ?? settings.slotMinutes);
  const step = Math.max(5, settings.slotMinutes) + Math.max(0, settings.bufferMinutes);
  const limit = args.limit ?? 500;
  const earliest = now.getTime() + Math.max(0, settings.minNoticeMinutes) * MINUTE;

  const booked = (args.booked ?? []).map((entry) => {
    const start = new Date(entry.startsAt).getTime();
    return { start, end: start + Math.max(5, entry.durationMinutes) * MINUTE };
  });
  const blackouts = (args.blackouts ?? []).map((entry) => ({
    start: new Date(entry.startsAt).getTime(),
    end: new Date(entry.endsAt).getTime(),
  }));

  const slots: Slot[] = [];
  const horizon = Math.max(1, Math.min(120, settings.horizonDays));

  for (let dayOffset = 0; dayOffset < horizon && slots.length < limit; dayOffset += 1) {
    // Step a day at a time from the current instant and read the local date
    // back, rather than doing calendar arithmetic ourselves — this is what
    // makes a DST day 23 or 25 hours long without any special case.
    const cursorDay = new Date(now.getTime() + dayOffset * 24 * 60 * MINUTE);
    const local = utcToZoned(cursorDay, settings.timezone);
    const dateKey = zonedDateKey(cursorDay, settings.timezone);
    if (args.onlyDate && dateKey !== args.onlyDate) continue;

    for (const window of settings.hours[local.weekday] ?? []) {
      const opens = parseClock(window.start);
      const closes = parseClock(window.end);
      if (opens === null || closes === null) continue;

      for (let minute = opens; minute + duration <= closes; minute += step) {
        if (slots.length >= limit) break;

        const startsAt = zonedToUtc(
          local.year,
          local.month,
          local.day,
          Math.floor(minute / 60),
          minute % 60,
          settings.timezone
        );
        const start = startsAt.getTime();
        const end = start + duration * MINUTE;

        if (start < earliest) continue;
        if (blackouts.some((out) => overlaps(start, end, out.start, out.end))) continue;

        const taken = booked.filter((entry) => overlaps(start, end, entry.start, entry.end)).length;
        if (taken >= Math.max(1, settings.maxPerSlot)) continue;

        slots.push({
          startsAt: startsAt.toISOString(),
          timeLabel: zonedTimeLabel(startsAt, settings.timezone),
          date: zonedDateKey(startsAt, settings.timezone),
          dateLabel: zonedDateLabel(startsAt, settings.timezone),
        });
      }
    }
  }

  // Windows within a day are already sorted, but a day is generated from the
  // local date at the cursor and a slot can land on the next one, so sort
  // once at the end rather than trusting the order they were produced in.
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The distinct dates that have at least one free slot, in order. */
export function availableDates(slots: Slot[]): Array<{ date: string; label: string; count: number }> {
  const byDate = new Map<string, { date: string; label: string; count: number }>();
  for (const slot of slots) {
    const entry = byDate.get(slot.date);
    if (entry) entry.count += 1;
    else byDate.set(slot.date, { date: slot.date, label: slot.dateLabel, count: 1 });
  }
  return [...byDate.values()];
}

/**
 * Reads the settings row, defaults where a column is missing.
 *
 * Same contract as the site content loader: an unmigrated or half-filled
 * row has to produce a working configuration rather than a crash on the
 * webhook path.
 */
export function readSettings(row: Record<string, unknown> | null | undefined): AppointmentSettings {
  if (!row) return DEFAULT_SETTINGS;

  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = row[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.round(value)));
  };

  const timezone = typeof row.timezone === "string" && row.timezone.trim() ? row.timezone : DEFAULT_SETTINGS.timezone;

  return {
    // A timezone the runtime does not recognise would throw inside Intl on
    // every slot, so it is checked once here instead.
    timezone: isValidTimeZone(timezone) ? timezone : DEFAULT_SETTINGS.timezone,
    slotMinutes: number("slot_minutes", 30, 5, 480),
    bufferMinutes: number("buffer_minutes", 0, 0, 240),
    minNoticeMinutes: number("min_notice_minutes", 60, 0, 20160),
    horizonDays: number("horizon_days", 14, 1, 120),
    maxPerSlot: number("max_per_slot", 1, 1, 100),
    hours: readHours(row.hours),
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** "30 min", "1 hr", "1 hr 30 min" — for a service's length on a menu. */
export function durationLabel(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}
