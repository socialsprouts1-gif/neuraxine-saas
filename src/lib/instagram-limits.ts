import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendVerdict } from "@/lib/instagram";

// How much an account may send, and the switch that stops it.
//
// There was no cap of any kind. On a quiet week that is fine; on a reel
// that takes off it is a business account sending hundreds of
// unsolicited messages to strangers inside an hour, which is precisely
// what Instagram restricts accounts for. The account it restricts is the
// customer's.
//
// Two rules, and the second matters more than the first:
//
//   * a ceiling per hour and per day, counted from what was actually
//     sent rather than from a guess
//   * refusals count too. A send Meta rejected still told Meta something
//     about this account, and an automation that retries a refused send
//     on every new comment digs the hole deeper the longer it runs.
//
// Everything here fails closed. If the count cannot be read, nothing is
// sent — the cost of a missed auto-reply is one annoyed commenter, and
// the cost of getting this wrong is the customer's account.

export type SendKind = "dm" | "private_reply" | "comment_reply" | "followup";

export interface SendAllowance {
  allowed: boolean;
  /** Why not, in words that go straight onto a screen. */
  reason?: string;
  /** What is left this hour, for the screen to show before it bites. */
  remainingHour?: number;
  remainingDay?: number;
}

/**
 * A connection as a send path must receive it: limits attached.
 *
 * Required, not optional, and deliberately awkward to satisfy. These
 * started out optional, which let every caller type-check while passing
 * an object that had never selected them — and a connection arriving
 * with no `automation_paused_at` is not an account that is running, it
 * is an account whose off switch is being ignored. Required means a
 * select that forgets a column fails to compile instead of quietly
 * uncapping one route.
 *
 * Null is still allowed, because a row written before the migration has
 * no limits yet and falls back to the defaults below.
 */
export interface LimitedConnection {
  id: string;
  org_id: string;
  sends_per_hour: number | null;
  sends_per_day: number | null;
  automation_paused_at: string | null;
  automation_paused_reason: string | null;
}

/** The columns every send path has to select. Spelled once. */
export const LIMIT_COLUMNS =
  "sends_per_hour, sends_per_day, automation_paused_at, automation_paused_reason" as const;

/** Used when a column has not arrived yet, so a pending migration cannot uncap. */
const DEFAULT_HOUR = 30;
const DEFAULT_DAY = 150;

/**
 * Whether this account may send right now.
 *
 * Called before every automated send. A comment reply is counted but
 * never blocked by the DM caps: replying publicly to somebody who
 * commented on your own post is not what gets an account restricted,
 * and blocking it would make the automation look broken for the one
 * thing that was safe all along.
 */
export async function maySend(
  connection: LimitedConnection,
  kind: SendKind
): Promise<SendAllowance> {
  // The master switch first. It is the thing somebody reaches for when
  // their account is already in trouble, so nothing may get past it.
  if (connection.automation_paused_at) {
    return {
      allowed: false,
      reason:
        connection.automation_paused_reason?.trim() ||
        "Automation is paused for this account. Switch it back on when you are ready.",
    };
  }

  if (kind === "comment_reply") return { allowed: true };

  const perHour = positive(connection.sends_per_hour, DEFAULT_HOUR);
  const perDay = positive(connection.sends_per_day, DEFAULT_DAY);

  try {
    const admin = createAdminClient();
    const now = Date.now();

    const [hour, day] = await Promise.all([
      admin
        .from("instagram_sends")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", connection.id)
        .neq("kind", "comment_reply")
        .gte("created_at", new Date(now - 3_600_000).toISOString()),
      admin
        .from("instagram_sends")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", connection.id)
        .neq("kind", "comment_reply")
        .gte("created_at", new Date(now - 86_400_000).toISOString()),
    ]);

    // Fail closed. A count that cannot be read is not permission to send
    // as much as we like — that is the exact mistake that costs somebody
    // their account.
    if (hour.error || day.error) {
      return {
        allowed: false,
        reason:
          "The sending count could not be read, so nothing was sent. If this persists, run the latest database update.",
      };
    }

    return sendVerdict({
      perHour,
      perDay,
      sentHour: hour.count ?? 0,
      sentDay: day.count ?? 0,
    });
  } catch {
    return {
      allowed: false,
      reason: "The sending count could not be checked, so nothing was sent.",
    };
  }
}

/**
 * Writes down a send.
 *
 * Called whether Meta accepted it or not. A refused send still told Meta
 * something about this account, and counting only the successes means an
 * automation that is failing keeps trying at full speed — which is how a
 * bad hour becomes a restriction.
 */
export async function recordSend(
  connection: LimitedConnection,
  kind: SendKind
): Promise<void> {
  try {
    await createAdminClient().from("instagram_sends").insert({
      org_id: connection.org_id,
      connection_id: connection.id,
      kind,
    });
  } catch {
    // Never worth failing a send that already happened.
  }
}

/** Stops every automation on an account at once. */
export async function pauseAutomation(
  connectionId: string,
  reason: string
): Promise<void> {
  try {
    await createAdminClient()
      .from("instagram_connections")
      .update({
        automation_paused_at: new Date().toISOString(),
        automation_paused_reason: reason.slice(0, 500),
      })
      .eq("id", connectionId);
  } catch {
    // The caller is usually already handling a failure; a pause that
    // could not be written must not mask it.
  }
}

function positive(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && value > 0 ? value : fallback;
}

/**
 * What each account has sent in the last hour and the last day.
 *
 * A function rather than inline on the page, because the clock is not a
 * render input — and because a count worked out from the handful of
 * events the page shows would under-report every busy hour, which is
 * exactly the hour it has to be right about.
 *
 * Public replies are left out. They are counted for the record but never
 * capped, and showing them against a cap they do not touch would read as
 * a limit about to bite when it is not.
 */
export async function countRecentSends(
  orgId: string
): Promise<{ hour: Record<string, number>; day: Record<string, number>; ready: boolean }> {
  const hour: Record<string, number> = {};
  const day: Record<string, number> = {};
  let ready = true;

  try {
    const now = Date.now();
    const { data: sends, error } = await createAdminClient()
      .from("instagram_sends")
      .select("connection_id, created_at")
      .eq("org_id", orgId)
      .neq("kind", "comment_reply")
      .gte("created_at", new Date(now - 86_400_000).toISOString())
      .limit(5000);

    // The table is missing until the database update is run, and until
    // then maySend fails closed — so every DM and private reply stops
    // while public replies carry on. That is the safe behaviour and the
    // wrong thing to discover one event row at a time, so it is
    // reported upwards and said plainly on the page.
    if (error) ready = false;

    const hourAgo = now - 3_600_000;
    for (const send of sends ?? []) {
      day[send.connection_id] = (day[send.connection_id] ?? 0) + 1;
      if (new Date(send.created_at).getTime() >= hourAgo) {
        hour[send.connection_id] = (hour[send.connection_id] ?? 0) + 1;
      }
    }
  } catch {
    ready = false;
  }

  return { hour, day, ready };
}
