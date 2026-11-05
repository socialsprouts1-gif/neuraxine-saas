import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveConnection } from "@/lib/connections";
import { sendTemplateMessage, describeMetaError, MetaApiError } from "@/lib/meta-whatsapp";
import { normaliseWaNumber } from "@/lib/whatsapp-link";
import { recordOutboundTemplate } from "@/lib/outbound-log";
import { otpButtonIndex, resolveTemplateShape } from "@/lib/template-unpack";
import { variableCount } from "@/lib/template-variables";
import { otpComponents } from "@/lib/signup-otp";
import {
  readEvents,
  canSend,
  eventComponents,
  greetingName,
  eventSource,
  type EventKey,
} from "@/lib/whatsapp-events";

// Sending one of the platform's own messages to one of its customers.
//
// Every moment that matters — signing up, a trial running out, a payment
// landing — is the same three steps: look up what template was configured
// for it, send it to the number they gave, log it. So there is one
// function rather than one per moment.
//
// Nothing here is allowed to fail loudly. These run alongside something
// the customer is actually doing, and a message that could not be sent
// must never turn a successful sign-up or a successful payment into an
// error on their screen.

const SETTING = "platform_whatsapp";

export interface PlatformSendResult {
  sent: boolean;
  /** For the server log and the admin test button only. */
  reason?: string;
  /**
   * True when nothing was sent because nothing is set up yet, as opposed to
   * a delivery that was tried and failed.
   *
   * The difference matters on the sign-up form: a stranger must not be
   * shown a Meta error, but "no template is configured" is worth saying out
   * loud, because the person who will hit it first is whoever runs this
   * business, testing their own sign-up.
   */
  setup?: boolean;
}

/**
 * Sends the configured template for one event to one person.
 *
 * Idempotent per person per event: the log of what was sent is the record
 * of having sent it, so there is no second flag to keep in step with
 * reality. Somebody who signs up, lets their trial lapse and pays gets
 * three different messages; somebody whose payment webhook is redelivered
 * gets one.
 */
