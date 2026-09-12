// Plan limits that actually stop something.
//
// plans.message_limit, contact_limit and seat_limit were three columns
// nothing read. A plan nobody is held to is not a plan — it is a number on
// a pricing page — and the tiers were priced as though they meant
// something.
//
// Each check returns a sentence rather than a boolean, because the only
// useful thing to do when somebody hits a limit is tell them which limit,
// how much of it they have used, and what to do about it.

export interface PlanLimits {
  message_limit: number | null;
  contact_limit: number | null;
  seat_limit: number | null;
}

/** No plan means no limits: a workspace waiting on one is not punished. */
export const NO_LIMITS: PlanLimits = {
  message_limit: null,
  contact_limit: null,
  seat_limit: null,
};

export type LimitKind = "messages" | "contacts" | "seats";

export interface LimitVerdict {
  ok: boolean;
  /** How many are left, or null when the limit is unlimited. */
  remaining: number | null;
  /** 0 to 1, or null when unlimited. For the usage bars. */
  fraction: number | null;
  /** Set only when ok is false. Written for the customer to read. */
  reason?: string;
}

const LABEL: Record<LimitKind, { one: string; many: string; period: string }> = {
  messages: { one: "message", many: "messages", period: " this month" },
  contacts: { one: "contact", many: "contacts", period: "" },
  seats: { one: "seat", many: "seats", period: "" },
};

/**
 * Whether `used + wanted` fits inside `limit`.
 *
 * `wanted` is what is about to happen, not what has happened — a campaign
 * to 5,000 people asks for 5,000 before sending one, because a limit
 * discovered halfway through a broadcast has already half-sent it.
 */
export function checkLimit(
  kind: LimitKind,
  limit: number | null,
  used: number,
  wanted = 1
): LimitVerdict {
  if (limit === null) return { ok: true, remaining: null, fraction: null };

  const safeUsed = Math.max(0, used);
  const remaining = Math.max(0, limit - safeUsed);
  const fraction = limit > 0 ? Math.min(1, safeUsed / limit) : 1;

  if (safeUsed + Math.max(0, wanted) <= limit) {
    return { ok: true, remaining, fraction };
  }

  const words = LABEL[kind];
  const allowance = `${limit.toLocaleString("en-IN")} ${limit === 1 ? words.one : words.many}${words.period}`;

  return {
    ok: false,
    remaining,
    fraction,
    reason:
      remaining === 0
        ? `Your plan includes ${allowance} and you have used all of them. Move to a larger plan to carry on.`
        : `Your plan includes ${allowance}, and this needs ${wanted.toLocaleString("en-IN")} with ${remaining.toLocaleString("en-IN")} left. Move to a larger plan, or send to fewer people.`,
  };
}

export interface UsageSnapshot {
  messages: number;
  contacts: number;
  seats: number;
}

export interface UsageRow {
  kind: LimitKind;
  label: string;
  used: number;
  limit: number | null;
  fraction: number | null;
  /** True once past 80%, for the amber state on the bar. */
  nearly: boolean;
}

/**
 * The three limits as rows for the Billing screen.
 *
 * Everything a workspace is measured against, in one place, whether or not
 * it is close to any of them — somebody who has to go looking for their
 * usage finds out they were over it from an error message.
 */
export function usageRows(limits: PlanLimits, usage: UsageSnapshot): UsageRow[] {
  const rows: Array<{ kind: LimitKind; label: string; used: number; limit: number | null }> = [
    { kind: "messages", label: "Messages this month", used: usage.messages, limit: limits.message_limit },
    { kind: "contacts", label: "Contacts", used: usage.contacts, limit: limits.contact_limit },
    { kind: "seats", label: "Team seats", used: usage.seats, limit: limits.seat_limit },
  ];

  return rows.map((row) => {
    const verdict = checkLimit(row.kind, row.limit, row.used, 0);
    return {
      ...row,
      fraction: verdict.fraction,
      nearly: verdict.fraction !== null && verdict.fraction >= 0.8,
    };
  });
}

/** The first day of the current month, UTC, for counting messages. */
export function monthStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
