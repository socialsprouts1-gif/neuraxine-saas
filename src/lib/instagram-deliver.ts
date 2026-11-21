import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { sendMessage } from "@/lib/instagram-api";
import {
  DEFAULT_EMAIL_PROMPT,
  DEFAULT_FOLLOW_GATE,
  FOLLOW_BUTTON,
  followPayload,
  type AutomationButton,
} from "@/lib/instagram";

// Sending what an automation says, wherever it was triggered from.
//
// One place, because the same automation can fire twice in a
// conversation: once on the comment, and again after the person taps
// "I'm following". Two copies of the button-building and counter code
// would have drifted apart by the second feature.

type Admin = SupabaseClient<Database>;

export interface LoadedRule {
  id: string;
  name: string;
  dmMessage: string | null;
  publicReply: string | null;
  buttons: AutomationButton[];
  followGate: boolean;
  followGateMessage: string | null;
  askEmail: boolean;
  askEmailMessage: string | null;
  followupMessage: string | null;
  followupDelayMinutes: number;
}

/**
 * Every column, deliberately.
 *
 * This was a named list, and each new feature added two names to it.
 * A name that does not exist yet — a migration run tomorrow rather
 * than today — makes the whole select fail, which returns no
 * automations and stops every one of them in the workspace, looking
 * exactly like nobody having commented.
 *
 * A star cannot fail that way: a column that is not there is simply
 * absent from the row, and asLoadedRule already defaults each one. The
 * cost is a few bytes per row; the alternative is the live feature
 * going dark whenever a deploy lands before its migration.
 */
export const RULE_COLUMNS = "*";

export function asLoadedRule(row: {
  id: string;
  name: string;
  dm_message?: string | null;
  public_reply?: string | null;
  buttons?: unknown;
  follow_gate?: boolean | null;
  follow_gate_message?: string | null;
  ask_email?: boolean | null;
  ask_email_message?: string | null;
  followup_message?: string | null;
  followup_delay_minutes?: number | null;
}): LoadedRule {
  return {
    id: row.id,
    name: row.name,
    dmMessage: row.dm_message ?? null,
    publicReply: row.public_reply ?? null,
    buttons: Array.isArray(row.buttons) ? (row.buttons as AutomationButton[]) : [],
    // Each one defaulted, because a star select on a database that has
    // not run the latest migration simply has no such key.
    followGate: row.follow_gate ?? false,
    followGateMessage: row.follow_gate_message ?? null,
    askEmail: row.ask_email ?? false,
    askEmailMessage: row.ask_email_message ?? null,
    followupMessage: row.followup_message ?? null,
    followupDelayMinutes: row.followup_delay_minutes ?? 10,
  };
}

/**
 * The ask that stands in front of a gated message.
 *
 * A postback button rather than a link, because tapping it is the only
 * thing that makes the follow check legal — Instagram will not answer
 * "does this person follow you" until they have interacted with the
 * account.
 */
