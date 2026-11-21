// Which front door somebody came in through.
//
// Pure: no fetch, no env, no server-only, so the host-matching rules can
// be tested rather than discovered on a live domain at midnight.
//
// Two ways a request names its brand, and the order matters:
//
//   1. A custom domain the agency owns — app.acmeagency.com. Matched
//      exactly, because this is the one the customer sees.
//   2. A subdomain of the platform's own domain — acme.neurachat.in.
//      This exists so a brand works the moment it is created, before
//      anybody has touched DNS, and so there is always a URL to test on
//      if a custom domain is mis-pointed.
//
// Anything else is the platform's own front door, which is the whole of
// the product as it was before any of this existed.

export interface BrandIdentity {
  id: string;
  slug: string;
  domain: string | null;
  name: string;
  nameAccent: string;
  logoUrl: string;
  faviconUrl: string;
  accentHex: string;
  siteTitle: string;
  siteDescription: string;
  supportEmail: string;
  supportWhatsapp: string;
}

/**
 * The hostname, as a lookup key.
 *
 * Lower-cased, the port dropped, a trailing dot dropped, and `www.`
 * dropped — a customer who types www in front of the agency's domain is
 * at the agency's front door, not at a stranger's.
 */
export function hostKey(host: string | null | undefined): string {
  const raw = String(host ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return "";

  // Strip a port, and the brackets an IPv6 literal arrives in.
  const withoutPort = raw.startsWith("[")
    ? (raw.split("]")[0] ?? "").slice(1)
    : (raw.split(":")[0] ?? "");

  const clean = withoutPort.replace(/\.$/, "");
  return clean.startsWith("www.") ? clean.slice(4) : clean;
}

/**
 * The brand slug a platform subdomain names, or null.
 *
 * `acme.neurachat.in` → "acme". The root domain itself, and any `www.`
 * form of it, name no brand: that is the platform's own site.
 *
 * Deeper names are refused rather than guessed at. `a.b.neurachat.in` is
 * not brand "a" — it is a host nobody configured, and treating it as a
 * brand would mean a typo quietly serves somebody else's login page.
 */
export function slugFromHost(host: string, rootDomain: string): string | null {
  const key = hostKey(host);
  const root = hostKey(rootDomain);
  if (!key || !root || key === root) return null;
  if (!key.endsWith(`.${root}`)) return null;

  const label = key.slice(0, -(root.length + 1));
  if (!label || label.includes(".")) return null;

  // The hosts that are the platform itself under another label.
  if (RESERVED_LABELS.has(label)) return null;

  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(label) ? label : null;
}

/**
 * Subdomains that are never a brand.
 *
 * Mostly infrastructure. `app` is in here because a platform that later
 * moves its own dashboard to app.<root> must not find that an agency has
 * taken the name.
 */
export const RESERVED_LABELS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "blog",
  "cdn",
  "dashboard",
  "dev",
  "docs",
  "ftp",
  "help",
  "mail",
  "preview",
  "smtp",
  "staging",
  "static",
  "status",
  "support",
  "test",
  "webhook",
  "webhooks",
  "www",
]);

/** Why this slug cannot be used, or null when it can. */
export function slugProblem(slug: string): string | null {
  const value = String(slug ?? "").trim().toLowerCase();
  if (!value) return "Give the brand a short name for its web address.";
  if (value.length < 3) return "Too short — three characters or more.";
  if (value.length > 40) return "Too long — forty characters or fewer.";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value)) {
    return "Only lowercase letters, numbers and hyphens, starting and ending with a letter or number.";
  }
  if (RESERVED_LABELS.has(value)) return `“${value}” is reserved by the platform.`;
  return null;
}

/**
 * Why this domain cannot be used, or null when it can.
 *
 * A hostname, not a URL. People paste "https://app.acme.com/" and this
 * says so rather than storing something that will never match a request.
 */
