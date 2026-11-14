// Sending one message to everybody in a group.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.
//
// A group here is a named segment, not a WhatsApp group: Meta's Cloud API
// has no group endpoints, so there is nothing to post into. Each member
// gets their own message, which is what a business wants anyway — a reply
// comes back as a private conversation rather than to an audience.
//
// The rule that shapes all of this is WhatsApp's 24-hour service window.
// Plain text may only be sent to somebody who has written to you within
// the last day. Everybody else needs an approved template, which is what
// campaigns are for. Working that out before sending is the difference
// between a clear "14 of 20 can be reached now" and fourteen sends
// followed by six errors.

/** Twenty-four hours, in milliseconds. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60_000;

export interface GroupMember {
  contactId: string;
  name: string | null;
  waId: string;
  /** When they last wrote in, or null if they never have. */
  lastInboundAt: string | null;
  /** Conversations are what a message is logged against. */
  conversationId: string | null;
  optedOut?: boolean;
}

export type SkipReason = "opted_out" | "no_conversation" | "outside_window";

export interface BroadcastPlan {
  send: GroupMember[];
  skipped: Array<{ member: GroupMember; why: SkipReason }>;
}

export function planBroadcast(
  members: readonly GroupMember[],
  now: Date = new Date()
): BroadcastPlan {
  const plan: BroadcastPlan = { send: [], skipped: [] };

  for (const member of members) {
    // Checked first and never overridden. Somebody who asked to be left
    // alone being included in a broadcast is the one mistake here with a
    // legal edge as well as a human one.
    if (member.optedOut) {
      plan.skipped.push({ member, why: "opted_out" });
      continue;
    }

    if (!member.conversationId || !member.lastInboundAt) {
      plan.skipped.push({ member, why: "no_conversation" });
      continue;
    }

    const since = now.getTime() - new Date(member.lastInboundAt).getTime();
    if (!Number.isFinite(since) || since > SERVICE_WINDOW_MS) {
      plan.skipped.push({ member, why: "outside_window" });
      continue;
    }

    plan.send.push(member);
  }

  return plan;
}

/** Why somebody was left out, in words for the person about to send. */
export function explainSkip(why: SkipReason): string {
  switch (why) {
    case "opted_out":
      return "asked not to be messaged";
    case "no_conversation":
      return "has never written to you, so a plain message cannot be sent";
    case "outside_window":
      return "last wrote more than 24 hours ago — needs an approved template";
  }
}

/**
 * One line summarising a plan, before anything is sent.
 *
 * A count on its own invites the assumption that the rest failed. Naming
 * the reason turns "6 skipped" into a decision about whether to run a
 * campaign instead.
 */
export function describePlan(plan: BroadcastPlan): string {
  const total = plan.send.length + plan.skipped.length;
  if (total === 0) return "This group has no contacts in it yet.";
  if (plan.skipped.length === 0) {
    return `All ${total} can be messaged now.`;
  }
  if (plan.send.length === 0) {
    return `None of these ${total} can be sent a plain message right now. Use a campaign with an approved template instead.`;
  }

  const byReason = new Map<SkipReason, number>();
  for (const entry of plan.skipped) {
    byReason.set(entry.why, (byReason.get(entry.why) ?? 0) + 1);
  }

  const reasons = [...byReason.entries()]
    .map(([why, count]) => `${count} ${explainSkip(why)}`)
    .join("; ");

  return `${plan.send.length} of ${total} can be messaged now. Skipped: ${reasons}.`;
}

export const MAX_BODY = 4096;

export function checkBody(body: string): { ok: true; body: string } | { ok: false; error: string } {
  const text = body.trim();
  if (!text) return { ok: false, error: "Write the message first." };
  if (text.length > MAX_BODY) {
    return { ok: false, error: `WhatsApp will not take more than ${MAX_BODY} characters.` };
  }
  return { ok: true, body: text };
}
