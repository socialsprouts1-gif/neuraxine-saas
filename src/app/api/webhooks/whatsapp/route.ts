import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { notifyInboundMessage, runInboundMessage } from "@/lib/message-runner";
import { dispatchWebhookEvent } from "@/lib/outgoing-webhooks";
import { syncContact } from "@/lib/crm-sync";
import {
  loadPaymentSettings,
  recordInboundCart,
  updateOrderStatus,
} from "@/lib/commerce";
import { fillTemplate } from "@/lib/booking-dialogue";
import { formatAmount } from "@/lib/orders";
import { loadOrgConnection } from "@/lib/whatsapp-send";
import { readFlowReply } from "@/lib/flow-reply";

// --- Meta webhook payload shapes (loose — only the fields we read) -------

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: MetaWebhookValue;
    }>;
  }>;
}

interface MetaWebhookValue {
  messaging_product?: "whatsapp";
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  messages?: MetaInboundMessage[];
  statuses?: MetaStatusUpdate[];
}

interface MetaInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  [key: string]: unknown;
}

interface MetaStatusUpdate {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
}

const VALID_MESSAGE_STATUSES = new Set(["sent", "delivered", "read", "failed"]);

// --- GET: Meta's webhook verification handshake ---------------------------
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // No database to check the verify token against — fail closed, but
  // distinguish "not set up" from "wrong token" for whoever is debugging.
  if (!isSupabaseConfigured()) {
    return new NextResponse("Webhook not configured", { status: 503 });
  }

  const supabase = createAdminClient();
  const { data: connection } = await supabase
    .from("waba_connections")
    .select("id")
    .eq("webhook_verify_token", token)
    .maybeSingle();

  if (!connection) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

// --- POST: inbound messages + status updates ------------------------------

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (!isValidSignature(rawBody, signatureHeader)) {
    // Logged before rejecting: a burst of rejected deliveries is exactly the
    // signal worth seeing in the admin log viewer.
    after(() => logDelivery({ signatureValid: false, error: "Invalid X-Hub-Signature-256" }));
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  // One app can subscribe several object types to the same callback URL —
  // the Meta dashboard's Webhooks page makes it easy to switch the object
  // picker to User and turn on a dozen profile fields by mistake. Those
  // deliveries are signature-valid but have nothing to do with WhatsApp.
  // processWebhookPayload already ignores them, since it skips any change
  // whose field is not "messages"; stopping here just avoids opening a
  // service-role client and walking the payload to reach that conclusion.
  if (payload.object && payload.object !== "whatsapp_business_account") {
    return new NextResponse("EVENT_RECEIVED", { status: 200 });
  }

  // Meta expects a fast 200 and will retry (with backoff, then eventually
  // give up) if the callback is slow or errors — so ack immediately and do
  // the DB writes after the response is flushed.
  after(() => processWebhookPayload(payload).catch((error) => {
    console.error("Error processing WhatsApp webhook payload", error);
  }));

  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const [scheme, signatureHex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !signatureHex) return false;

  const expectedHex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(signatureHex, "hex");
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

// Records one delivery for the admin webhook log. Never throws: a logging
// failure must not take down webhook processing.
async function logDelivery(entry: {
  orgId?: string | null;
  phoneNumberId?: string | null;
  eventType?: string | null;
  signatureValid: boolean;
  payload?: unknown;
  error?: string | null;
}) {
  if (!isSupabaseConfigured()) return;
  try {
    await createAdminClient()
      .from("webhook_logs")
      .insert({
        org_id: entry.orgId ?? null,
        phone_number_id: entry.phoneNumberId ?? null,
        event_type: entry.eventType ?? null,
        signature_valid: entry.signatureValid,
        payload: entry.payload ?? null,
        error: entry.error ?? null,
      });
  } catch (error) {
    console.error("Failed to write webhook log", error);
  }
}

async function processWebhookPayload(payload: MetaWebhookPayload) {
  const supabase = createAdminClient();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      await processChangeValue(supabase, change.value);
    }
  }
}