export function domainProblem(domain: string): string | null {
  const value = String(domain ?? "").trim();
  if (!value) return null; // A brand without a custom domain is fine.

  if (/^[a-z]+:\/\//i.test(value)) return "Just the domain — no https:// in front.";
  if (value.includes("/")) return "Just the domain — no slashes or path.";
  if (value.includes(":")) return "Just the domain — no port.";
  if (value !== value.trim() || /\s/.test(value)) return "A domain cannot contain spaces.";

  const key = hostKey(value);
  if (!key.includes(".")) return "That is not a full domain — it needs a dot, like app.acme.com.";
  if (!/^[a-z0-9.-]+$/.test(key)) return "A domain can only use letters, numbers, dots and hyphens.";
  if (key.length > 253) return "That domain is too long.";

  return null;
}

/** The brand's wordmark as one string, for a title or an email subject. */
export function wordmark(brand: Pick<BrandIdentity, "name" | "nameAccent">): string {
  return `${brand.name}${brand.nameAccent}`.trim() || brand.name;
}

// --- the agency's colour ---------------------------------------------------
//
// An agency picks one hex. The app needs four values per theme, and the
// ones it needs are not the one they picked: a brand colour used as a
// fill is a different thing from the same colour used as text, and the
// text version has to survive on both a near-black and a white page.
//
// Done by mixing toward white or black until the contrast ratio clears
// 4.5:1 rather than by a fixed percentage. A fixed percentage produces
// unreadable text for exactly the colours people choose most — mid blues
// on dark, yellows on white — and "the buttons are there but you cannot
// read them" is indistinguishable from broken.

type Rgb = { r: number; g: number; b: number };

const NEAR_BLACK: Rgb = { r: 5, g: 5, b: 8 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };
/** The app background in dark mode, which accent text has to sit on. */
const DARK_PAGE: Rgb = { r: 11, g: 11, b: 16 };

export function parseHex(hex: string): Rgb | null {
  const value = String(hex ?? "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return null;
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

/**
 * The colour moved toward `toward` until it reads against `against`.
 *
 * Returns the original when it already clears the bar, and the furthest
 * step when nothing does — a colour that cannot reach 4.5 against either
 * side is better rendered as its closest attempt than silently dropped.
 */
function readable(colour: Rgb, against: Rgb, toward: Rgb, minRatio = 4.5): Rgb {
  if (contrast(colour, against) >= minRatio) return colour;

  let best = colour;
  for (let step = 1; step <= 20; step += 1) {
    best = mix(colour, toward, step / 20);
    if (contrast(best, against) >= minRatio) return best;
  }
  return best;
}

export interface BrandTheme {
  dark: { accent: string; ink: string; strong: string };
  light: { accent: string; ink: string; strong: string };
}

/** The four values each theme needs, derived from the one the agency picked. */
export function brandTheme(hex: string): BrandTheme | null {
  const base = parseHex(hex);
  if (!base) return null;

  return {
    dark: {
      // A fill with near-black text on it.
      accent: toHex(readable(base, NEAR_BLACK, WHITE)),
      // Text on the dark page.
      ink: toHex(readable(base, DARK_PAGE, WHITE)),
      strong: toHex(mix(base, NEAR_BLACK, 0.15)),
    },
    light: {
      accent: toHex(readable(base, NEAR_BLACK, WHITE)),
      // Text on a white page: the hard one, and the reason this exists.
      ink: toHex(readable(base, WHITE, NEAR_BLACK)),
      strong: toHex(mix(readable(base, NEAR_BLACK, WHITE), NEAR_BLACK, 0.12)),
    },
  };
}

/**
 * The theme as a stylesheet, to drop in the document head.
 *
 * Written against the same variable names globals.css uses, and loaded
 * after it, so an agency colour replaces the platform's green everywhere
 * at once rather than in the handful of places somebody remembered.
 */
export function brandThemeCss(hex: string): string {
  const theme = brandTheme(hex);
  if (!theme) return "";

  return `:root{--color-accent:${theme.dark.accent};--color-accent-ink:${theme.dark.ink};--accent:${theme.dark.accent};--accent-ink:${theme.dark.ink};--accent-strong:${theme.dark.strong};--scrollbar:${theme.dark.accent}4D;}
[data-theme="light"]{--color-accent:${theme.light.accent};--color-accent-ink:${theme.light.ink};--accent:${theme.light.accent};--accent-ink:${theme.light.ink};--accent-strong:${theme.light.strong};}`;
}
