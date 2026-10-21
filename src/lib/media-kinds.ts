// What WhatsApp will actually accept, per kind of media.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Every one of these limits is Meta's, and every one of them is a refusal
// rather than a warning: a 20MB video, an .mkv, a caption on an audio file
// — each comes back as a 400 that names a code and not a reason, after the
// customer has already been told the thing was sent.
//
// The voice-note distinction is the one that surprises people. There is no
// flag for it. WhatsApp renders an OGG/OPUS file as a voice note with a
// waveform and a play head, and renders the same recording as an MP3 as a
// file attachment with a paperclip. The format *is* the setting, so the
// editor says so rather than offering a toggle that does nothing.

export type MediaKind = "image" | "video" | "audio" | "document";

export interface MediaRule {
  kind: MediaKind;
  label: string;
  /** Extensions, lower case, without the dot. */
  formats: string[];
  /** Meta's ceiling, in megabytes. */
  maxMb: number;
  /** Whether a caption is allowed. Audio is the one that is not. */
  caption: boolean;
  /** Whether a filename is allowed. Documents only. */
  filename: boolean;
}

export const MEDIA_RULES: MediaRule[] = [
  {
    kind: "image",
    label: "Image",
    formats: ["jpg", "jpeg", "png"],
    maxMb: 5,
    caption: true,
    filename: false,
  },
  {
    kind: "video",
    label: "Video",
    // Meta accepts 3GPP and MP4 only, and the MP4 has to be H.264 with AAC
    // audio. A .mov renamed to .mp4 is still refused.
    formats: ["mp4", "3gp"],
    maxMb: 16,
    caption: true,
    filename: false,
  },
  {
    kind: "audio",
    label: "Audio",
    formats: ["aac", "amr", "mp3", "m4a", "ogg", "opus"],
    maxMb: 16,
    // Not a style choice: WhatsApp refuses the message outright if one is
    // sent, because an audio bubble has nowhere to draw it.
    caption: false,
    filename: false,
  },
  {
    kind: "document",
    label: "Document",
    formats: ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt"],
    maxMb: 100,
    caption: true,
    filename: true,
  },
];

export function mediaRule(kind: string): MediaRule {
  return MEDIA_RULES.find((rule) => rule.kind === kind) ?? MEDIA_RULES[0];
}

/**
 * The two ways an audio file arrives on somebody's phone.
 *
 * Not a setting that is sent anywhere — the format decides it. Named here
 * because "upload an OGG and it becomes a voice note" is the kind of thing
 * that has to be written down somewhere a person will read it.
 */
export const VOICE_NOTE_FORMATS = ["ogg", "opus"] as const;

export function isVoiceNote(url: string): boolean {
  return VOICE_NOTE_FORMATS.includes(extensionOf(url) as (typeof VOICE_NOTE_FORMATS)[number]);
}

/**
 * The extension of a URL, lower case and without the dot or query string.
 *
 * Only the last path segment is looked at. Searching the whole URL for a
 * dot finds the one in the hostname, so "https://x.com/song" reads as an
 * extension of "com/song" — which then fails the format check with a
 * message about a file type nobody typed.
 */
export function extensionOf(url: string): string {
  const path = String(url ?? "")
    .split(/[?#]/)[0]
    .trim();
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  if (dot <= 0 || dot === file.length - 1) return "";
  return file.slice(dot + 1).toLowerCase();
}

/**
 * Why this URL cannot be sent as this kind of media, or null when it can.
 *
 * Checked before the send rather than after, because the refusal that
 * comes back from Meta names a numeric code and not a file — and by then
 * the bot has already moved on to its next node.
 */
export function mediaProblem(kind: string, url: string): string | null {
  const link = String(url ?? "").trim();
  if (!link) return "Give the file's URL.";

  if (!/^https:\/\//i.test(link)) {
    return "The URL has to start with https:// — WhatsApp will not fetch anything else.";
  }

  // A sharing page is not a file. This is the single most common cause of
  // "format mismatch" from Meta: the link is to a web page that happens to
  // show a file, and what WhatsApp downloads is HTML.
  if (/drive\.google\.com|dropbox\.com\/s\/|onedrive\.live\.com|docs\.google\.com/i.test(link)) {
    return "That is a sharing page, not a file. WhatsApp downloads it and gets a web page — use a direct link that ends in the file's extension.";
  }

  const rule = mediaRule(kind);
  const extension = extensionOf(link);

  if (!extension) {
    return `The URL has to end in the file's extension — ${rule.formats.join(", ")} for ${rule.label.toLowerCase()}.`;
  }

  if (!rule.formats.includes(extension)) {
    return `WhatsApp does not accept .${extension} as ${rule.label.toLowerCase()}. It takes ${rule.formats
      .map((format) => `.${format}`)
      .join(", ")}.`;
  }

  return null;
}

/** The sentence under the URL box, saying what will fit. */
export function mediaHint(kind: string): string {
  const rule = mediaRule(kind);
  const formats = rule.formats.map((format) => format.toUpperCase()).join(", ");
  const base = `${formats} · up to ${rule.maxMb} MB`;

  if (rule.kind === "audio") {
    return `${base}. An OGG or OPUS file arrives as a voice note with a waveform; anything else arrives as an audio file.`;
  }
  if (!rule.caption) return base;
  return base;
}

// --- a place on a map ------------------------------------------------------

export interface LocationFields {
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}

/**
 * Whether a pin can be sent, and why not.
 *
 * Latitude and longitude are the whole message — the name and the address
 * are labels drawn on the card. Sending 0,0 because somebody left the
 * boxes empty puts a customer in the Atlantic, so an empty box is refused
 * rather than defaulted.
 */
export function locationProblem(input: {
  latitude: unknown;
  longitude: unknown;
}): string | null {
  // An empty box is not zero. Number("") is 0, which is finite and which is
  // a real place in the Atlantic — so the emptiness is checked before the
  // conversion rather than after it.
  const latitude = numberOrNull(input?.latitude);
  const longitude = numberOrNull(input?.longitude);

  if (latitude === null || longitude === null) {
    return "Give both the latitude and the longitude — they are the message.";
  }
  if (latitude < -90 || latitude > 90) {
    return "Latitude runs from -90 to 90. It may be the wrong way round with the longitude.";
  }
  if (longitude < -180 || longitude > 180) {
    return "Longitude runs from -180 to 180.";
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The coordinates out of a pasted Google Maps URL.
 *
 * Nobody has latitude and longitude to hand; everybody has the link. The
 * two shapes that cover almost every paste are the @lat,lng in a maps URL
 * and the !3dlat!4dlng in a place URL.
 */
export function coordsFromMapsUrl(
  url: string
): { latitude: number; longitude: number } | null {
  const link = String(url ?? "");

  const at = link.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) {
    const latitude = Number(at[1]);
    const longitude = Number(at[2]);
    if (!locationProblem({ latitude, longitude })) return { latitude, longitude };
  }

  const place = link.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (place) {
    const latitude = Number(place[1]);
    const longitude = Number(place[2]);
    if (!locationProblem({ latitude, longitude })) return { latitude, longitude };
  }

  // A bare "lat, lng" pasted out of the Maps search box.
  const pair = link.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (pair) {
    const latitude = Number(pair[1]);
    const longitude = Number(pair[2]);
    if (!locationProblem({ latitude, longitude })) return { latitude, longitude };
  }

  return null;
}
