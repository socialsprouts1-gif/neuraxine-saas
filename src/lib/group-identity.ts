// What a group looks like, and who in it matters.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Two things people ask for the moment they see a Groups page, because
// WhatsApp has both: a picture, and admins.
//
// The picture is easy and worth having — a wall of identically grey rows
// is hard to scan, and a shop owner who runs "Dealers", "Society A" and
// "Walk-ins" recognises a logo faster than a name.
//
// Admins need honesty. A group here is a list of customers, not a
// WhatsApp group, so nobody can administer it in WhatsApp's sense —
// there is nothing to administer, and Meta's Cloud API has no group
// endpoints at all. What is genuinely useful is marking the one or two
// people who speak for the rest: the owner in a dealer group, the
// secretary on a society committee. Those are the people you tell first
// and the people you tell separately. So an admin here is a key contact:
// pinned to the top of the list, counted on its own, and available as an
// audience of its own when sending.

export const GROUP_ROLES = ["admin", "member"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export function isGroupRole(value: unknown): value is GroupRole {
  return typeof value === "string" && (GROUP_ROLES as readonly string[]).includes(value);
}

/** Anything unrecognised is an ordinary member. Never the other way round. */
export function readRole(value: unknown): GroupRole {
  return isGroupRole(value) ? value : "member";
}

/** What the badge means, said in the one place it is said. */
export function describeRole(role: GroupRole): string {
  return role === "admin"
    ? "Key contact — speaks for the group, and can be messaged on their own."
    : "Ordinary member.";
}

// --- the picture -----------------------------------------------------------

/**
 * A small set rather than a full emoji keyboard.
 *
 * Every one of these reads at 20px on a dark background, which most do
 * not. Anything else can still be typed in, and a real logo can be
 * uploaded — this is the two-click path.
 */
export const GROUP_ICONS = [
  "👥", "🛍️", "🏪", "🏢", "🏠", "🚚", "🧾", "💼",
  "⭐", "🔥", "💎", "🎯", "📣", "🎓", "🩺", "🍽️",
] as const;

export const DEFAULT_ICON = "👥";

/**
 * An icon is an emoji, not text.
 *
 * ASCII is refused outright: "VIP" typed into an icon box renders as
 * three cramped letters in a 40px tile and looks like a bug. Initials are
 * the fallback when there is no icon, and they are derived from the name
 * rather than typed.
 */
export function checkIcon(
  raw: string
): { ok: true; icon: string | null } | { ok: false; error: string } {
  const icon = raw.trim();
  if (!icon) return { ok: true, icon: null };

  // Generous: a family emoji is several code points joined by zero-width
  // joiners, and a flag is two regional indicators.
  if ([...icon].length > 8) {
    return { ok: false, error: "That is too long for an icon. Pick one emoji." };
  }

  if (/[\u0000-\u007F]/.test(icon)) {
    return { ok: false, error: "An icon has to be an emoji. For letters, the initials are used automatically." };
  }

  return { ok: true, icon };
}

/**
 * Up to two letters, for a group with no icon and no logo.
 *
 * Words first, so "Wholesale Buyers" is WB rather than WH.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  const letters =
    words.length === 1
      ? [...words[0]].slice(0, 2)
      : [[...words[0]][0], [...words[words.length - 1]][0]];

  return letters.join("").toUpperCase();
}

/**
 * A logo lives at a URL, and that URL ends up in an <img src>.
 *
 * https only. `javascript:` and `data:` are the two that matter — one
 * executes, and the other is a way to smuggle markup past a reviewer —
 * and neither has an honest use here.
 */
export function checkLogoUrl(
  raw: string
): { ok: true; url: string | null } | { ok: false; error: string } {
  const url = raw.trim();
  if (!url) return { ok: true, url: null };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "That is not a web address. It should start with https://" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "The logo has to be an https:// address." };
  }

  return { ok: true, url: parsed.toString() };
}

// --- who to send to --------------------------------------------------------

export const AUDIENCES = ["everyone", "admins"] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Unrecognised means everyone: the narrower choice is never the accident. */
export function readAudience(value: unknown): Audience {
  return value === "admins" ? "admins" : "everyone";
}

export function filterAudience<T extends { role: GroupRole }>(
  members: readonly T[],
  audience: Audience
): T[] {
  return audience === "admins" ? members.filter((m) => m.role === "admin") : [...members];
}

/**
 * The line above the Send button.
 *
 * Counts, because "Admins only" over a group whose admins were never
 * marked sends to nobody, and finding that out from a result is a worse
 * way to find it out.
 */
export function describeAudience(audience: Audience, admins: number, total: number): string {
  if (audience === "admins") {
    if (admins === 0) {
      return "Nobody is marked as a key contact yet, so this would go to nobody. Mark someone in the member list first.";
    }
    return `Goes to the ${admins} key contact${admins === 1 ? "" : "s"} only.`;
  }
  return `Goes to all ${total} member${total === 1 ? "" : "s"}, each as their own message.`;
}

/**
 * Admins first, then by name.
 *
 * The people who speak for the group are the ones being looked for, and
 * in a list of two hundred they should not need scrolling to.
 */
export function sortMembers<T extends { role: GroupRole; name: string | null; waId: string }>(
  members: readonly T[]
): T[] {
  return [...members].sort((left, right) => {
    if (left.role !== right.role) return left.role === "admin" ? -1 : 1;
    return (left.name || left.waId).localeCompare(right.name || right.waId, "en");
  });
}

/**
 * The group's colour at a given opacity, as a hex string.
 *
 * Used for the tile behind an icon or initials. Done here rather than
 * with CSS colour-mix so an unexpected value — a named colour, a stored
 * empty string, an old row — produces something that renders rather than
 * an invalid declaration the browser drops, taking the tile with it.
 */
export function withAlpha(colour: string, alpha: number): string {
  const hex = colour.trim();
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#00FF87";
  const step = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${safe}${step}`;
}
