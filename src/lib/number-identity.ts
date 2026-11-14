// What a WhatsApp number is called, and whether we still need to ask Meta.
//
// Pure on purpose. This is string and clock arithmetic, and it decides
// what an operator reads in every number picker in the app — which is
// exactly the kind of thing that should be testable without a database.

/** The naming fields of a connection. */
export interface NumberIdentity {
  /** "+91 92724 47307" — what Meta reports. Null until Meta has said. */
  displayPhoneNumber: string | null;
  /** The name Meta shows to customers. */
  verifiedName: string | null;
  /** The operator's own name for it: "Support", "Sales". */
  label: string | null;
}

/**
 * What to show when Meta has not told us the number yet.
 *
 * Never the phone_number_id. It is fifteen digits that look like a phone
 * number, belong to no phone, and cannot be dialled, searched for, or
 * recognised by the person who owns the number — a picker offering two of
 * them is asking someone to choose between numbers they cannot tell
 * apart. This says the true thing instead, and names the fix.
 */
export const NUMBER_PENDING = "Number not synced yet";

function nameOf(identity: NumberIdentity): string | null {
  return identity.label?.trim() || identity.verifiedName?.trim() || null;
}

function numberOf(identity: NumberIdentity): string | null {
  return identity.displayPhoneNumber?.trim() || null;
}

/** The short form for a picker option: "Support · +91 92724 47307". */
export function optionLabel(identity: NumberIdentity): string {
  const number = numberOf(identity);
  const name = nameOf(identity);
  if (name && number) return `${name} · ${number}`;
  return number ?? name ?? NUMBER_PENDING;
}

/** The long form for a sentence: "Support (+91 92724 47307)". */
export function describe(identity: NumberIdentity): string {
  const number = numberOf(identity);
  const name = nameOf(identity);
  if (name && number) return `${name} (${number})`;
  return number ?? name ?? NUMBER_PENDING;
}

// --- healing the rows that have no number on them -------------------------

/** How long to wait before asking Meta again about a number it did not describe. */
export const NUMBER_SYNC_COOLDOWN_MS = 60 * 60 * 1000;

/** At most this many Meta round-trips on one page render. */
export const NUMBER_SYNC_BATCH = 5;

export interface SyncCandidate extends NumberIdentity {
  id: string;
  lastCheckedAt: string | null;
}

/**
 * Which connections are worth asking Meta about right now.
 *
 * Bounded three ways, because this runs on a page render: only rows with
 * no number at all, only rows not asked about in the last hour, and never
 * more than a handful at once. A number that Meta will never describe
 * therefore costs one call an hour, not one call per page view.
 */
export function needsNumberSync<T extends SyncCandidate>(
  connections: readonly T[],
  now: number = Date.now()
): T[] {
  const due: T[] = [];
  for (const connection of connections) {
    if (numberOf(connection)) continue;

    // An unparseable timestamp counts as never checked rather than as
    // just-checked: one extra call costs a moment, and skipping forever
    // costs a picker nobody can read.
    const checked = connection.lastCheckedAt ? Date.parse(connection.lastCheckedAt) : Number.NaN;
    if (Number.isFinite(checked) && now - checked < NUMBER_SYNC_COOLDOWN_MS) continue;

    due.push(connection);
    if (due.length >= NUMBER_SYNC_BATCH) break;
  }
  return due;
}
