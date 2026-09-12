import "server-only";
import { randomUUID } from "node:crypto";
import { sendFlowMessage, MetaApiError, describeMetaError } from "@/lib/meta-whatsapp";
import { isWithinServiceWindow, type OrgConnection, type RunnerClient } from "@/lib/whatsapp-send";
import type { FormScreen } from "@/lib/flow-json";

// Handing someone a form, from wherever the decision was made.
//
// There were three copies of this by the time forms could be sent from an
// agent's inbox, a chatbot node and the AI assistant — each one deciding
// for itself what to do about a draft form, a form with no screens, and
// the flow token. They drifted, as three copies do. This is the one path.
//
// The flow token is the whole mechanism: Meta echoes it back with the
// answers, and it is the only thing tying a submission to the person and
// the conversation it came from. Written to flow_sends before the message
// goes out would be wrong (the send can fail); written after is right,
// because a submission cannot arrive before the form does.

export interface FormSendResult {
  ok: boolean;
  error?: string;
  /** True when refused for the 24-hour window rather than by Meta. */
  outsideWindow?: boolean;
  /** What was actually sent as the message body, for logging it in the thread. */
  body?: string;
  waMessageId?: string | null;
}

/** The columns this needs. Selected the same way by every caller. */
export const FORM_SEND_COLUMNS =
  "id, name, meta_flow_id, status, screens, invitation, button_text" as const;

export interface SendableForm {
  id: string;
  name: string;
  meta_flow_id: string | null;
  status: string;
  screens: unknown;
  invitation: string | null;
  button_text: string | null;
}

/**
 * Sends a form into a conversation and records the token.
 *
 * `lastInboundAt` is checked unless the caller passes null with
 * `skipWindowCheck`. A form is an interactive message, not a template, so
 * outside the 24-hour window WhatsApp will not deliver it — refusing here
 * with a sentence beats letting Meta refuse with a code.
 */
export async function sendFormToContact({
  supabase,
  connection,
  form,
  toWaId,
  contactId,
  conversationId,
  orgId,
  source,
  body,
  buttonText,
  lastInboundAt,
  skipWindowCheck = false,
}: {
  supabase: RunnerClient;
  connection: OrgConnection;
  form: SendableForm;
  toWaId: string;
  contactId: string | null;
  conversationId: string | null;
  orgId: string;
  /** "inbox", "chatbot" or "assistant". */
  source: string;
  /** Overrides the form's own invitation. */
  body?: string | null;
  buttonText?: string | null;
  lastInboundAt: string | null;
  skipWindowCheck?: boolean;
}): Promise<FormSendResult> {
  if (!form.meta_flow_id) {
    return {
      ok: false,
      error: `"${form.name}" has not been sent to WhatsApp yet. Open it and press Update Flow first.`,
    };
  }

  const screens = (form.screens ?? []) as FormScreen[];
  const firstScreen = screens[0]?.screenId;
  if (!firstScreen) {
    return {
      ok: false,
      error:
        form.status === "published"
          ? // Synced from WhatsApp Manager: the row knows the id but not the
            // document, so there is no screen name to open it at.
            `"${form.name}" was built in WhatsApp Manager, so this app doesn't know which screen to open. Send it from a chatbot node with the screen named, or rebuild it here.`
          : `"${form.name}" has no screens yet.`,
    };
  }

  if (!skipWindowCheck && !isWithinServiceWindow(lastInboundAt)) {
    return {
      ok: false,
      outsideWindow: true,
      error:
        "Outside WhatsApp's 24-hour window. A form is an interactive message, so it will not deliver until the customer writes again.",
    };
  }

  const text =
    (body ?? "").trim() ||
    (form.invitation ?? "").trim() ||
    "Tap below to fill this in — it only takes a moment.";
  const cta = ((buttonText ?? "").trim() || (form.button_text ?? "").trim() || "Open form").slice(
    0,
    20
  );

  const flowToken = randomUUID();

  try {
    const result = await sendFlowMessage(connection.phoneNumberId, toWaId, connection.accessToken, {
      flowId: form.meta_flow_id,
      flowToken,
      cta,
      body: text,
      firstScreen,
      // A draft form opens only for numbers on your own WhatsApp account,
      // which is exactly what makes it testable before publishing.
      draft: form.status !== "published",
    });

    const waMessageId = result.messages[0]?.id ?? null;

    await supabase.from("flow_sends").insert({
      org_id: orgId,
      flow_id: form.id,
      contact_id: contactId,
      conversation_id: conversationId,
      wa_id: toWaId,
      flow_token: flowToken,
      wa_message_id: waMessageId,
      source,
    });

    return { ok: true, body: text, waMessageId };
  } catch (error) {
    if (error instanceof MetaApiError) {
      return { ok: false, error: describeMetaError(error.status, error.body) };
    }
    console.error("Failed to send a form", error);
    return { ok: false, error: "The form could not be sent." };
  }
}

/**
 * Writes the form into the conversation as an outbound message.
 *
 * Without this the agent sends a form and nothing appears in the thread —
 * so the next person to open it has no idea a form went out, and the
 * customer's answers arrive as a reply to nothing.
 */
export async function logFormMessage(
  supabase: RunnerClient,
  conversationId: string,
  form: { id: string; name: string },
  body: string,
  waMessageId: string | null
): Promise<void> {
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    type: "interactive",
    content: { body, form_id: form.id, form_name: form.name },
    wa_message_id: waMessageId,
    status: "sent",
  });

  await supabase
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
}
