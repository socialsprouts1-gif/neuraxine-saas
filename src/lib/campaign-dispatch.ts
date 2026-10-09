import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { rollUpFailure } from "@/lib/campaign-failures";
import { buildTemplateComponents } from "@/lib/template-components";
import { resolveTemplateShape } from "@/lib/template-unpack";
import { resolveConnection } from "@/lib/connections";
import {
  sendTemplateMessage,
  describeMetaError,
  MetaApiError,
} from "@/lib/meta-whatsapp";
import { describeReadiness, templateReadiness } from "@/lib/template-readiness";
import { recordOutboundTemplate } from "@/lib/outbound-log";
import { fillTemplateText } from "@/lib/template-variables";
import { walletStatus } from "@/lib/wallet-charge";
import { canSpend, costOf } from "@/lib/wallet";

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
  // One wallet check per workspace per batch, not one per recipient. The
  // balance moves while this loop runs, which is exactly why the check is
  // "is there anything left" rather than "is there enough for all of them"
  // — the latter would stop a campaign that could have sent most of itself.
  const wallets = new Map<string, boolean>();

  for (const recipient of due ?? []) {
    if (!wallets.has(recipient.org_id)) {
      const { balance, rates } = await walletStatus(supabase, recipient.org_id);
      wallets.set(recipient.org_id, canSpend(balance, costOf("marketing", rates), rates));
    }

    // Left pending rather than failed. The money is the only thing missing,
    // and a top-up ten minutes from now should send it — marking it failed
    // would mean somebody has to find and re-queue every one of them.
    if (!wallets.get(recipient.org_id)) continue;

    const key = `${recipient.campaign_id}:${recipient.step_index}`;
    if (!cache.has(key)) {
      cache.set(key, await loadSendContext(supabase, recipient.campaign_id, recipient.step_index));
    }
    const context = cache.get(key)!;

    if (!context.ok) {
      // Waiting leaves the row pending, so the next drain tries again.
      if ("wait" in context && context.wait) continue;
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

      // And into the inbox. Until this was here, a campaign to twenty
      // people wrote twenty rows into campaign_recipients — which only the
      // Campaigns page reads — and nothing into conversations or messages,
      // so the inbox showed no trace of any of it. The only threads that
      // appeared were the ones where somebody wrote back, because an
      // inbound message goes through the webhook, which does create the
      // contact and the thread. The product could show you the reply to a
      // message it could not show you sending.
      //
      // After the send, deliberately: the message is already with the
      // customer, so a logging failure must never be reported as a send
      // failure or a retry would deliver it to them twice.
      await recordOutboundTemplate(supabase, {
        orgId: recipient.org_id,
        connectionId: context.connectionId,
        waId,
        contactName: context.contactNames.get(waId) ?? null,
        templateName: context.templateName,
        language: context.language,
        body: context.previewBody,
        source: context.campaignName,
        waMessageId: result.messages[0]?.id ?? null,
      });

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
    .select("id, name, org_id, status, template_id, variables, connection_id")
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
    .select(
      "name, language, status, body_text, header_format, header_text, header_media_url, components_json"
    )
    .eq("id", templateId)
    .maybeSingle();

  if (!template) return { ok: false as const, error: "The template no longer exists" };

  // Not yet approved is not the same as refused. Meta's review takes
  // minutes to a day, and marking every recipient failed for it burns the
  // whole audience over a wait — campaign_recipients has no un-fail, so
  // those people are permanently recorded as attempted and failed when
  // nothing was ever sent to them. Hold instead: they stay pending and the
  // next drain picks them up, which makes a campaign created during review
  // send itself the moment approval lands.
  const readiness = templateReadiness(template.status);
  if (readiness === "waiting") {
    return { ok: false as const, wait: true, error: describeReadiness(template.status)! };
  }
  if (readiness === "blocked") {
    return { ok: false as const, error: describeReadiness(template.status)! };
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

  // Names come back with the numbers now: a new thread created by a
  // campaign would otherwise be titled with a bare phone number even when
  // the imported audience knew who it was.
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id, wa_id, name").in("id", contactIds)
    : { data: [] };

  // header_format was read here and thrown away, so a template with an
  // image, video or document header was sent with a body component and
  // nothing else. Meta refuses that whole message, every time, for every
  // recipient — which is how a campaign against a perfectly healthy
  // account reads "0 sent, 5 failed".
  // Resolved against Meta's own copy, not just our columns.
  //
  // header_format was read here and thrown away once, so a template with
  // an image header went out with a body and nothing else. This is the
  // same failure one layer down: sync wrote components_json and left
  // body_text empty, so a template declaring one variable was counted as
  // declaring none and sent no parameters — Meta refused every recipient
  // with 132000. Reading what Meta returned means that is right whether
  // or not the columns have been repaired.
  const shape = resolveTemplateShape(template);
  const built = buildTemplateComponents(shape, variables);

  // Stopped before a single recipient is touched. campaign_recipients has
  // no un-fail, so burning the audience on a fault that is the same for
  // all of them would permanently record people as attempted when nothing
  // could ever have been sent.
  if (!built.ok) return { ok: false as const, error: built.error };

  return {
    ok: true as const,
    campaignStatus: campaign.status,
    campaignName: campaign.name ?? undefined,
    connectionId: connection.id,
    phoneNumberId: connection.phoneNumberId,
    accessToken,
    templateName: template.name,
    language: template.language,
    components: built.components,
    // What the recipient actually reads, variables filled in. Stored with
    // the message so the inbox can show the sentence months later, when
    // the template itself may have been edited or deleted.
    previewBody: fillTemplateText(shape.bodyText, variables),
    contactNumbers: new Map((contacts ?? []).map((contact) => [contact.id, contact.wa_id])),
    contactNames: new Map(
      (contacts ?? [])
        .filter((contact) => contact.name)
        .map((contact) => [contact.wa_id, contact.name as string])
    ),
  };
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
      // Why it went the way it went, recorded on the campaign itself.
      // A campaign that completes having sent nothing is the case people
      // actually hit, and "completed" next to an empty progress bar is a
      // cruel thing to show somebody with no explanation beside it.
      const { data: failures } = await supabase
        .from("campaign_recipients")
        .select("error")
        .eq("campaign_id", campaign.id)
        .eq("status", "failed")
        .limit(500);

      await supabase
        .from("campaigns")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          last_error: rollUpFailure(failures ?? []),
        })
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