export async function sendFollowGate(input: {
  connection: { ig_user_id: string };
  rule: LoadedRule;
  recipient: { id: string } | { comment_id: string };
  token: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return sendMessage({
    igUserId: input.connection.ig_user_id,
    recipient: input.recipient,
    text: input.rule.followGateMessage?.trim() || DEFAULT_FOLLOW_GATE,
    buttons: [{ title: FOLLOW_BUTTON, payload: followPayload(input.rule.id) }],
    token: input.token,
  });
}

/**
 * The automation's actual message, with its buttons.
 */
export async function sendRuleMessage(input: {
  connection: { ig_user_id: string };
  rule: LoadedRule;
  recipient: { id: string } | { comment_id: string };
  token: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = input.rule.dmMessage?.trim();
  if (!text) return { ok: false, error: "This automation has no message to send." };

  return sendMessage({
    igUserId: input.connection.ig_user_id,
    recipient: input.recipient,
    text,
    buttons: input.rule.buttons.map((button) => ({ title: button.label, url: button.url })),
    token: input.token,
  });
}

/**
 * The follow-up that asks for an email address.
 *
 * Sent to the person rather than the comment: by now a thread exists,
 * and a second private reply to the same comment is refused.
 */
export async function sendEmailPrompt(input: {
  connection: { ig_user_id: string };
  rule: LoadedRule;
  personId: string;
  token: string;
}): Promise<void> {
  if (!input.rule.askEmail) return;
  const outcome = await sendMessage({
    igUserId: input.connection.ig_user_id,
    recipient: { id: input.personId },
    text: input.rule.askEmailMessage?.trim() || DEFAULT_EMAIL_PROMPT,
    token: input.token,
  });
  if (!outcome.ok) console.error(`Instagram email prompt failed: ${outcome.error}`);
}

/**
 * Adds to one of an automation's tallies.
 *
 * Read-then-write rather than an atomic increment, which is a race this
 * can afford: two triggers in the same millisecond may cost one from a
 * tally, and the tallies are a reassurance on a screen. The events log
 * is the real record and it cannot lose a row.
 */
export async function bump(
  admin: Admin,
  ruleId: string,
  field: "run_count" | "sent_count" | "follower_gain_count" | "email_count" | "followup_count"
): Promise<void> {
  const { data } = await admin
    .from("instagram_comment_rules")
    .select(field)
    .eq("id", ruleId)
    .maybeSingle();
  if (!data) return;
  const current = (data as Record<string, number | null>)[field] ?? 0;
  const next = current + 1;

  // Spelled out rather than a computed key. A computed key widens the
  // update to Record<string, number>, which the generated Update type
  // rejects — and would have let a typo name a column that does not
  // exist.
  const patch =
    field === "run_count"
      ? { run_count: next }
      : field === "sent_count"
        ? { sent_count: next }
        : field === "follower_gain_count"
          ? { follower_gain_count: next }
          : field === "followup_count"
            ? { followup_count: next }
            : { email_count: next };

  await admin.from("instagram_comment_rules").update(patch).eq("id", ruleId);
}

/**
 * Remembers that somebody was asked to follow, and what they were
 * promised, so the tap on the button knows what to send.
 */
export async function rememberPending(
  admin: Admin,
  input: { orgId: string; connectionId: string; ruleId: string; igUserId: string }
): Promise<void> {
  const { error } = await admin.from("instagram_pending_sends").upsert(
    {
      org_id: input.orgId,
      connection_id: input.connectionId,
      rule_id: input.ruleId,
      ig_user_id: input.igUserId,
      stage: "awaiting_follow",
    },
    { onConflict: "org_id,ig_user_id,rule_id" }
  );
  if (error) console.error("Could not remember a pending Instagram send", error);
}

/**
 * Queues the second message, if the automation has one.
 *
 * A row rather than a timer. A send due in ten minutes has to survive a
 * deploy, and the function that queued it has already returned by then
 * — a setTimeout in a serverless handler is a message that never
 * arrives.
 *
 * The unique index does the rest: somebody who comments three times on
 * the same post is owed one follow-up, not three.
 */
export async function queueFollowup(
  admin: Admin,
  input: {
    orgId: string;
    connectionId: string;
    rule: LoadedRule;
    igUserId: string;
  }
): Promise<void> {
  const body = input.rule.followupMessage?.trim();
  if (!body) return;

  const minutes = Math.max(0, input.rule.followupDelayMinutes ?? 10);
  const dueAt = new Date(Date.now() + minutes * 60_000).toISOString();

  const { error } = await admin.from("instagram_followups").insert({
    org_id: input.orgId,
    connection_id: input.connectionId,
    rule_id: input.rule.id,
    ig_user_id: input.igUserId,
    body,
    due_at: dueAt,
  });

  // 23505 is the unique index doing its job — one is already owed.
  if (error) {
    if (error.code !== "23505") {
      console.error("Could not queue an Instagram follow-up", error);
      await admin.from("instagram_comment_events").insert({
        org_id: input.orgId,
        connection_id: input.connectionId,
        rule_id: input.rule.id,
        kind: "followup",
        ig_user_id: input.igUserId,
        outcome: "followup_failed",
        error: error.message,
      });
    }
    return;
  }

  // Written down on the way in, not only on the way out. A follow-up
  // due in ten minutes is otherwise invisible for ten minutes, and
  // invisible is indistinguishable from broken — which is how the last
  // two days went.
  await admin.from("instagram_comment_events").insert({
    org_id: input.orgId,
    connection_id: input.connectionId,
    rule_id: input.rule.id,
    kind: "followup",
    ig_user_id: input.igUserId,
    outcome: "followup_queued",
    comment_text: `Follow-up due in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
  });
}
