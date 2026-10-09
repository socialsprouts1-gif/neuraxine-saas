import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadOrgConnection, sendAndLogText } from "@/lib/whatsapp-send";
import { dueForSend, isStale } from "@/lib/scheduled-message";

// Delivering the messages somebody wrote earlier.
//
// Runs from the same daily sweep as everything else. The 24-hour service
// window is deliberately not skipped: a scheduled follow-up to somebody
// who has not written in a day is exactly the message WhatsApp requires a
// template for, and sending it as free text would be refused by Meta with
// an error nobody is watching for.

export interface DispatchResult {
  due: number;
  sent: number;
  failed: number;
  stale: number;
  error?: string;
}

const EMPTY: DispatchResult = { due: 0, sent: 0, failed: 0, stale: 0 };

/** One run should finish inside a serverless invocation. */
const BATCH = 50;

/**
 * @param orgId Only this workspace's messages. Passed when the app itself
 *   drives a run — a signed-in person may push their own queue along, and
 *   must not be able to push everybody else's.
 */
export async function dispatchScheduledMessages(
  now: Date = new Date(),
  orgId?: string
): Promise<DispatchResult> {
  const supabase = createAdminClient();
  const result: DispatchResult = { ...EMPTY };

  let query = supabase
    .from("scheduled_messages")
    .select("id, org_id, contact_id, wa_id, connection_id, body, send_at, status")
    .eq("status", "pending")
    .lte("send_at", now.toISOString())
    .order("send_at")
    .limit(BATCH);

  if (orgId) query = query.eq("org_id", orgId);

  const { data: rows, error } = await query;

  if (error) return { ...EMPTY, error: error.message };

  const due = dueForSend(rows ?? [], now);
  result.due = due.length;

  for (const row of due) {
    // Claimed before sending. A slow send must not let the next run pick
    // the same row up and deliver it twice.
    const { data: claimed } = await supabase
      .from("scheduled_messages")
      .update({ status: "sent", updated_at: now.toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    // Lost the race to another run. That is the correct outcome, not an error.
    if (!claimed) continue;

    // Too late to be useful. A Tuesday-morning follow-up arriving on Friday
    // night reads as a business that has lost track of the conversation, so
    // it is failed and left visible rather than sent regardless.
    if (isStale(row.send_at, now)) {
      await supabase
        .from("scheduled_messages")
        .update({
          status: "failed",
          error: "Not sent: more than a day late, so it would have arrived at the wrong moment.",
          updated_at: now.toISOString(),
        })
        .eq("id", row.id);
      result.stale += 1;
      continue;
    }

    try {
      const connection = await loadOrgConnection(supabase, row.org_id, {
        connectionId: row.connection_id,
      });

      if (!connection) {
        await fail(supabase, row.id, "No active WhatsApp number to send from.", now);
        result.failed += 1;
        continue;
      }

      // The thread this belongs in. WhatsApp only allows free text inside
      // the 24-hour service window, which is measured on a conversation —
      // so a contact who has never written cannot be sent one at all, and
      // saying that plainly beats a Meta error nobody is watching for.
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id, last_inbound_at")
        .eq("org_id", row.org_id)
        .eq("contact_id", row.contact_id ?? "")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conversation) {
        await fail(
          supabase,
          row.id,
          "No WhatsApp conversation with this contact, so a plain message cannot be sent. They have to write first, or it has to go as an approved template.",
          now
        );
        result.failed += 1;
        continue;
      }

      const outcome = await sendAndLogText({
        supabase,
        connection,
        conversationId: conversation.id,
        toWaId: row.wa_id,
        body: row.body,
        lastInboundAt: conversation.last_inbound_at,
      });

      if (outcome.ok) {
        await supabase
          .from("scheduled_messages")
          .update({
            sent_at: now.toISOString(),
            wa_message_id: outcome.waMessageId ?? null,
            error: null,
            updated_at: now.toISOString(),
          })
          .eq("id", row.id);
        result.sent += 1;
      } else {
        await fail(supabase, row.id, outcome.error ?? "WhatsApp refused the message.", now);
        result.failed += 1;
      }
    } catch (problem) {
      await fail(
        supabase,
        row.id,
        problem instanceof Error ? problem.message : "Unknown failure",
        now
      );
      result.failed += 1;
    }
  }

  return result;
}

/**
 * Records a failure against the row.
 *
 * Marked failed rather than returned to pending: a message that cannot be
 * sent now will not become sendable by trying again in a day, and a row
 * that keeps retrying is one nobody ever looks at.
 */
async function fail(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  error: string,
  now: Date
): Promise<void> {
  await supabase
    .from("scheduled_messages")
    .update({ status: "failed", error: error.slice(0, 500), updated_at: now.toISOString() })
    .eq("id", id);
}
