// Working-hours evaluation for the AI Assistant's agent rules. Pure, so the
// tests can run it without pulling in server-only modules.

export interface WorkingHoursRule {
  working_hours_enabled: boolean;
  /** IANA zone, e.g. "Asia/Kolkata". */
  working_hours_timezone: string;
  /** 'HH:MM', 24-hour. */
  working_hours_start: string;
  working_hours_end: string;
  /** 0 = Sunday … 6 = Saturday, matching Date#getDay(). */
  working_days: number[];
}

const DAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** 'HH:MM' → minutes since midnight, or null if it isn't a time. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * The wall clock in `timeZone` at `now`. Returns null for a zone the
 * runtime doesn't recognise — a typo in the timezone box must not stop the
 * assistant from replying at all.
 */
export function localClock(
  timeZone: string,
  now: Date
): { day: number; minutes: number } | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return null;
  }

  const find = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = DAY_INDEX[find("weekday")];
  const hours = Number(find("hour"));
  const minutes = Number(find("minute"));

  if (day === undefined || !Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { day, minutes: hours * 60 + minutes };
}

/**
 * Whether the assistant is on duty right now.
 *
 * Open by default: a disabled rule, an unparseable time or an unknown
 * timezone all mean "answer", never "go silent". Silence is the one failure
 * mode a customer messaging a business cannot diagnose.
 */
export function isWithinWorkingHours(rule: WorkingHoursRule, now: Date = new Date()): boolean {
  if (!rule.working_hours_enabled) return true;

  const start = parseClock(rule.working_hours_start);
  const end = parseClock(rule.working_hours_end);
  if (start === null || end === null || start === end) return true;

  const clock = localClock(rule.working_hours_timezone, now);
  if (!clock) return true;

  const days = rule.working_days;
  if (!Array.isArray(days) || days.length === 0) return false;

  if (start < end) {
    return days.includes(clock.day) && clock.minutes >= start && clock.minutes < end;
  }

  // The window wraps midnight (22:00 → 06:00). A shift belongs to the day it
  // opened on, so the small hours are still "Friday night" on a Saturday.
  if (clock.minutes >= start) return days.includes(clock.day);
  if (clock.minutes < end) return days.includes((clock.day + 6) % 7);
  return false;
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The zones offered in the editor, widest coverage per entry. */
export const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
] as const;