export async function sendPlatformEvent(
  key: EventKey,
  recipient: { waId: string; name?: string | null }
): Promise<PlatformSendResult> {
  try {
    const waId = normaliseWaNumber(recipient.waId ?? "");
    if (!waId) return { sent: false, reason: "No usable WhatsApp number" };

    const admin = createAdminClient();

    const { data: setting } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", SETTING)
      .maybeSingle();

    const settings = readEvents(setting?.value);
    if (!canSend(settings, key)) {
      return { sent: false, reason: `No ${key} message is set up` };
    }

    const source = eventSource(key);

    if (await alreadySent(admin, settings.orgId, waId, source)) {
      return { sent: false, reason: "Already sent" };
    }

    const connection = await resolveConnection(admin, settings.orgId, {
      connectionId: settings.connectionId || null,
    });
    if ("error" in connection) return { sent: false, reason: connection.error };

    const message = settings.messages[key];
    const name = greetingName(recipient.name);

    const result = await sendTemplateMessage(
      connection.phoneNumberId,
      waId,
      message.templateName,
      message.language,
      eventComponents(settings, key, name),
      connection.accessToken
    );

    // Into the platform's own inbox, so whoever runs this business sees
    // every one of these as a conversation rather than as a log line —
    // and so a reply lands somewhere a person will read it.
    await recordOutboundTemplate(admin, {
      orgId: settings.orgId,
      connectionId: connection.id,
      waId,
      contactName: recipient.name ?? null,
      templateName: message.templateName,
      language: message.language,
      body: `${source}${name ? ` — ${name}` : ""}`,
      // Also how a repeat is recognised, which is why it is the event's
      // own label rather than something generic.
      source,
      waMessageId: result.messages[0]?.id ?? null,
    });

    return { sent: true };
  } catch (error) {
    const reason =
      error instanceof MetaApiError
        ? describeMetaError(error.status, error.body)
        : error instanceof Error
          ? error.message
          : "Unknown failure";
    console.error(`Could not send the ${key} message`, reason);
    return { sent: false, reason };
  }
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Whether this number has had this particular message already.
 *
 * Read from the messages themselves rather than a flag: the log of what
 * was sent is the record of having sent it, and a separate flag is one
 * more thing that can disagree with reality — recording a message that
 * never went out is worse than sending none.
 */
async function alreadySent(
  admin: Admin,
  orgId: string,
  waId: string,
  source: string
): Promise<boolean> {
  const { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("wa_id", waId)
    .maybeSingle();

  if (!contact) return false;

  const { data: conversations } = await admin
    .from("conversations")
    .select("id")
    .eq("org_id", orgId)
    .eq("contact_id", contact.id)
    .limit(5);

  const ids = (conversations ?? []).map((row) => row.id);
  if (ids.length === 0) return false;

  const { data: sent } = await admin
    .from("messages")
    .select("id, content")
    .in("conversation_id", ids)
    .eq("direction", "outbound")
    .eq("type", "template")
    .limit(100);

  return (sent ?? []).some(
    (row) => (row.content as { source?: unknown } | null)?.source === source
  );
}

/**
 * The owner's WhatsApp number and name, for a message about their account.
 *
 * The owner, and only the owner — the same rule the billing emails
 * follow. A message about a lapsed plan sent to somebody who cannot pay
 * it is worse than one nobody gets.
 *
 * The number lives on the auth user rather than in profiles, because it
 * is collected at sign-up and at sign-in and never needs a table of its
 * own.
 */
export async function ownerWhatsApp(
  admin: Admin,
  orgId: string
): Promise<{ waId: string; name: string | null } | null> {
  try {
    const { data: member } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (!member?.user_id) return null;

    const { data } = await admin.auth.admin.getUserById(member.user_id);
    const metadata = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;

    const raw =
      typeof metadata.whatsapp_number === "string"
        ? metadata.whatsapp_number
        : typeof metadata.phone === "string"
          ? metadata.phone
          : "";

    const waId = normaliseWaNumber(raw);
    if (!waId) return null;

    return {
      waId,
      name: typeof metadata.full_name === "string" ? metadata.full_name : null,
    };
  } catch (error) {
    console.error("Could not read an owner's WhatsApp number", error);
    return null;
  }
}

/** Sends an event to a workspace's owner, when they have a number on file. */
export async function sendPlatformEventToOwner(
  key: EventKey,
  orgId: string
): Promise<PlatformSendResult> {
  const admin = createAdminClient();
  const owner = await ownerWhatsApp(admin, orgId);
  if (!owner) return { sent: false, reason: "The owner has no WhatsApp number on file" };
  return sendPlatformEvent(key, owner);
}

/**
 * Sends a sign-up code to a number that is proving it belongs to somebody.
 *
 * Separate from sendPlatformEvent for two reasons that are not negotiable.
 * It must not be idempotent — "already sent" is exactly what a person
 * pressing Resend is asking you to ignore — and its template is an
 * authentication template, whose one variable is the code and whose
 * copy-code button has to be sent the code a second time.
 *
 * The code never reaches the message log. The customer has it on their
 * phone and the server has an HMAC of it; a readable copy in a row that
 * platform staff can open is a third place it exists for no reason.
 */
export async function sendOtpTemplate(
  recipient: { waId: string; name?: string | null },
  code: string
): Promise<PlatformSendResult> {
  try {
    const waId = normaliseWaNumber(recipient.waId ?? "");
    if (!waId) return { sent: false, reason: "No usable WhatsApp number" };

    const admin = createAdminClient();

    const { data: setting } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", SETTING)
      .maybeSingle();

    const settings = readEvents(setting?.value);
    if (!canSend(settings, "otp")) {
      return {
        sent: false,
        setup: true,
        reason:
          "Sending codes is not switched on yet. Choose a template under Admin → WhatsApp messages.",
      };
    }

    const connection = await resolveConnection(admin, settings.orgId, {
      connectionId: settings.connectionId || null,
    });
    if ("error" in connection) return { sent: false, setup: true, reason: connection.error };

    const message = settings.messages.otp;

    // Which button to put the code in, read out of the template Meta itself
    // returned. A guess either way is a refused message: a button component
    // aimed at a template with no buttons fails, and a template with a
    // copy-code button sent none fails identically.
    const { data: template } = await admin
      .from("message_templates")
      .select("body_text, header_format, header_text, header_media_url, components_json")
      .eq("waba_id", connection.wabaId)
      .eq("name", message.templateName)
      .eq("language", message.language)
      .maybeSingle();

    // Exactly one variable, and it is the code. Checked here rather than
    // discovered as Meta's 132000 for every customer, because a template
    // written with a greeting as well — "Hi {{1}}, your code is {{2}}" — is
    // the obvious thing to write and the one shape this cannot send.
    if (template) {
      const declared = variableCount(resolveTemplateShape(template).bodyText);
      if (declared !== 1) {
        return {
          sent: false,
          setup: true,
          reason:
            declared === 0
              ? `The template "${message.templateName}" has no variable in it, so there is nowhere to put the code. It needs exactly one, written as {{1}}.`
              : `The template "${message.templateName}" has ${declared} variables. A code template takes exactly one — the code — so a greeting cannot go in it as well.`,
        };
      }
    }

    const buttonIndex = otpButtonIndex(template?.components_json);

    const result = await sendTemplateMessage(
      connection.phoneNumberId,
      waId,
      message.templateName,
      message.language,
      otpComponents(code, buttonIndex),
      connection.accessToken
    );

    await recordOutboundTemplate(admin, {
      orgId: settings.orgId,
      connectionId: connection.id,
      waId,
      contactName: recipient.name ?? null,
      templateName: message.templateName,
      language: message.language,
      // Deliberately no code. Support needs to know one went out, not what
      // it said.
      body: `${eventSource("otp")} — ${"•".repeat(6)}`,
      source: eventSource("otp"),
      waMessageId: result.messages[0]?.id ?? null,
    });

    return { sent: true };
  } catch (error) {
    const reason =
      error instanceof MetaApiError
        ? describeMetaError(error.status, error.body)
        : error instanceof Error
          ? error.message
          : "Unknown failure";
    console.error("Could not send a sign-up code", reason);
    return { sent: false, reason };
  }
}
