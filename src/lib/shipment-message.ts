// A parcel's status, in words a customer can read.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// The integration's own description promises answering "where is my
// order?" without leaving the inbox, and what it actually did was print
// a courier's status string into a toast inside a settings dialog. The
// missing half is this: turning "OUT FOR DELIVERY" into a sentence worth
// sending, and sending it to the person who asked.
//
// Courier status strings are shouty, inconsistent between couriers, and
// occasionally alarming out of context — RTO means the parcel is coming
// back to the seller, which is not something to forward verbatim.

export interface Shipment {
  awb: string;
  status: string;
  courier: string | null;
  lastUpdate: string | null;
  expectedDelivery: string | null;
  trackingUrl: string | null;
}

export type DeliveryState =
  | "delivered"
  | "out_for_delivery"
  | "in_transit"
  | "awaiting_pickup"
  | "returning"
  | "problem"
  | "unknown";

/**
 * Courier wording, sorted into states we can write a sentence for.
 *
 * Matched on substrings because no two couriers agree on the exact
 * phrase, and ordered because "out for delivery" contains "delivery" and
 * would otherwise be read as delivered.
 */
const RULES: Array<[RegExp, DeliveryState]> = [
  [/out for delivery|ofd\b/i, "out_for_delivery"],
  [/rto|return to origin|returning/i, "returning"],
  [/undeliver|exception|failed|lost|damaged|on hold|address issue/i, "problem"],
  [/cancel/i, "problem"],
  [/delivered/i, "delivered"],
  [/pickup|picked up|manifest|awb assigned|new|order placed/i, "awaiting_pickup"],
  [/transit|shipped|dispatch|in ?transit|reached|departed|arrived/i, "in_transit"],
];

export function deliveryState(status: string): DeliveryState {
  const text = status?.trim() ?? "";
  if (!text) return "unknown";

  for (const [pattern, state] of RULES) {
    if (pattern.test(text)) return state;
  }
  return "unknown";
}

/**
 * What to send the customer.
 *
 * Written as the business speaking, not as a courier's scan log. The
 * tracking link goes last when there is one, because a link at the top
 * is what people tap instead of reading.
 */
export function customerMessage(
  shipment: Shipment,
  options: { orderNumber?: string | null } = {}
): string {
  const state = deliveryState(shipment.status);
  const order = options.orderNumber?.trim();
  const what = order ? `order ${order}` : "order";
  const by = shipment.courier ? ` with ${shipment.courier}` : "";

  const opening =
    state === "delivered"
      ? `Your ${what} has been delivered.`
      : state === "out_for_delivery"
        ? `Your ${what} is out for delivery today${by}. Please keep your phone handy.`
        : state === "in_transit"
          ? `Your ${what} is on its way${by}.`
          : state === "awaiting_pickup"
            ? `Your ${what} is packed and waiting to be picked up${by}.`
            : state === "returning"
              ? `Your ${what} is on its way back to us. Please reply here and we will sort it out.`
              : state === "problem"
                ? `There is a problem with your ${what}. Please reply here and we will sort it out.`
                : `Here is the latest on your ${what}: ${shipment.status}.`;

  const lines = [opening];

  // Not repeated for a delivered parcel: an expected date after the fact
  // reads as though something is still coming.
  if (shipment.expectedDelivery && state !== "delivered" && state !== "returning") {
    lines.push(`Expected by ${shipment.expectedDelivery}.`);
  }

  lines.push(`Tracking number: ${shipment.awb}`);
  if (shipment.trackingUrl) lines.push(`Track it here: ${shipment.trackingUrl}`);

  return lines.join("\n");
}

/**
 * A courier's date, written the way a person would say it.
 *
 * Shiprocket hands these back as "2026-09-29 00:00:00" — a SQL datetime
 * with a time that is not a time. Midnight means "that day" and 23:59:59
 * means "by the end of that day"; printing either verbatim puts six
 * meaningless digits in front of the reader and makes the panel look like
 * a database dump. A real time of day is kept, because that one is news.
 *
 * Anything it cannot parse is handed back untouched: an unrecognised
 * format is still better shown than swallowed.
 */
export function courierDate(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (!match) return value;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour ?? 0),
    Number(minute ?? 0),
    Number(second ?? 0)
  );
  if (Number.isNaN(date.getTime())) return value;

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const written = `${date.getDate()} ${MONTHS[date.getMonth()]}`;

  // No time at all, midnight, or one second to midnight: all three mean a
  // day rather than a moment.
  const endOfDay = hour === "23" && minute === "59";
  const startOfDay = !hour || (hour === "00" && minute === "00");
  if (startOfDay || endOfDay) return written;

  const h = date.getHours();
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${written}, ${twelve}:${String(date.getMinutes()).padStart(2, "0")}${suffix}`;
}

/**
 * The same parcel for whoever is looking at the dashboard.
 *
 * Keeps the courier's own words, which the customer message deliberately
 * does not — staff need the raw scan to judge whether to intervene.
 */
export function staffSummary(shipment: Shipment): string {
  return [
    `${shipment.awb}: ${shipment.status}`,
    shipment.courier ? `via ${shipment.courier}` : null,
    shipment.expectedDelivery ? `due ${courierDate(shipment.expectedDelivery)}` : null,
    shipment.lastUpdate,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Whether this is worth telling the customer about unprompted. */
export function worthNotifying(state: DeliveryState): boolean {
  return state === "out_for_delivery" || state === "delivered" || state === "problem";
}
