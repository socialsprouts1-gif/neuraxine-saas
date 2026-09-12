import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveConnection } from "@/lib/connections";
import {
  sendTemplateMessage,
  describeMetaError,
  MetaApiError,
  type MetaTemplateComponent,
} from "@/lib/meta-whatsapp";
import { variablesIn } from "@/lib/template-spec";

// Draining the campaign queue.
//
// Campaigns queue recipients rather than sending inline, so a run of ten
// thousand survives a closed tab, a timeout and a redeploy, and always knows
// exactly who it has already reached.
//
// This lives here rather than inside the cron route because the queue needs
// draining whether or not a scheduler exists. On Vercel's Hobby plan crons
// run at most daily, so without a way to trigger this by hand a campaign is
// queued and then simply sits there — which looks exactly like sending being
// broken.

// WhatsApp's default throughput is 80 messages a second, but the ceiling
// that matters here is the serverless invocation. A slice per run keeps each
// one short and the failure blast radius small.
const BATCH = 60;

export interface DispatchResult {
  due: number;
  sent: number;
  failed: number;
  error?: string;
}

/** Sends one batch of due recipients. Safe to call repeatedly. */
export async function dispatchDueCampaigns(): Promise<DispatchResult> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // A scheduled campaign becomes running when its time arrives; without
  // this its recipients are due but the campaign still reads "scheduled".
  await supabase
    .from("campaigns")
    .update({ status: "running", started_at: now })
    .eq("status", "scheduled")
    .lte("scheduled_at", now);

  const { data: due, error } = await supabase
    .from("campaign_recipients")
    .select("id, campaign_id, org_id, contact_id, wa_id, step_index")
    .eq("status", "pending")
    .lte("send_after", now)
    .limit(BATCH);

  if (error) {
    console.error("Could not read campaign recipients", error);
    return { due: 0, sent: 0, failed: 0, error: error.message };
  }

  let sent = 0;
  let failed = 0;
  const cache = new Map<string, Awaited<ReturnType<typeof loadSendContext>>>();

  for (const recipient of due ?? []) {
    const key = `${recipient.campaign_id}:${recipient.step_index}`;
    if (!cache.has(key)) {
      cache.set(key, await loadSendContext(supabase, recipient.campaign_id, recipient.step_index));
    }
    const context = cache.get(key)!;

    if (!context.ok) {
      await markFailed(supabase, recipient.id, context.error);
      failed += 1;
      continue;
    }

    // Cancelled while this batch was in flight.
    if (context.campaignStatus === "cancelled") continue;

    const waId =
      recipient.wa_id ??
      (recipient.contact_id ? context.contactNumbers.get(recipient.contact_id) : undefined);
    if (!waId) {
      await markFailed(supabase, recipient.id, "No WhatsApp number for this recipient");
      failed += 1;
      continue;
    }

    try {
      const result = await sendTemplateMessage(
        context.phoneNumberId,
        waId,
        context.templateName,
        context.language,
        context.components,
        context.accessToken
      );

      await supabase
        .from("campaign_recipients")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          wa_message_id: result.messages[0]?.id ?? null,
          error: null,
        })
        .eq("id", recipient.id);
      sent += 1;
    } catch (sendError) {
      await markFailed(
        supabase,
        recipient.id,
        sendError instanceof MetaApiError
          ? describeMetaError(sendError.status, sendError.body)
          : sendError instanceof Error
            ? sendError.message
            : "Unknown send failure"
      );
      failed += 1;
    }
  }

  // Queue before closing: a drip campaign whose first step just finished
  // has nothing pending for a moment, and closing it first would mark it
  // completed and then immediately queue more work into it.
  await queueDripSteps(supabase);
  await closeFinishedCampaigns(supabase);

  return { due: due?.length ?? 0, sent, failed };
}

type Admin = ReturnType<typeof createAdminClient>;

async function markFailed(supabase: Admin, id: string, reason: string) {
  await supabase
    .from("campaign_recipients")
    .update({ status: "failed", error: reason.slice(0, 500) })
    .eq("id", id);
}

/**
 * Everything one campaign step needs to send, resolved once per batch
 * rather than once per recipient.
 */
