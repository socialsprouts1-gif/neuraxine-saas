// Which of several automations on one number actually answers.
//
// Pure, so the screen and the matcher cannot drift apart about it.
//
// The product deliberately allows a chatbot and an assistant on the same
// number — that pairing is the whole design, the bot taking the keywords
// it was written for and the assistant catching everything else. What it
// does not stop is two of the *same kind* claiming one number, and there
// only one of them ever replies. Nothing said so, so the other looked
// switched on and did nothing.

export interface Claimant {
  id: string;
  name: string;
  /** null means "any number". */
  connectionId: string | null;
  createdAt?: string | null;
  isActive: boolean;
}

export interface Conflict {
  /** null for the "any number" group. */
  connectionId: string | null;
  /** The one that replies. */
  answering: Claimant;
  /** Switched on, and never reached. */
  shadowed: Claimant[];
}

/**
 * The same order the matcher uses: pinned to a number first, then oldest.
 *
 * Duplicated deliberately rather than imported — reply-matcher works on
 * database rows and this works on whatever a screen has to hand, and
 * tying the two together would mean a page importing the message runner's
 * types to render a warning. The rule is three lines; the tests either
 * side of it are what keep them honest.
 */
function order(rows: readonly Claimant[]): Claimant[] {
  const pinned = (row: Claimant) => (row.connectionId ? 0 : 1);
  return [...rows].sort(
    (a, b) => pinned(a) - pinned(b) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );
}

/**
 * Groups of two or more live things claiming one number.
 *
 * Only exact collisions. A catch-all sitting under a pinned one is not a
 * conflict — it still answers on every other number, and calling that a
 * problem would put a warning on the most ordinary setup there is.
 */
export function conflicts(rows: readonly Claimant[]): Conflict[] {
  const live = rows.filter((row) => row.isActive);
  const groups = new Map<string, Claimant[]>();

  for (const row of live) {
    const key = row.connectionId ?? "";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const out: Conflict[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [answering, ...shadowed] = order(group);
    out.push({ connectionId: key || null, answering, shadowed });
  }

  // Stable for rendering: the "any number" group last.
  return out.sort((a, b) => (a.connectionId ? 0 : 1) - (b.connectionId ? 0 : 1));
}

/** One sentence for the screen. */
export function describeConflict(conflict: Conflict, numberLabel: string): string {
  const names = conflict.shadowed.map((row) => `“${row.name}”`).join(", ");
  const plural = conflict.shadowed.length === 1 ? "is" : "are";
  return `${numberLabel}: “${conflict.answering.name}” answers. ${names} ${plural} switched on but never reached.`;
}
