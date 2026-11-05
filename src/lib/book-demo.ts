// Where "Book a demo" goes.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// It was "Watch Demo", pointing at an anchor further down the same page —
// a button that promised a video and delivered a scroll. Booking is the
// thing the business actually wants from that click, so the button asks
// for it, and it works whether or not a calendar is connected:
//
//   a booking page is configured  -> open it
//   nothing configured            -> open WhatsApp, ready to ask
//
// The fallback is the right one for a product that sells WhatsApp
// automation. A demo that starts in the channel the product is about is
// not a second-best option; it is the demo.

import { whatsappHref } from "./whatsapp-link.ts";

export const DEMO_PREFILL = "Hi! I'd like to book a demo of NeuraChat.";

export type DemoTarget =
  | { kind: "booking"; href: string }
  | { kind: "whatsapp"; href: string }
  | { kind: "none" };

/**
 * Only https, and only a real host.
 *
 * A booking link is rendered as a target="_blank" anchor, so a
 * javascript: or data: URL typed into the admin field would run in the
 * visitor's page. http:// is refused too — a calendar page collecting
 * somebody's name and email over plain text is not one to send people to.
 */
export function bookingUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null;

  return url.toString();
}

/**
 * Resolves the button's destination from what is configured.
 *
 * "none" rather than a dead link when there is neither a booking page nor
 * a usable number — a button that opens nothing is worse than no button,
 * and the caller renders nothing instead.
 */
export function demoTarget(input: {
  demoUrl?: string | null;
  whatsappNumber?: string | null;
  message?: string;
}): DemoTarget {
  const booking = bookingUrl(input.demoUrl);
  if (booking) return { kind: "booking", href: booking };

  const wa = whatsappHref(input.whatsappNumber ?? "", input.message ?? DEMO_PREFILL);
  if (wa) return { kind: "whatsapp", href: wa };

  return { kind: "none" };
}

/** What to say under the button, so the click holds no surprise. */
export function demoHint(target: DemoTarget): string {
  if (target.kind === "booking") return "Pick a time that suits you";
  if (target.kind === "whatsapp") return "Opens WhatsApp — we'll find a time";
  return "";
}