async function loadSendContext(supabase: Admin, campaignId: string, stepIndex: number) {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, org_id, status, template_id, variables, connection_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) return { ok: false as const, error: "The campaign no longer exists" };

  let templateId = campaign.template_id;
  let variables = campaign.variables ?? [];

  if (stepIndex > 0) {
    const { data: step } = await supabase
      .from("campaign_steps")
      .select("template_id, variables")
      .eq("campaign_id", campaignId)
      .eq("step_index", stepIndex)
      .maybeSingle();
    if (!step) return { ok: false as const, error: `Drip step ${stepIndex} no longer exists` };
    templateId = step.template_id;
    variables = step.variables ?? [];
  }

  if (!templateId) return { ok: false as const, error: "The campaign has no template" };

  const { data: template } = await supabase
    .from("message_templates")
    .select("name, language, status, body_text, header_format")
    .eq("id", templateId)
    .maybeSingle();

  if (!template) return { ok: false as const, error: "The template no longer exists" };
  if (template.status !== "approved") {
    return { ok: false as const, error: `The template is ${template.status}, not approved` };
  }

  // The campaign's own number when it names one, otherwise the workspace
  // default. A campaign must not change sender between batches.
  const connection = await resolveConnection(supabase, campaign.org_id, {
    connectionId: campaign.connection_id,
  });
  if ("error" in connection) return { ok: false as const, error: connection.error };
  const accessToken = connection.accessToken;

  // Contacts are looked up in one query; a per-recipient join would be a
  // round trip per message.
  const { data: recipients } = await supabase
    .from("campaign_recipients")
    .select("contact_id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .not("contact_id", "is", null)
    .limit(BATCH);

  const contactIds = (recipients ?? [])
    .map((row) => row.contact_id)
    .filter((id): id is string => Boolean(id));

  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id, wa_id").in("id", contactIds)
    : { data: [] };

  return {
    ok: true as const,
    campaignStatus: campaign.status,
    phoneNumberId: connection.phoneNumberId,
    accessToken,
    templateName: template.name,
    language: template.language,
    components: buildSendComponents(template.body_text ?? "", variables),
    contactNumbers: new Map((contacts ?? []).map((contact) => [contact.id, contact.wa_id])),
  };
}

/**
 * The body parameters for a send.
 *
 * Only as many as the template actually declares: sending a parameter the
 * template does not have is a 400, and sending one fewer is a different 400.
 */
function buildSendComponents(bodyText: string, variables: string[]): MetaTemplateComponent[] {
  const count = variablesIn(bodyText).length;
  if (count === 0) return [];

  return [
    {
      type: "body",
      parameters: Array.from({ length: count }, (_, index) => ({
        type: "text",
        text: variables[index]?.trim() || " ",
      })),
    },
  ];
}

/** A campaign with nothing left pending is finished. */
async function closeFinishedCampaigns(supabase: Admin) {
  const { data: running } = await supabase
    .from("campaigns")
    .select("id")
    .eq("status", "running")
    .limit(50);

  for (const campaign of running ?? []) {
    const { count } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "pending");

    if ((count ?? 0) === 0) {
      await supabase
        .from("campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", campaign.id);
    }
  }
}

/**
 * Queues the next drip step for anyone who received the previous one.
 *
 * Queued only after the earlier step actually sent, so a drip never runs
 * ahead of a message that failed or is still waiting.
 */
async function queueDripSteps(supabase: Admin) {
  // Only campaigns still in flight: a finished drip would otherwise be
  // re-scanned on every run forever, upserting rows that already exist.
  const { data: live } = await supabase
    .from("campaigns")
    .select("id")
    .eq("is_drip", true)
    .in("status", ["running", "scheduled"])
    .limit(50);

  const liveIds = (live ?? []).map((campaign) => campaign.id);
  if (liveIds.length === 0) return;

  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("id, org_id, campaign_id, step_index, delay_hours")
    .in("campaign_id", liveIds)
    .order("step_index")
    .limit(100);

  for (const step of steps ?? []) {
    const { data: previous } = await supabase
      .from("campaign_recipients")
      .select("contact_id, wa_id, sent_at")
      .eq("campaign_id", step.campaign_id)
      .eq("step_index", step.step_index - 1)
      .eq("status", "sent")
      .limit(500);

    for (const recipient of previous ?? []) {
      if (!recipient.sent_at) continue;
      const sendAfter = new Date(
        Date.parse(recipient.sent_at) + step.delay_hours * 3_600_000
      ).toISOString();

      // upsert with ignoreDuplicates so re-running this is free — the
      // unique index on (campaign, recipient, step) is what makes it safe.
      await supabase.from("campaign_recipients").upsert(
        {
          campaign_id: step.campaign_id,
          org_id: step.org_id,
          contact_id: recipient.contact_id,
          wa_id: recipient.wa_id,
          step_index: step.step_index,
          send_after: sendAfter,
          status: "pending" as const,
        },
        { onConflict: "campaign_id,recipient_key,step_index", ignoreDuplicates: true }
      );
    }
  }
}
