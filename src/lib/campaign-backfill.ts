import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTemplateShape } from "@/lib/template-unpack";
import { fillTemplateText } from "@/lib/template-variables";
import { recordOutboundTemplate } from "@/lib/outbound-log";

// Putting campaigns that already went out into the inbox.
//
// The dispatcher now writes a conversation and a message for every send.
// Everything sent before it did is still missing: campaign_recipients has
// the whole record — who, when, and the message id Meta gave back — and
// the inbox has nothing. Those are real messages that reached real people,
// so the history is recoverable rather than lost, and leaving somebody to
// send a second campaign just to see the feature work is not a fix.
//
// Idempotent by wa_message_id: a recipient whose message id is already in
// the messages table is skipped, so running this twice adds nothing the
// second time. Recipients sent before message ids were recorded cannot be
// matched safely and are left alone rather than risking a duplicate line
// in somebody's thread.

const SCAN = 500;

export interface BackfillResult {
  scanned: number;
  added: number;
  skipped: number;
  /** Sends with no Meta message id, which cannot be matched safely. */
  unmatchable: number;
}

export async function backfillCampaignInbox(orgId: string): Promise<BackfillResult> {
  const supabase = createAdminClient();
  const result: BackfillResult = { scanned: 0, added: 0, skipped: 0, unmatchable: 0 };

  const { data: recipients, error } = await supabase
    .from("campaign_recipients")
    .select("id, campaign_id, org_id, contact_id, wa_id, step_index, sent_at, wa_message_id")
    .eq("org_id", orgId)
    .eq("status", "sent")
    .order("sent_at", { ascending: true })
    .limit(SCAN);

  if (error || !recipients?.length) {
    if (error) console.error("Could not read sent campaign recipients", error);
    return result;
  }

  result.scanned = recipients.length;

  const withIds = recipients.filter((row) => row.wa_message_id);
  result.unmatchable = recipients.length - withIds.length;

  // One query for everything already logged, rather than one per recipient.
  const messageIds = withIds.map((row) => row.wa_message_id as string);
  const { data: logged } = messageIds.length
    ? await supabase.from("messages").select("wa_message_id").in("wa_message_id", messageIds)
    : { data: [] };

  const already = new Set((logged ?? []).map((row) => row.wa_message_id));

  const contexts = new Map<string, Awaited<ReturnType<typeof loadBackfillContext>>>();
  const numbers = new Map<string, string>();
  const names = new Map<string, string>();

  for (const recipient of withIds) {
    if (already.has(recipient.wa_message_id)) {
      result.skipped += 1;
      continue;
    }

    const key = `${recipient.campaign_id}:${recipient.step_index}`;
    if (!contexts.has(key)) {
      contexts.set(key, await loadBackfillContext(supabase, recipient.campaign_id, recipient.step_index));
    }
    const context = contexts.get(key)!;
    if (!context) {
      result.skipped += 1;
      continue;
    }

    let waId = recipient.wa_id ?? null;
    if (!waId && recipient.contact_id) {
      if (!numbers.has(recipient.contact_id)) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("wa_id, name")
          .eq("id", recipient.contact_id)
          .maybeSingle();
        if (contact?.wa_id) {
          numbers.set(recipient.contact_id, contact.wa_id);
          if (contact.name) names.set(contact.wa_id, contact.name);
        }
      }
      waId = numbers.get(recipient.contact_id) ?? null;
    }

    if (!waId) {
      result.skipped += 1;
      continue;
    }

    const written = await recordOutboundTemplate(supabase, {
      orgId: recipient.org_id,
      connectionId: context.connectionId,
      waId,
      contactName: names.get(waId) ?? null,
      templateName: context.templateName,
      language: context.language,
      body: context.body,
      source: context.campaignName,
      waMessageId: recipient.wa_message_id,
      // The original time, not now: these threads belong where they
      // happened, not at the top of today's inbox.
      sentAt: recipient.sent_at ?? undefined,
    });

    if (written) result.added += 1;
    else result.skipped += 1;
  }

  return result;
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The template text and the number a finished campaign step used.
 *
 * Deliberately lighter than the dispatcher's own context loader: nothing
 * here is about to send, so a template that is no longer approved, or a
 * media header with a missing URL, must not stop the history being
 * recovered.
 */
async function loadBackfillContext(supabase: Admin, campaignId: string, stepIndex: number) {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, template_id, variables, connection_id, org_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) return null;

  let templateId = campaign.template_id;
  let variables = campaign.variables ?? [];

  if (stepIndex > 0) {
    const { data: step } = await supabase
      .from("campaign_steps")
      .select("template_id, variables")
      .eq("campaign_id", campaignId)
      .eq("step_index", stepIndex)
      .maybeSingle();
    if (!step?.template_id) return null;
    templateId = step.template_id;
    variables = step.variables ?? [];
  }

  if (!templateId) return null;

  const { data: template } = await supabase
    .from("message_templates")
    .select("name, language, body_text, header_format, header_text, header_media_url, components_json")
    .eq("id", templateId)
    .maybeSingle();

  if (!template) return null;

  // The number it went out on. A campaign that named none used the
  // workspace default, and the default may have changed since — but the
  // thread has to hang off something, and the campaign's own connection is
  // the best record there is.
  let connectionId = campaign.connection_id;
  if (!connectionId) {
    const { data: fallback } = await supabase
      .from("waba_connections")
      .select("id")
      .eq("org_id", campaign.org_id)
      .eq("is_default", true)
      .maybeSingle();
    connectionId = fallback?.id ?? null;
  }
  if (!connectionId) return null;

  const shape = resolveTemplateShape(template);

  return {
    connectionId,
    campaignName: campaign.name ?? undefined,
    templateName: template.name,
    language: template.language,
    body: fillTemplateText(shape.bodyText, variables),
  };
}
