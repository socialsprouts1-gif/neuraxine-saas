import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { resolveConnection } from "@/lib/connections";
import {
  MetaApiError,
  InvalidAccessTokenError,
  describeMetaError,
  isMetaAuthError,
  sendInteractiveButtons,
  sendTextMessage,
  type MetaReplyButton,
} from "@/lib/meta-whatsapp";

// The single outbound path used by anything that is not a user clicking
// "send" in the inbox: the message runner today, campaigns and reminders
// next. It owns three things the callers kept getting wrong individually —
// decrypting the org's token, honouring WhatsApp's 24-hour service window,
// and logging the outbound message so it shows up in the thread.

export type RunnerClient = SupabaseClient<Database>;

// WhatsApp permits free-form messages only within 24 hours of the
// customer's last inbound message. Outside it, Meta rejects anything that
// is not an approved template.
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OrgConnection {
  /** waba_connections.id — needed to record credential failures against it. */
  id: string;
  phoneNumberId: string;
  accessToken: string;
  /** Whatever we last recorded, so a success knows whether to clear it. */
  lastError: string | null;
}

export type SendOutcome =
  | { ok: true; waMessageId: string | null }
  | { ok: false; error: string; outsideWindow?: boolean };

/**
 * Loads and decrypts the org's active WhatsApp credentials.
 *
 * Returns null rather than throwing when there is no active connection —
 * an org that has not finished onboarding is an ordinary state, not an
 * error worth aborting webhook processing over.
 */
export async function loadOrgConnection(
  supabase: RunnerClient,
  orgId: string,
  options: { conversationId?: string | null; connectionId?: string | null } = {}
): Promise<OrgConnection | null> {
  // A workspace can have several numbers. An automation reply has to go out
  // on the one the customer actually wrote to, or the answer arrives from a
  // number they have never messaged.
  const resolved = await resolveConnection(supabase, orgId, options);

  // Null rather than the reason: an org part-way through onboarding is an
  // ordinary state, not something worth aborting webhook processing over.
  if ("error" in resolved) return null;

  return {
    id: resolved.id,
    phoneNumberId: resolved.phoneNumberId,
    accessToken: resolved.accessToken,
    lastError: resolved.lastError,
  };
}

export function isWithinServiceWindow(
  lastInboundAt: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!lastInboundAt) return false;
  const inboundMs = new Date(lastInboundAt).getTime();
  if (Number.isNaN(inboundMs)) return false;
  return now - inboundMs < SERVICE_WINDOW_MS;
}

interface SendArgs {
  supabase: RunnerClient;
  connection: OrgConnection;
  conversationId: string;
  toWaId: string;
  body: string;
  buttons?: MetaReplyButton[];
  /**
   * Skip the window check. Only for sends that answer an inbound message
   * we are holding in hand — there the window is open by definition and
   * re-reading a just-written column would only add a round trip.
   */
  skipWindowCheck?: boolean;
  /** Used for the window check when it is not skipped. */
  lastInboundAt?: string | null;
}

/**
 * Sends a free-form message and records it on the conversation.
 *
 * Never throws: every caller is inside webhook processing, where an
 * exception is a silently dropped customer message.
 */
export async function sendAndLogText({
  supabase,
  connection,
  conversationId,
  toWaId,
  body,
  buttons,
  skipWindowCheck = false,
  lastInboundAt,
}: SendArgs): Promise<SendOutcome> {
  if (!skipWindowCheck && !isWithinServiceWindow(lastInboundAt)) {
    return {
      ok: false,
      outsideWindow: true,
      error:
        "Outside WhatsApp's 24-hour service window — only approved templates can be sent to this contact.",
    };
  }

  const useButtons = Boolean(buttons?.length);

  let waMessageId: string | null = null;
  try {
    const result = useButtons
      ? await sendInteractiveButtons(
          connection.phoneNumberId,
          toWaId,
          body,
          buttons!,
          connection.accessToken
        )
      : await sendTextMessage(connection.phoneNumberId, toWaId, body, connection.accessToken);

    waMessageId = result.messages[0]?.id ?? null;
  } catch (error) {
    if (error instanceof MetaApiError) {
      const message = describeMetaError(error.status, error.body);
      console.error(`Failed to send to ${toWaId}: ${message}`, error.body);

      // A credential rejection is not about this message — every send will
      // fail identically until someone reconnects. Park it on the connection
      // so Integrations can say so without waiting for the next customer.
      if (isMetaAuthError(error.status, error.body)) {
        await recordConnectionError(supabase, connection.id, message);
      }
      return { ok: false, error: message };
    }

    if (error instanceof InvalidAccessTokenError) {
      // Same class of problem as a rejected token: every send fails until
      // someone pastes a good one, so it belongs on the connection.
      await recordConnectionError(supabase, connection.id, error.message);
      return { ok: false, error: error.message };
    }

    const message = error instanceof Error ? error.message : "Unknown send failure";
    console.error(`Failed to send to ${toWaId}`, error);
    return { ok: false, error: message };
  }

  // The credentials just worked, so any recorded failure is stale.
  if (connection.lastError) {
    await recordConnectionError(supabase, connection.id, null);
  }

  // The message went out. From here on failures are logging failures — do
  // not report them as send failures, or a retry would double-send.
  const sentAt = new Date().toISOString();

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    type: useButtons ? "interactive" : "text",
    content: useButtons ? { body, buttons } : { body },
    wa_message_id: waMessageId,
    status: "sent",
  });

  if (messageError) {
    console.error("Sent to WhatsApp but failed to log the outbound message", messageError);
  }

  const { error: conversationError } = await supabase
    .from("conversations")
    .update({ last_message_at: sentAt })
    .eq("id", conversationId);

  if (conversationError) {
    console.error("Failed to bump conversation last_message_at", conversationError);
  }

  return { ok: true, waMessageId };
}

/**
 * Stamps (or clears) the last credential-level rejection on a connection.
 *
 * Never throws and never blocks the send result: this is a hint for the
 * Integrations page, not part of delivering the message.
 */
async function recordConnectionError(
  supabase: RunnerClient,
  connectionId: string,
  message: string | null
): Promise<void> {
  const { error } = await supabase
    .from("waba_connections")
    .update({ last_error: message, last_error_at: message ? new Date().toISOString() : null })
    .eq("id", connectionId);

  if (error) {
    console.error("Failed to record connection health", error);
  }
}
