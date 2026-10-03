import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { templateMessageContent } from "@/lib/message-preview";

// Putting an outbound template into the inbox.
//
// The hole this fills: a campaign sent a template to twenty people and
// wrote the result into campaign_recipients — sent, failed, the Meta
// message id — and nowhere else. campaign_recipients is a delivery ledger
// that only the Campaigns page reads. The Inbox reads conversations and
// messages, and nothing ever wrote a row into either, so twenty messages
// left the business and the inbox showed no trace of any of them.
//
// From the outside that looks exactly like the campaign not having sent.
// The only threads that appeared were the ones where somebody wrote back,
// because an inbound message goes through the webhook, which does create
// the contact, the conversation and the message properly. So the product
// could show you a customer's reply to a message it could not show you
// sending.
//
// This is the same three steps the webhook takes for an inbound message,
// in the same order and with the same fallbacks, run for an outbound one.

type Client = SupabaseClient<Database>;

export interface OutboundTemplateLog {
  orgId: string;
  /** Which of the workspace's numbers it went out from. */
  connectionId: string;
  /** The recipient, in Meta's wa_id form — digits, no plus. */
  waId: string;
  /** Known name, if the audience carried one. Never overwrites a better one. */
  contactName?: string | null;
  templateName: string;
  language: string;
  /** The filled-in body, so the thread shows what was actually received. */
  body: string;
  /** The campaign or automation this came from, for the thread to name. */
  source?: string;
  waMessageId?: string | null;
  /**
   * When it was sent. Defaults to now, which is right for a live send and
   * wrong for a backfill — a message from last Tuesday must not sort to
   * the top of the inbox as if it had just arrived.
   */
  sentAt?: string;
}

export interface OutboundLogResult {
  conversationId: string;
  contactId: string;
}

/**
 * Records a template that has already been sent, creating the contact and
 * the conversation if this is the first the workspace has heard of them.
 *
 * Returns null rather than throwing on any failure. Every caller is on the
 * far side of a successful Meta send: the message is already with the
 * customer, and throwing here would either abort a batch mid-flight or —
 * worse — make a retry send it to them twice. A lost log line costs one
 * row in the inbox; a double send costs the recipient's goodwill and the
 * number's quality rating.
 */
export async function recordOutboundTemplate(
  supabase: Client,
  input: OutboundTemplateLog
): Promise<OutboundLogResult | null> {
  try {
    const contactId = await ensureContact(supabase, input);
    if (!contactId) return null;

    const conversationId = await ensureConversation(supabase, input.orgId, contactId, input.connectionId);
    if (!conversationId) return null;

    const sentAt = input.sentAt ?? new Date().toISOString();

    const { error: messageError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      type: "template",
      created_at: sentAt,
      content: templateMessageContent({
        templateName: input.templateName,
        language: input.language,
        body: input.body,
        source: input.source,
      }),
      wa_message_id: input.waMessageId ?? null,
      status: "sent",
    });

    if (messageError) {
      // 23505 is the unique index on wa_message_id: this exact message is
      // already logged, which happens when a batch is retried after a
      // partial failure. Not an error — the row we wanted exists.
      if (messageError.code !== "23505") {
        console.error("Sent the template but could not log it to the inbox", messageError);
        return null;
      }
    }

    // last_message_at is what orders the conversation list, so without
    // this the new thread sorts to the bottom of the inbox — present, but
    // below every old conversation, which is close enough to missing.
    //
    // Never moved backwards: a backfill of last week's campaign must not
    // drag a thread that has been active since back down the list.
    const { data: thread } = await supabase
      .from("conversations")
      .select("last_message_at")
      .eq("id", conversationId)
      .maybeSingle();

    const current = thread?.last_message_at ? Date.parse(thread.last_message_at) : 0;
    if (!(current > Date.parse(sentAt))) {
      await supabase
        .from("conversations")
        .update({ last_message_at: sentAt })
        .eq("id", conversationId);
    }

    return { conversationId, contactId };
  } catch (error) {
    console.error("Could not record an outbound template", error);
    return null;
  }
}

/** The contact for this number, created on first contact. */
async function ensureContact(supabase: Client, input: OutboundTemplateLog): Promise<string | null> {
  const existing = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("wa_id", input.waId)
    .maybeSingle();

  if (existing.data) return existing.data.id;

  const name = (input.contactName ?? "").trim();
  const created = await supabase
    .from("contacts")
    .upsert(
      {
        org_id: input.orgId,
        wa_id: input.waId,
        // Only when we have one. Sending a null would wipe a name that
        // arrived from an import or an earlier reply.
        ...(name ? { name } : {}),
      },
      { onConflict: "org_id,wa_id" }
    )
    .select("id")
    .maybeSingle();

  if (created.data) return created.data.id;

  // Raced with an inbound message from the same person. Read it back.
  const reread = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("wa_id", input.waId)
    .maybeSingle();

  if (reread.data) return reread.data.id;

  console.error("Could not resolve a contact for an outbound template", created.error);
  return null;
}

/**
 * The thread this person has on this number.
 *
 * Per number, not per contact: a workspace with two WhatsApp numbers has
 * two conversations with the same customer, and the campaign has to land
 * in the one belonging to the number it sent from — which is the whole
 * question being asked ("which number did I send this on?").
 *
 * Falls back to a number-less thread when the connection_id column is not
 * there yet, the same way the webhook does, so this works on a database
 * that is behind on migrations rather than failing every send.
 */
async function ensureConversation(
  supabase: Client,
  orgId: string,
  contactId: string,
  connectionId: string
): Promise<string | null> {
  const onNumber = await supabase
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (onNumber.data) return onNumber.data.id;

  // An error here is the column not existing, not "no such row".
  const columnMissing = onNumber.error !== null;

  if (columnMissing) {
    const anyThread = await supabase
      .from("conversations")
      .select("id")
      .eq("org_id", orgId)
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (anyThread.data) return anyThread.data.id;
  }

  const created = await supabase
    .from("conversations")
    .insert({
      org_id: orgId,
      contact_id: contactId,
      status: "open" as const,
      ...(columnMissing ? {} : { connection_id: connectionId }),
    })
    .select("id")
    .maybeSingle();

  if (created.data) return created.data.id;

  if (created.error?.code === "23505") {
    const existing = await supabase
      .from("conversations")
      .select("id")
      .eq("org_id", orgId)
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (existing.data) return existing.data.id;
  }

  console.error("Could not open a conversation for an outbound template", created.error);
  return null;
}
