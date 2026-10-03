// Deciding who a one-off send to every workspace actually goes to.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// Separated from the sending because email cannot be recalled. Who is on
// the list, and who was left off and why, is worth being able to check
// without a mailbox being involved.

/** A workspace, flattened to the few things that decide this. */
export interface BroadcastOrg {
  id: string;
  name: string;
  suspendedAt: string | null;
  /** The owner's address, or null when nobody on it has one. */
  email: string | null;
}

export type BroadcastSkip = "no_email" | "suspended" | "unsubscribed" | "same_person";

export interface BroadcastPlan {
  send: Array<{ orgId: string; name: string; email: string; dedupeKey: string }>;
  skipped: Array<{ orgId: string; name: string; email: string | null; why: BroadcastSkip }>;
}

/**
 * A re-send counts as marketing, whatever the original was.
 *
 * A welcome that arrives because somebody just signed up is about their
 * account. The same words sent to everybody on the list months later
 * because an operator pressed a button is bulk mail, and has to carry an
 * unsubscribe and honour the list. This kind is deliberately not in
 * email-kinds' transactional set, which is what makes that happen.
 */
export const BROADCAST_KIND = "welcome_again";

/**
 * Dated, so the same day's run cannot go twice.
 *
 * A double-click, a retried request or a second tab all land on the same
 * key and the unique index refuses the second. Running it again next week
 * is a different key and works, which is the behaviour an operator
 * expects from a button they pressed on purpose.
 */
export function broadcastKey(orgId: string, on: Date): string {
  const day = on.toISOString().slice(0, 10);
  return `${orgId}:${BROADCAST_KIND}:${day}`;
}

export function planBroadcast(
  orgs: readonly BroadcastOrg[],
  optedOut: readonly string[],
  on: Date
): BroadcastPlan {
  const refused = new Set(optedOut.map((address) => address.trim().toLowerCase()));
  const already = new Set<string>();
  const plan: BroadcastPlan = { send: [], skipped: [] };

  for (const org of orgs) {
    const email = org.email?.trim().toLowerCase() ?? "";

    if (!email) {
      plan.skipped.push({ orgId: org.id, name: org.name, email: null, why: "no_email" });
      continue;
    }

    // A suspended workspace is one somebody switched off. Inviting them
    // back into a product they cannot open is worse than saying nothing.
    if (org.suspendedAt) {
      plan.skipped.push({ orgId: org.id, name: org.name, email, why: "suspended" });
      continue;
    }

    if (refused.has(email)) {
      plan.skipped.push({ orgId: org.id, name: org.name, email, why: "unsubscribed" });
      continue;
    }

    // One person owning two workspaces is one person. Two identical
    // welcomes in one minute is what a spam report is for.
    if (already.has(email)) {
      plan.skipped.push({ orgId: org.id, name: org.name, email, why: "same_person" });
      continue;
    }

    already.add(email);
    plan.send.push({
      orgId: org.id,
      name: org.name,
      email,
      dedupeKey: broadcastKey(org.id, on),
    });
  }

  return plan;
}

/** Why somebody was left off, in words for the operator. */
export function explainSkip(why: BroadcastSkip): string {
  switch (why) {
    case "no_email":
      return "nobody on this workspace has an email address on file";
    case "suspended":
      return "workspace is suspended";
    case "unsubscribed":
      return "this address has unsubscribed";
    case "same_person":
      return "same address as another workspace, already on the list once";
  }
}
