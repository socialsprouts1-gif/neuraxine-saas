import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto";
import { replyToComment } from "@/lib/instagram-api";
import { ruleFor, withinReplyWindow, type Comment, type CommentRule } from "@/lib/instagram";
import {
  asLoadedRule,
  bump,
  rememberPending,
  RULE_COLUMNS,
  sendEmailPrompt,
  sendFollowGate,
  sendRuleMessage,
} from "@/lib/instagram-deliver";

// Comment arrives, DM goes out.
//
// The whole point of the feature, and the part with the sharpest edges —
// it messages strangers on the operator's behalf, so every way it could
// fire twice or fire wrongly has to be closed here rather than hoped
// about.
//
// Three guards, in order of how much trouble each one saves:
//
// The comment id is a unique index on the log, so Meta's retries cannot
// DM the same person four times. The row is written *before* the send,
// so losing the race means stopping rather than sending.
//
// The account ignores its own comments, or replying to a customer under
// your own post starts a loop with yourself.
//
// And a comment older than seven days is refused here rather than by
// Meta, so the log says "too old" instead of an error nobody can act on.

export interface InboundComment {
  commentId: string;
  mediaId: string | null;
  text: string;
  fromId: string | null;
  fromUsername: string | null;
  createdAt: string | null;
}

export async function handleComment(
  connection: {
    id: string;
    org_id: string;
    ig_user_id: string;
    access_token_encrypted: string;
  },
  comment: InboundComment
): Promise<void> {
  const admin = createAdminClient();

  // The account's own reply under its own post. Nothing to do, and
  // answering it is a conversation with yourself.
  if (comment.fromId && comment.fromId === connection.ig_user_id) return;

  // Claim it. Losing this insert means another delivery of the same
  // webhook already has it — which is the correct outcome, not an error.
  const { error: claimError } = await admin.from("instagram_comment_events").insert({
    org_id: connection.org_id,
    connection_id: connection.id,
    comment_id: comment.commentId,
    media_id: comment.mediaId,
    from_username: comment.fromUsername,
    ig_user_id: comment.fromId,
    comment_text: comment.text?.slice(0, 2000) ?? null,
    outcome: "matching",
  });

  if (claimError) {
    // 23505 is the unique index doing its job.
    if (claimError.code !== "23505") {
      console.error("Could not claim an Instagram comment", claimError);
    }
    return;
  }

  const finish = async (outcome: string, error?: string) => {
    await admin
      .from("instagram_comment_events")
      .update({ outcome, error: error ?? null })
      .eq("comment_id", comment.commentId);
  };

  // A rule with no connection covers every account the workspace has
  // connected; one with a connection covers only that account. Filtered
  // here rather than after fetching, because the column is pointless if
  // the send path ignores it — a rule written for one account would
  // quietly answer comments on another.
  const { data: rows } = await admin
    .from("instagram_comment_rules")
    .select(RULE_COLUMNS)
    .eq("org_id", connection.org_id)
    .eq("is_active", true)
    .eq("trigger_type", "comment")
    .or(`connection_id.is.null,connection_id.eq.${connection.id}`);

  const rules: CommentRule[] = (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    keywords: row.keywords ?? [],
    mediaId: row.media_id,
    dmMessage: row.dm_message,
    publicReply: row.public_reply,
    isActive: row.is_active,
  }));

  const target: Comment = {
    id: comment.commentId,
    mediaId: comment.mediaId,
    text: comment.text ?? "",
    fromId: comment.fromId,
  };

  const rule = ruleFor(target, rules);
  if (!rule) {
    await finish("no_rule");
    return;
  }

  await admin
    .from("instagram_comment_events")
    .update({ rule_id: rule.id })
    .eq("comment_id", comment.commentId);

  const token = decryptToken(connection.access_token_encrypted);
  const loaded = asLoadedRule(
    (rows ?? []).find((row) => row.id === rule.id) as Parameters<typeof asLoadedRule>[0]
  );
  const problems: string[] = [];
  let sent = false;

  // A trigger that matched, whether or not anything got through.
  // Counted apart from sent_count so "fired 40 times, delivered 3" is
  // visible rather than looking like it never ran at all.
  await bump(admin, rule.id, "run_count");

  if (loaded.dmMessage?.trim() || loaded.followGate) {
    // Checked before sending: Meta's refusal for an expired comment is
    // an error code, and "that comment is more than seven days old" is
    // something somebody can actually act on.
    if (comment.createdAt && !withinReplyWindow(comment.createdAt)) {
      problems.push(
        "The comment is more than seven days old, so Instagram will not deliver a private reply."
      );
    } else if (loaded.followGate) {
      // The gate replaces the message rather than preceding it. Sending
      // both would give away what the follow was for.
      const outcome = await sendFollowGate({
        connection,
        rule: loaded,
        recipient: { comment_id: comment.commentId },
        token,
      });
      if (outcome.ok) {
        sent = true;
        if (comment.fromId) {
          await rememberPending(admin, {
            orgId: connection.org_id,
            connectionId: connection.id,
            ruleId: rule.id,
            igUserId: comment.fromId,
          });
        }
      } else {
        problems.push(outcome.error);
      }
    } else {
      const outcome = await sendRuleMessage({
        connection,
        rule: loaded,
        recipient: { comment_id: comment.commentId },
        token,
      });
      if (outcome.ok) {
        sent = true;
        if (comment.fromId) {
          await sendEmailPrompt({ connection, rule: loaded, personId: comment.fromId, token });
        }
      } else {
        problems.push(outcome.error);
      }
    }
  }

  if (loaded.publicReply?.trim()) {
    const outcome = await replyToComment({
      commentId: comment.commentId,
      text: loaded.publicReply,
      token,
    });
    if (outcome.ok) sent = true;
    else problems.push(outcome.error);
  }

  if (sent) await bump(admin, rule.id, "sent_count");

  await finish(
    sent ? (problems.length > 0 ? "sent_with_errors" : "sent") : "failed",
    problems.join(" ") || undefined
  );
}
