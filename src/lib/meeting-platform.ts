// Where a meeting happens, and what the customer is told about it.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// The confirmation is the part worth being careful about. It is the only
// message most customers get about a booking, it goes out once, and it
// cannot be corrected afterwards — so what it says has to be right for a
// meeting with a link, one at an address, and one that is just a phone
// call, without three different code paths.

export type MeetingPlatform =
  | "google_meet"
  | "zoom"
  | "calendly"
  | "phone"
  | "in_person"
  | "other";

export const MEETING_PLATFORMS: MeetingPlatform[] = [
  "google_meet",
  "zoom",
  "calendly",
  "phone",
  "in_person",
  "other",
];

export const PLATFORM_LABEL: Record<MeetingPlatform, string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  calendly: "Calendly",
  phone: "Phone call",
  in_person: "In person",
  other: "Somewhere else",
};

/** Which ones are a link somebody joins, rather than a place or a call. */
export const NEEDS_LINK: Record<MeetingPlatform, boolean> = {
  google_meet: true,
  zoom: true,
  calendly: true,
  phone: false,
  in_person: false,
  other: false,
};

export function isMeetingPlatform(value: unknown): value is MeetingPlatform {
  return typeof value === "string" && (MEETING_PLATFORMS as string[]).includes(value);
}

export function readPlatform(value: unknown): MeetingPlatform | null {
  return isMeetingPlatform(value) ? value : null;
}

/**
 * Whether a link is plausible for the platform chosen.
 *
 * Not a guarantee that the meeting exists — nothing here creates one at
 * Google or Zoom. It catches the mistake of picking Google Meet and
 * pasting a Zoom link, or pasting nothing at all, which produces a
 * confirmation telling the customer to join a meeting with no way in.
 */
export function checkLink(
  platform: MeetingPlatform,
  url: string | null | undefined
): { ok: true } | { ok: false; error: string } {
  const link = url?.trim() ?? "";

  if (!NEEDS_LINK[platform]) return { ok: true };
  if (!link) {
    return {
      ok: false,
      error: `A ${PLATFORM_LABEL[platform]} meeting needs a link, or the customer is told to join something with no way in.`,
    };
  }
  if (!/^https:\/\//i.test(link)) {
    return { ok: false, error: "The meeting link has to start with https://" };
  }

  const host: Record<string, RegExp> = {
    google_meet: /(^|\.)meet\.google\.com$/i,
    zoom: /(^|\.)zoom\.(us|com)$/i,
    calendly: /(^|\.)calendly\.com$/i,
  };

  const expected = host[platform];
  if (!expected) return { ok: true };

  try {
    if (!expected.test(new URL(link).hostname)) {
      return {
        ok: false,
        error: `That does not look like a ${PLATFORM_LABEL[platform]} link. Check the platform and the link agree.`,
      };
    }
  } catch {
    return { ok: false, error: "That meeting link is not a valid URL." };
  }

  return { ok: true };
}

export interface ConfirmationInput {
  businessName: string;
  title: string;
  /** Already formatted in the workspace's timezone. */
  whenText: string;
  durationMinutes: number;
  platform: MeetingPlatform | null;
  meetingUrl?: string | null;
  /** Free text: an office address, or whatever was typed. */
  location?: string | null;
}

/**
 * What the customer receives when a meeting is booked.
 *
 * Plain text, because this goes out as a WhatsApp message and not every
 * recipient's client renders formatting the same way. Each line earns its
 * place: what, when, how long, and how to get there — and the last of
 * those is omitted rather than left blank when there is nothing to say.
 */
export function confirmationMessage(input: ConfirmationInput): string {
  const lines = [
    `Your booking with ${input.businessName} is confirmed.`,
    "",
    `*${input.title}*`,
    `${input.whenText} · ${input.durationMinutes} min`,
  ];

  const where = joiningLine(input);
  if (where) lines.push(where);

  lines.push("", "Need to change it? Just reply to this message.");
  return lines.join("\n");
}

/** The same, for a meeting whose time has moved. */
export function rescheduleMessage(input: ConfirmationInput): string {
  const lines = [
    `Your booking with ${input.businessName} has moved.`,
    "",
    `*${input.title}*`,
    `Now: ${input.whenText} · ${input.durationMinutes} min`,
  ];

  const where = joiningLine(input);
  if (where) lines.push(where);

  lines.push("", "Need to change it again? Just reply to this message.");
  return lines.join("\n");
}

/** And for one that is no longer happening. */
export function cancellationMessage(input: Pick<ConfirmationInput, "businessName" | "title" | "whenText">): string {
  return [
    `Your booking with ${input.businessName} has been cancelled.`,
    "",
    `*${input.title}*`,
    input.whenText,
    "",
    "Reply here if you would like to rebook.",
  ].join("\n");
}

function joiningLine(input: ConfirmationInput): string | null {
  const url = input.meetingUrl?.trim();
  const place = input.location?.trim();

  if (input.platform && NEEDS_LINK[input.platform] && url) {
    return `Join on ${PLATFORM_LABEL[input.platform]}: ${url}`;
  }
  if (input.platform === "phone") {
    return place ? `We will call you on ${place}.` : "We will call you at that time.";
  }
  if (place) return `Where: ${place}`;
  if (url) return `Link: ${url}`;
  return null;
}
