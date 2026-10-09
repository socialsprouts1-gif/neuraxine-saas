// The booking conversation, as a decision rather than as messages.
//
// Three questions — what, which day, what time — and the answers arrive as
// interactive replies whose ids we chose ourselves. Working out what a reply
// means, what to ask next, and what to say is separable from sending it, and
// separating it is what makes the whole flow testable without a WhatsApp
// number.
//
// Pure by design: no fetch, no env, no server-only. The sending half is in
// appointment-bot.ts.

// Relative and with the extension, as tests/ does: Node's type stripping
// resolves imports literally and knows nothing about the "@/" path alias, so
// a value import through the alias would make this module untestable.
import { availableDates, durationLabel, type Slot } from "./appointments.ts";

/** Every id we put on a button or list row starts with this. */
export const BOOKING_PREFIX = "appt";

export const MAX_LIST_ROWS = 10;
/** Meta's cap on a list row title. */
const MAX_ROW_TITLE = 24;
const MAX_ROW_DESCRIPTION = 72;

export interface BookableType {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
}

export type BookingStep = "type" | "date" | "time";

export interface BookingSession {
  step: BookingStep;
  typeId: string | null;
  date: string | null;
}

/** What the customer just did, read off the reply. */
export type BookingIntent =
  | { kind: "start" }
  | { kind: "type"; typeId: string }
  | { kind: "date"; date: string }
  /** "Another day" — go back to the day menu without losing the service. */
  | { kind: "dates" }
  | { kind: "time"; startsAt: string }
  | { kind: "cancel" }
  | { kind: "none" };

/**
 * Reads an inbound reply.
 *
 * A tapped row arrives as an id we minted; typed text is only ever read as
 * a trigger or a cancellation, never as a date. People write dates in a
 * dozen formats and guessing wrong books the wrong day.
 */
export function readIntent(args: {
  text: string;
  buttonId: string | null;
  keywords: string[];
  /** True when a booking is already in progress on this conversation. */
  inSession: boolean;
}): BookingIntent {
  const id = args.buttonId ?? "";
  if (id.startsWith(`${BOOKING_PREFIX}:`)) {
    const [, action, ...rest] = id.split(":");
    const value = rest.join(":");
    if (action === "type" && value) return { kind: "type", typeId: value };
    if (action === "date" && value) return { kind: "date", date: value };
    if (action === "dates") return { kind: "dates" };
    if (action === "time" && value) return { kind: "time", startsAt: value };
    if (action === "cancel") return { kind: "cancel" };
    if (action === "start") return { kind: "start" };
    return { kind: "none" };
  }

  const words: string[] = args.text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0) return { kind: "none" };

  // Cancelling only means anything mid-booking. Outside one, "cancel" is
  // just as likely to be about an order.
  if (args.inSession && (words.includes("cancel") || words.includes("stop"))) {
    return { kind: "cancel" };
  }

  // Whole words: "book" must not fire on "bookkeeping", and a keyword
  // buried in a sentence is still a request to book.
  const wanted = new Set(
    args.keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean)
  );
  if (words.some((word) => wanted.has(word))) return { kind: "start" };

  return { kind: "none" };
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface BookingPrompt {
  body: string;
  buttonText: string;
  sections: Array<{ title: string; rows: ListRow[] }>;
}

/** What a message looks like when there is nothing to choose from. */
export interface BookingMessage {
  body: string;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** "₹500" — only shown when a service is actually priced. */
function priceLabel(priceCents: number, currency = "INR"): string | null {
  if (priceCents <= 0) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

/**
 * The "what would you like to book?" menu.
 *
 * A list rather than buttons even for two services: buttons cap at three
 * and cannot carry a description, and the length and price are what a
 * customer is choosing on.
 */
export function typePrompt(greeting: string, types: BookableType[]): BookingPrompt {
  const rows: ListRow[] = types.slice(0, MAX_LIST_ROWS - 1).map((type) => {
    const price = priceLabel(type.priceCents);
    const detail = [durationLabel(type.durationMinutes), price, type.description]
      .filter(Boolean)
      .join(" · ");
    return {
      id: `${BOOKING_PREFIX}:type:${type.id}`,
      title: clip(type.name, MAX_ROW_TITLE),
      description: clip(detail, MAX_ROW_DESCRIPTION),
    };
  });

  return {
    body: greeting,
    buttonText: "Choose",
    sections: [
      { title: "Available", rows },
      { title: "Or", rows: [{ id: `${BOOKING_PREFIX}:cancel`, title: "Not now" }] },
    ],
  };
}

/**
 * The "which day?" menu.
 *
 * Only days with something free are offered, so a customer is never shown a
 * date that then turns out to have no times on it.
 */
export function datePrompt(slots: Slot[], typeName: string | null): BookingPrompt {
  const days = availableDates(slots).slice(0, MAX_LIST_ROWS - 1);

  return {
    body: typeName
      ? `${typeName} — which day suits you?`
      : "Which day suits you?",
    buttonText: "Pick a day",
    sections: [
      {
        title: "Next available",
        rows: days.map((day) => ({
          id: `${BOOKING_PREFIX}:date:${day.date}`,
          title: clip(day.label, MAX_ROW_TITLE),
          description: `${day.count} ${day.count === 1 ? "time" : "times"} free`,
        })),
      },
      { title: "Or", rows: [{ id: `${BOOKING_PREFIX}:cancel`, title: "Not now" }] },
    ],
  };
}

/**
 * The "what time?" menu for one day.
 *
 * Nine times plus a way back, because ten rows is the whole list and a
 * customer stuck on a fully-booked-looking day with no way out will just
 * stop replying.
 */
export function timePrompt(slots: Slot[], dateLabel: string): BookingPrompt {
  const times = slots.slice(0, MAX_LIST_ROWS - 2);

  return {
    body: `${dateLabel} — what time works?`,
    buttonText: "Pick a time",
    sections: [
      {
        title: clip(dateLabel, MAX_ROW_TITLE),
        rows: times.map((slot) => ({
          id: `${BOOKING_PREFIX}:time:${slot.startsAt}`,
          title: clip(slot.timeLabel, MAX_ROW_TITLE),
        })),
      },
      {
        title: "Or",
        rows: [
          { id: `${BOOKING_PREFIX}:dates`, title: "Another day" },
          { id: `${BOOKING_PREFIX}:cancel`, title: "Not now" },
        ],
      },
    ],
  };
}

/**
 * Fills the placeholders in the confirmation the business wrote.
 *
 * Unknown placeholders are left alone rather than blanked: a typo should
 * show as `{{ date }}` in the message, which somebody will notice and fix,
 * rather than as a gap nobody can explain.
 */
export function fillTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, key: string) => {
    const value = values[key.toLowerCase()];
    return value === undefined ? whole : value;
  });
}

/** Strips the rows a list may not have: none, or more than ten across all. */
export function prunePrompt(prompt: BookingPrompt): BookingPrompt {
  let remaining = MAX_LIST_ROWS;
  const sections = prompt.sections
    .map((section) => {
      const rows = section.rows.slice(0, Math.max(0, remaining));
      remaining -= rows.length;
      return { ...section, rows };
    })
    .filter((section) => section.rows.length > 0);

  return { ...prompt, sections };
}

/** True when a prompt has nothing for the customer to choose. */
export function isEmptyPrompt(prompt: BookingPrompt): boolean {
  // The "Not now" row is always there, so a prompt whose only rows are the
  // escape hatch is empty as far as the customer is concerned.
  return prompt.sections.every((section) =>
    section.rows.every((row) => row.id.startsWith(`${BOOKING_PREFIX}:cancel`))
  );
}
