import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, SUPABASE_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/env";
import { resolveConnection } from "@/lib/connections";
import { loadEntitlement, loadUsage } from "@/lib/entitlement";
import { checkLimit } from "@/lib/limits";
import {
  sendTemplateMessage,
  sendTextMessage,
  MetaApiError,
  InvalidAccessTokenError,
  describeMetaError,
  type MetaTemplateComponent,
} from "@/lib/meta-whatsapp";

interface SendRequestBody {
  orgId?: string;
  contactId?: string;
  /** Send on a specific number. Omit and the conversation's own is used. */
  connectionId?: string;
  /** Lets the reply go out on the number the customer wrote to. */
  conversationId?: string;
  body?: string;
  templateName?: string;
  language?: string;
  components?: MetaTemplateComponent[];
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: SUPABASE_NOT_CONFIGURED_MESSAGE }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const body = payload as SendRequestBody;
  if (!body.orgId || !body.contactId) {
    return NextResponse.json({ error: "orgId and contactId are required" }, { status: 400 });
  }
  const isTemplate = typeof body.templateName === "string";
  if (!isTemplate && !body.body) {
    return NextResponse.json(
      { error: "Provide either body, or templateName and language" },
      { status: 400 }
    );
  }
  if (isTemplate && !body.language) {
    return NextResponse.json({ error: "language is required with templateName" }, { status: 400 });
  }

  // RLS scopes every query below to orgs the caller is a member of — an
  // orgId the user doesn't belong to simply matches no rows.
  // Reply on the number the customer actually wrote to. Replying from a
  // different one shows the customer a new sender mid-conversation.
  const connection = await resolveConnection(supabase, body.orgId, {
    connectionId: body.connectionId ?? null,
    conversationId: body.conversationId ?? null,
  });

  if ("error" in connection) {
    return NextResponse.json({ error: connection.error }, { status: 404 });
  }

  // The plan's monthly message allowance. Checked before Meta is called,
  // because a message Meta has accepted is a message that has been sent —
  // there is no undoing it once the allowance turns out to be spent.
  const [entitlement, usage] = await Promise.all([
    loadEntitlement(supabase, body.orgId),
    loadUsage(supabase, body.orgId),
  ]);
  const allowance = checkLimit("messages", entitlement.limits.message_limit, usage.messages);
  if (!allowance.ok) {
    // 402: the request is well-formed and authorised, and payment is what
    // is missing. The composer renders `error` verbatim.
    return NextResponse.json({ error: allowance.reason }, { status: 402 });
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, wa_id")
    .eq("org_id", body.orgId)
    .eq("id", body.contactId)
    .maybeSingle();

  if (contactError || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const conversation = await resolveConversation(supabase, {
    orgId: body.orgId,
    contactId: contact.id,
    connectionId: connection.id,
    conversationId: body.conversationId ?? null,
  });

  if ("error" in conversation) {
    return NextResponse.json({ error: conversation.error }, { status: 500 });
  }

  const accessToken = connection.accessToken;

  try {
    const messageType = isTemplate ? "template" : "text";
    const content = isTemplate
      ? { template_name: body.templateName, language: body.language, components: body.components ?? [] }
      : { body: body.body };

    const result = isTemplate
      ? await sendTemplateMessage(
          connection.phoneNumberId,
          contact.wa_id,
          body.templateName!,
          body.language!,
          body.components ?? [],
          accessToken
        )
      : await sendTextMessage(connection.phoneNumberId, contact.wa_id, body.body!, accessToken);

    const waMessageId = result.messages[0]?.id ?? null;

    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        direction: "outbound",
        type: messageType,
        content,
        wa_message_id: waMessageId,
        status: "sent",
      })
      .select()
      .single();

    if (messageError) {
      console.error("Message sent to Meta but failed to log it", messageError);
    }

    // A human just replied. Stand the AI assistant down if it is configured
    // to — but only if the assistant was the thing answering. A keyword
    // chatbot is a different feature with its own on switch, and pausing it
    // because an agent typed one message is not what anyone asked for.
    //
    // The flow position is deliberately left alone: pausing should not throw
    // away where a parked conversation had got to.
    const standDown = await assistantShouldStandDown(supabase, body.orgId, conversation.id);

    await supabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        ...(standDown ? { bot_enabled: false, ai_mode: "human" as const } : {}),
      })
      .eq("id", conversation.id);

    if (standDown) {
      // Silent automation is the hardest kind of bug to report, so leave a
      // line in the timeline saying what happened and why.
      await supabase.from("conversation_events").insert({
        org_id: body.orgId,
        conversation_id: conversation.id,
        kind: "mode",
        label: "AI paused — a human replied",
      });
    }

    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof MetaApiError) {
      // The composer renders `error` verbatim, so it has to be the sentence
      // that names the fix — not the label "Meta API error" over raw JSON.
      console.error("Meta rejected an operator send", error.body);
      return NextResponse.json({ error: describeMetaError(error.status, error.body) }, { status: 502 });
    }
    if (error instanceof InvalidAccessTokenError) {
      // Stored before the paste-time check existed, or edited since. Either
      // way the operator needs the sentence, not "Failed to send message".
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to send WhatsApp message", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

/**
 * The thread this message belongs in.
 *
 * This used to be a one-line upsert naming `org_id,contact_id` as the
 * conflict target. The multi-number migration replaced that constraint with
 * one over `(org_id, contact_id, connection_id)`, and Postgres rejects an
 * ON CONFLICT clause whose target no longer exists — so every send from the
 * inbox failed with "Failed to resolve conversation" and no clue why.
 *
 * Written out longhand instead, because the right answer differs per caller:
 * the composer already knows its thread, and a workspace with two numbers
 * has two threads with the same person that must not be merged.
 */
async function resolveConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    orgId: string;
    contactId: string;
    connectionId: string;
    conversationId: string | null;
  }
): Promise<{ id: string } | { error: string }> {
  // The caller named a thread. Checked against the org and the contact
  // before it is believed — it arrives from the browser.
  if (input.conversationId) {
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", input.conversationId)
      .eq("org_id", input.orgId)
      .eq("contact_id", input.contactId)
      .maybeSingle();
    if (data) return { id: data.id };
  }

  // The thread this person has on the number being replied from. An error
  // here means the column is not there yet, which is a database behind the
  // migrations rather than a reason to refuse the send.
  const onNumber = await supabase
    .from("conversations")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("contact_id", input.contactId)
    .eq("connection_id", input.connectionId)
    .maybeSingle();

  if (onNumber.data) return { id: onNumber.data.id };
  const columnMissing = onNumber.error !== null;

  if (columnMissing) {
    const anyThread = await supabase
      .from("conversations")
      .select("id")
      .eq("org_id", input.orgId)
      .eq("contact_id", input.contactId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (anyThread.data) return { id: anyThread.data.id };
  }

  const row = {
    org_id: input.orgId,
    contact_id: input.contactId,
    ...(columnMissing ? {} : { connection_id: input.connectionId }),
  };

  const created = await supabase.from("conversations").insert(row).select("id").maybeSingle();
  if (created.data) return { id: created.data.id };

  // 23505: something inserted the same thread between the select and the
  // insert — an inbound message arriving while an agent typed. Read it back
  // rather than reporting a collision as a failure.
  if (created.error?.code === "23505") {
    const existing = await supabase
      .from("conversations")
      .select("id")
      .eq("org_id", input.orgId)
      .eq("contact_id", input.contactId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (existing.data) return { id: existing.data.id };
  }

  console.error("Could not resolve a conversation to send into", created.error);
  return {
    error: created.error
      ? `Could not open a conversation: ${created.error.message}${
          created.error.code ? ` (${created.error.code})` : ""
        }`
      : "Could not open a conversation for this contact.",
  };
}

/**
 * Whether the AI assistant should stop answering because a person just did.
 *
 * True only when a live assistant is set to stand down AND the assistant was
 * what last answered this conversation. Anything else — a keyword chatbot, an
 * FAQ entry, an automation, or nothing at all — is left running.
 */
async function assistantShouldStandDown(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  conversationId: string
): Promise<boolean> {
  const [{ data: assistants }, { data: lastRun }] = await Promise.all([
    supabase
      .from("ai_assistants")
      .select("id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .eq("stop_on_human", true)
      .limit(1),
    supabase
      .from("bot_runs")
      .select("matched_kind")
      .eq("conversation_id", conversationId)
      .in("outcome", ["replied", "handoff"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!assistants || assistants.length === 0) return false;
  return lastRun?.matched_kind === "assistant";
}
