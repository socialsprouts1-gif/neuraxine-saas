import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto";
import { followsAccount, sendMessage } from "@/lib/instagram-api";
import { ruleFromPayload } from "@/lib/instagram";
import {
  asLoadedRule,
  bump,
  RULE_COLUMNS,
  sendEmailPrompt,
  sendRuleMessage,
} from "@/lib/instagram-deliver";

// Somebody tapped "I'm following".
//
// This is the second half of a gated automation, and the only moment
// the follow can actually be checked — Instagram refuses to say whether
// a person follows an account until that person has interacted with it,
// and the tap is the interaction. Checking silently at comment time is
// not merely rude, it is an error.
//
// A tap that turns out to be a fib gets the ask again rather than the
// link. Sending anyway would make the gate decorative, and nobody would
// follow a second time.

const NOT_YET =
  "I can't see the follow yet — give Instagram a second, then tap the button again 🙏";

export async function handlePostback(
  connection: {
    id: string;
    org_id: string;
    ig_user_id: string;
    access_token_encrypted: string;
  },
  input: { personId: string; payload: string }
): Promise<void> {
  const ruleId = ruleFromPayload(input.payload);
  if (!ruleId) return;

  const admin = createAdminClient();

  const { data: row } = await admin
    .from("instagram_comment_rules")
    .select(RULE_COLUMNS)
    .eq("id", ruleId)
    .eq("org_id", connection.org_id)
    .maybeSingle();

  // Deleted between the ask and the tap. Nothing to send, and an error
  // message about a missing automation means nothing to the person
  // holding the phone.
  if (!row || !row.is_active) return;

  const rule = asLoadedRule(row as Parameters<typeof asLoadedRule>[0]);
  const token = decryptToken(connection.access_token_encrypted);

  const check = await followsAccount({
    igUserId: connection.ig_user_id,
    personId: input.personId,
    token,
  });

  // A check that could not run is not a refusal. Instagram being
  // briefly unavailable should not cost somebody the thing they
  // followed for, so an unanswerable check sends the message.
  const follows = check.ok ? check.follows : true;

  if (!follows) {
    await sendMessage({
      igUserId: connection.ig_user_id,
      recipient: { id: input.personId },
      text: NOT_YET,
      buttons: [{ title: "I'm following ✅", payload: input.payload }],
      token,
    });
    return;
  }

  const outcome = await sendRuleMessage({
    connection,
    rule,
    recipient: { id: input.personId },
    token,
  });

  if (!outcome.ok) {
    console.error(`Instagram gated send failed: ${outcome.error}`);
    return;
  }

  await bump(admin, ruleId, "sent_count");
  // Only counted when the gate actually turned somebody into a
  // follower — a tap from a person who already followed is not a gain,
  // and the pending row is what tells the two apart.
  const { data: pending } = await admin
    .from("instagram_pending_sends")
    .select("id")
    .eq("org_id", connection.org_id)
    .eq("ig_user_id", input.personId)
    .eq("rule_id", ruleId)
    .maybeSingle();

  if (pending) {
    await bump(admin, ruleId, "follower_gain_count");
    await admin.from("instagram_pending_sends").delete().eq("id", pending.id);
  }

  await admin.from("instagram_comment_events").insert({
    org_id: connection.org_id,
    connection_id: connection.id,
    rule_id: ruleId,
    kind: "follow_gate",
    ig_user_id: input.personId,
    outcome: "sent",
    comment_text: "Tapped “I'm following”",
  });

  await sendEmailPrompt({ connection, rule, personId: input.personId, token });
}
