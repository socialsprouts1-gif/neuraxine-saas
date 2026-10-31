import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { sendMessage } from "@/lib/instagram-api";
import {
  DEFAULT_EMAIL_PROMPT,
  DEFAULT_FOLLOW_GATE,
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
}

export const RULE_COLUMNS =
  "id, name, keywords, media_id, dm_message, public_reply, is_active, trigger_type, buttons, follow_gate, follow_gate_message, ask_email, ask_email_message";

export function asLoadedRule(row: {
  id: string;
  name: string;
  dm_message: string | null;
  public_reply: string | null;
  buttons: unknown;
  follow_gate: boolean;
  follow_gate_message: string | null;
  ask_email: boolean;
  ask_email_message: string | null;
}): LoadedRule {
  return {
    id: row.id,
    name: row.name,
    dmMessage: row.dm_message,
    publicReply: row.public_reply,
    buttons: Array.isArray(row.buttons) ? (row.buttons as AutomationButton[]) : [],
    followGate: row.follow_gate,
    followGateMessage: row.follow_gate_message,
    askEmail: row.ask_email,
    askEmailMessage: row.ask_email_message,
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
    buttons: [{ title: "I'm following ✅", payload: followPayload(input.rule.id) }],
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
  field: "run_count" | "sent_count" | "follower_gain_count" | "email_count"
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
