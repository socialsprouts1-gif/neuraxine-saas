import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, SUPABASE_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/env";
import { resolveConnection } from "@/lib/connections";
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

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, wa_id")
    .eq("org_id", body.orgId)
    .eq("id", body.contactId)
    .maybeSingle();

  if (contactError || !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .upsert(
      { org_id: body.orgId, contact_id: contact.id },
      { onConflict: "org_id,contact_id", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Failed to resolve conversation" }, { status: 500 });
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
