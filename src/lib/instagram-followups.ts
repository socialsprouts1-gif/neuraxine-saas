import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto";
import { sendMessage } from "@/lib/instagram-api";
import { withinMessagingWindow } from "@/lib/instagram";
import { bump } from "@/lib/instagram-deliver";

// Sending the second message once it is due.
//
// Driven from three places, because none of them alone is enough: the
// Instagram webhook sweeps on its way out (an account with traffic
// drains its own queue within a minute or two), the dashboard's ticker
// sweeps while somebody has it open, and the nightly cron catches
// whatever both of those missed. All three call this, and the claim
// below makes running them at once harmless.

const BATCH = 25;

export async function sweepInstagramFollowups(): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient();

  const { data: due } = await admin
    .from("instagram_followups")
    .select("id, org_id, connection_id, rule_id, ig_user_id, body")
    .is("sent_at", null)
    .lte("due_at", new Date().toISOString())
    .order("due_at")
    .limit(BATCH);

  if (!due || due.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    // Claim it before sending. Three callers can run at once, and the
    // update reports what it changed — so the one that gets the row
    // sends, and the others find nothing and move on.
    const { data: claimed } = await admin
      .from("instagram_followups")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("sent_at", null)
      .select("id");

    if (!claimed || claimed.length === 0) continue;

    const { data: connection } = await admin
      .from("instagram_connections")
      .select("ig_user_id, access_token_encrypted, status")
      .eq("id", row.connection_id ?? "")
      .maybeSingle();

    if (!connection || connection.status !== "active") {
      await note(admin, row.id, "That Instagram account is no longer connected.");
      failed += 1;
      continue;
    }

    // Has this person actually written to the business?
    //
    // A comment buys one private reply and nothing more. Everything
    // after it is an ordinary message, which Instagram only delivers
    // inside 24 hours of the person's own last message — so a
    // follow-up to somebody who commented and never replied is
    // refused, every time.
    //
    // Checked here rather than discovered from Meta's error code, so
    // the log says "they have not replied yet" instead of a number.
    const { data: contact } = await admin
      .from("contacts")
      .select("id")
      .eq("org_id", row.org_id)
      .eq("ig_user_id", row.ig_user_id)
      .maybeSingle();

    const { data: conversation } = contact
      ? await admin
          .from("conversations")
          .select("last_inbound_at")
          .eq("org_id", row.org_id)
          .eq("contact_id", contact.id)
          .eq("channel", "instagram")
          .maybeSingle()
      : { data: null };

    if (!withinMessagingWindow(conversation?.last_inbound_at ?? null)) {
      await note(
        admin,
        row.id,
        "Not sent: they have not messaged back, and Instagram only allows a second message within 24 hours of somebody writing to you."
      );
      failed += 1;
      await admin.from("instagram_comment_events").insert({
        org_id: row.org_id,
        connection_id: row.connection_id,
        rule_id: row.rule_id,
        kind: "followup",
        ig_user_id: row.ig_user_id,
        outcome: "window_closed",
        comment_text: row.body.slice(0, 2000),
      });
      continue;
    }

    const outcome = await sendMessage({
      igUserId: connection.ig_user_id,
      recipient: { id: row.ig_user_id },
      text: row.body,
      token: decryptToken(connection.access_token_encrypted),
    });

    if (outcome.ok) {
      sent += 1;
      if (row.rule_id) await bump(admin, row.rule_id, "followup_count");
      await admin.from("instagram_comment_events").insert({
        org_id: row.org_id,
        connection_id: row.connection_id,
        rule_id: row.rule_id,
        kind: "followup",
        ig_user_id: row.ig_user_id,
        outcome: "sent",
        comment_text: row.body.slice(0, 2000),
      });
    } else {
      failed += 1;
      await note(admin, row.id, outcome.error);
      await admin.from("instagram_comment_events").insert({
        org_id: row.org_id,
        connection_id: row.connection_id,
        rule_id: row.rule_id,
        kind: "followup",
        ig_user_id: row.ig_user_id,
        outcome: "failed",
        error: outcome.error,
        comment_text: row.body.slice(0, 2000),
      });
    }
  }

  return { sent, failed };
}

async function note(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  error: string
): Promise<void> {
  await admin.from("instagram_followups").update({ error }).eq("id", id);
}