async function processChangeValue(
  supabase: ReturnType<typeof createAdminClient>,
  value: MetaWebhookValue
) {
  const phoneNumberId = value.metadata?.phone_number_id;

  // Meta's "Test" button on the Webhooks page sends a sample payload whose
  // metadata may carry no real phone_number_id. Returning silently made
  // that indistinguishable from no delivery at all — which is exactly the
  // question the log exists to answer. Record it, then stop.
  if (!phoneNumberId) {
    await logDelivery({
      eventType: "unknown",
      signatureValid: true,
      payload: value,
      error: "Delivery carried no metadata.phone_number_id — likely a test payload from the Meta dashboard.",
    });
    return;
  }

  const { data: connection, error: connectionError } = await supabase
    .from("waba_connections")
    .select("org_id, id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();

  const eventType = value.messages?.length
    ? "messages"
    : value.statuses?.length
      ? "statuses"
      : "unknown";

  if (connectionError || !connection) {
    await logDelivery({
      phoneNumberId,
      eventType,
      signatureValid: true,
      payload: value,
      error: `No waba_connections row for phone_number_id ${phoneNumberId}`,
    });
    console.error(`No waba_connection found for phone_number_id ${phoneNumberId}`, connectionError);
    return;
  }

  await logDelivery({
    orgId: connection.org_id,
    phoneNumberId,
    eventType,
    signatureValid: true,
    payload: value,
  });

  if (value.messages?.length) {
    await handleInboundMessages(supabase, connection.org_id, connection.id, value);
  }
  if (value.statuses?.length) {
    await handleStatusUpdates(supabase, value.statuses);
    // A payment made inside WhatsApp arrives attached to a status, not as a
    // message. Handled after the ordinary status update, which is about the
    // message's delivery rather than the money.
    await handleWhatsAppPayments(supabase, connection.org_id, value.statuses);
  }
}

/** A payment update as Meta attaches it to a message status. */
interface MetaPaymentUpdate {
  reference_id?: string;
  transaction?: {
    id?: string;
    status?: string;
    type?: string;
  };
  status?: string;
}

/**
 * Marks an order paid when the customer paid inside WhatsApp.
 *
 * Meta's own guidance is not to trust the status in the webhook on its own
 * and to confirm against the payment lookup API — which is behind the same
 * alpha-stage payments programme as the rest of this flow. Until this app
 * has access to it, the compromise is deliberate and narrow: only a
 * `captured`/`success` transaction on an order we are actually awaiting
 * payment for moves anything, and the transaction id is stored so a
 * reconciliation later has something to check against.
 */
async function handleWhatsAppPayments(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  statuses: MetaStatusUpdate[]
): Promise<void> {
  for (const status of statuses) {
    const payment = (status as unknown as { payment?: MetaPaymentUpdate }).payment;
    const reference = payment?.reference_id;
    if (!payment || !reference) continue;

    const state = (payment.transaction?.status ?? payment.status ?? "").toLowerCase();
    const settled = state === "captured" || state === "success" || state === "completed";

    try {
      const { data: order } = await supabase
        .from("store_orders")
        .select("id, org_id, reference, status, currency, total_cents, conversation_id")
        .eq("org_id", orgId)
        .eq("reference", reference)
        .maybeSingle();

      if (!order) continue;

      await supabase
        .from("store_orders")
        .update({
          payment_status: state || "unknown",
          payment_reference: payment.transaction?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      // Redelivery is normal, and marking an order paid twice would send the
      // customer a second thank-you.
      if (!settled || order.status === "paid" || order.status === "confirmed") continue;

      const settings = await loadPaymentSettings(supabase, orgId);
      const connection = await loadOrgConnection(supabase, orgId, {
        conversationId: order.conversation_id,
      });

      await updateOrderStatus({
        supabase,
        orgId,
        orderId: order.id,
        status: "paid",
        notify: connection
          ? {
              connection,
              body: fillTemplate(settings.payment_received_message, {
                reference: order.reference,
                total: formatAmount(order.total_cents, order.currency),
              }),
            }
          : null,
      });

      await dispatchWebhookEvent(supabase, orgId, "order.paid", {
        reference: order.reference,
        total_cents: order.total_cents,
        currency: order.currency,
        provider: "whatsapp",
      });
    } catch (error) {
      console.error("Handling a WhatsApp payment update failed", error);
    }
  }
}

async function handleInboundMessages(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  connectionId: string,
  value: MetaWebhookValue
) {
  const nameByWaId = new Map(
    (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name] as const)
  );

  for (const message of value.messages ?? []) {
    const waId = message.from;
    const name = nameByWaId.get(waId);

    const contactPayload: { org_id: string; wa_id: string; name?: string } = {
      org_id: orgId,
      wa_id: waId,
    };
    // Only include name when Meta actually sent one, so a repeat message
    // without a contacts[] entry doesn't null out a name we already have.
    if (name) contactPayload.name = name;

    // Whether this contact is new decides both the contact.created event
    // and, downstream, whether a welcome bot should greet them — so check
    // before the upsert rather than trying to infer it afterwards.
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("wa_id", waId)
      .maybeSingle();

    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .upsert(contactPayload, { onConflict: "org_id,wa_id" })
      .select("id, name")
      .single();

    if (contactError || !contact) {
      console.error("Failed to upsert contact", contactError);
      continue;
    }

    const timestampMs = Number(message.timestamp) * 1000;
    const receivedAt = new Date(timestampMs).toISOString();

    const conversation = await upsertConversation(supabase, {
      orgId,
      contactId: contact.id,
      connectionId,
      receivedAt,
    });

    if (!conversation) {
      // Nothing else in this loop can run without a thread to hang the
      // message on, and dropping it here at least leaves a log line.
      continue;
    }

    const content = extractMessageContent(message);

    const { error: messageError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      type: message.type,
      content,
      wa_message_id: message.id,
      status: "delivered",
    });

    if (messageError) {
      // Stop here rather than running the bot: the runner counts stored
      // inbound messages to recognise a first message, and replying to a
      // message that never made it into the thread would leave the inbox
      // showing an answer to nothing.
      console.error("Failed to insert inbound message", messageError);
      continue;
    }

    if (!existingContact) {
      await dispatchWebhookEvent(supabase, orgId, "contact.created", {
        id: contact.id,
        wa_id: waId,
        name: contact.name,
      });

      // Into the CRM as soon as they exist here, so a lead that arrives at
      // 2am is in the sales team's pipeline before anyone reads the message.
      // Only on the first message: pushing on every inbound would be three
      // HTTP calls per message for a record that has not changed. syncContact
      // never throws and never blocks on a slow CRM for more than a few
      // seconds.
      await syncContact(supabase, orgId, contact.id);
    }

    // A cart. The customer picked items out of the catalogue in WhatsApp and
    // sent them; Meta delivers it as its own message type, not an
    // interactive reply. Recorded before the bot runs so an order survives
    // even if an automation later fails on the same message.
    if (message.type === "order") {
      await handleInboundOrder(supabase, orgId, {
        order: (message.order ?? {}) as InboundOrder,
        conversationId: conversation.id,
        contactId: contact.id,
        contactWaId: waId,
        contactName: contact.name,
      });
    }

    // A completed WhatsApp Form arrives as an ordinary interactive message.
    // Recording it before the bot runs means a submission survives even if
    // an automation later fails on the same message.
    if (message.type === "interactive") {
      await recordFlowSubmission(supabase, orgId, {
        content,
        waId,
        contactId: contact.id,
        conversationId: conversation.id,
      });
    }

    await notifyInboundMessage(supabase, orgId, {
      conversationId: conversation.id,
      contactId: contact.id,
      contactWaId: waId,
      contactName: contact.name,
      waMessageId: message.id,
      messageType: message.type,
      content,
    });

    // Last, so a bot failure cannot cost the customer their message or
    // the org their webhook event.
    await runInboundMessage({
      supabase,
      orgId,
      conversationId: conversation.id,
      contactId: contact.id,
      contactWaId: waId,
      contactName: contact.name,
      waMessageId: message.id,
      messageType: message.type,
      content,
    });
  }
}

async function handleStatusUpdates(
  supabase: ReturnType<typeof createAdminClient>,
  statuses: MetaStatusUpdate[]
) {
  for (const status of statuses) {
    if (!VALID_MESSAGE_STATUSES.has(status.status)) continue;

    const { data: updated, error } = await supabase
      .from("messages")
      .update({ status: status.status as "sent" | "delivered" | "read" | "failed" })
      .eq("wa_message_id", status.id)
      .select("id, org_id")
      .maybeSingle();

    if (error) {
      console.error(`Failed to update status for message ${status.id}`, error);
      continue;
    }

    // Statuses also arrive for messages we never stored (sent from the
    // Meta console, say). Only forward the ones we can attribute to an org.
    if (updated) {
      await dispatchWebhookEvent(supabase, updated.org_id, "message.status", {
        message_id: updated.id,
        wa_message_id: status.id,
        status: status.status,
        recipient_wa_id: status.recipient_id,
      });
    }
  }
}

/**
 * Stores the answers from a completed WhatsApp Form.
 *
 * The flow token is the only thing tying a submission to the person who was
 * sent the form — Meta echoes back what we generated at send time and
 * nothing else identifies the send. A submission with an unknown token is
 * still kept: losing a customer's answers because a row went missing is the
 * worse failure.
 */
async function recordFlowSubmission(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  context: {
    content: Record<string, unknown>;
    waId: string;
    contactId: string;
    conversationId: string;
  }
) {
  const reply = readFlowReply(context.content);
  if (!reply) return;

  const { data: send } = reply.token
    ? await supabase
        .from("flow_sends")
        .select("flow_id")
        .eq("org_id", orgId)
        .eq("flow_token", reply.token)
        .maybeSingle()
    : { data: null };

  const { error } = await supabase.from("flow_responses").insert({
    org_id: orgId,
    flow_id: send?.flow_id ?? null,
    contact_id: context.contactId,
    conversation_id: context.conversationId,
    wa_id: context.waId,
    flow_token: reply.token,
    answers: reply.answers,
  });

  if (error) {
    console.error("Failed to store flow submission", error);
    return;
  }

  await dispatchWebhookEvent(supabase, orgId, "form.submitted", {
    flow_id: send?.flow_id ?? null,
    wa_id: context.waId,
    contact_id: context.contactId,
    answers: reply.answers,
  });
}

/**
 * Finds or creates the thread this message belongs to.
 *
 * Tried with the connection, then without. A customer's message must never
 * be dropped because a migration has not been applied yet: this used to
 * fail outright on a database with no `connection_id`, and since the only
 * handling was `continue`, Meta delivered the message, the webhook logged
 * the delivery as valid, and the message vanished. Inbound has to survive
 * a schema that is behind the code.
 */
async function upsertConversation(
  supabase: ReturnType<typeof createAdminClient>,
  input: { orgId: string; contactId: string; connectionId: string; receivedAt: string }
): Promise<{ id: string } | null> {
  const base = {
    org_id: input.orgId,
    contact_id: input.contactId,
    last_message_at: input.receivedAt,
    // Stamped on every inbound message: it is what the send helper reads
    // to decide whether WhatsApp's 24-hour service window is still open.
    last_inbound_at: input.receivedAt,
    status: "open" as const,
  };

  // Which of the workspace's numbers this arrived on. Replies read it back,
  // so an answer always leaves from the number the customer wrote to.
  const withConnection = await supabase
    .from("conversations")
    .upsert(
      { ...base, connection_id: input.connectionId },
      { onConflict: "org_id,contact_id,connection_id" }
    )
    .select("id")
    .maybeSingle();

  if (!withConnection.error && withConnection.data) return withConnection.data;

  const fallback = await supabase
    .from("conversations")
    .upsert(base, { onConflict: "org_id,contact_id" })
    .select("id")
    .maybeSingle();

  if (fallback.error || !fallback.data) {
    console.error("Failed to upsert conversation", fallback.error ?? withConnection.error);
    return null;
  }

  // Worth knowing about: every reply will pick a number by the default
  // rather than by the thread until the migration lands.
  console.warn(
    "Stored an inbound message without its WhatsApp number — run the multi-number migration."
  );
  return fallback.data;
}

function extractMessageContent(message: MetaInboundMessage): Record<string, unknown> {
  // The type-specific payload (text/image/video/audio/document/location/
  // interactive/button/reaction/...) lives under a key matching `type`.
  // Fall back to the whole message for types with no such sub-object.
  const typed = message[message.type];
  return typed && typeof typed === "object" ? (typed as Record<string, unknown>) : message;
}

/** The cart, as Meta reports it on an inbound order message. */
interface InboundOrder {
  catalog_id?: string;
  text?: string;
  product_items?: unknown[];
}

/**
 * Records a cart a customer sent from the catalogue.
 *
 * Never throws: an order that cannot be saved must not cost the customer
 * their message or the workspace its automation. The failure is logged and
 * the message carries on down the pipeline as an ordinary one.
 */
async function handleInboundOrder(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  args: {
    order: InboundOrder;
    conversationId: string;
    contactId: string;
    contactWaId: string;
    contactName: string | null;
  }
): Promise<void> {
  try {
    // The number the customer wrote to, not the workspace default: an
    // acknowledgement has to come from the number they contacted.
    const connection = await loadOrgConnection(supabase, orgId, {
      conversationId: args.conversationId,
    });
    if (!connection) {
      console.error("A cart arrived but no connection could be loaded to answer on");
      return;
    }

    const result = await recordInboundCart(
      {
        supabase,
        connection,
        orgId,
        conversationId: args.conversationId,
        contactId: args.contactId,
        contactWaId: args.contactWaId,
        contactName: args.contactName,
      },
      args.order
    );

    if (result?.error) {
      console.error(`Cart ${result.reference || "(unsaved)"} had a problem: ${result.error}`);
      return;
    }

    if (result) {
      await dispatchWebhookEvent(supabase, orgId, "order.created", {
        reference: result.reference,
        total_cents: result.totals.totalCents,
        items: result.lineCount,
        contact_wa_id: args.contactWaId,
      });
    }
  } catch (error) {
    console.error("Handling the inbound cart failed", error);
  }
}
