import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildTemplateComponents } from "@/lib/template-components";
import { resolveTemplateShape } from "@/lib/template-unpack";
import { resolveConnection } from "@/lib/connections";
import { sendTemplateMessage, describeMetaError, MetaApiError } from "@/lib/meta-whatsapp";
import { recordOutboundTemplate } from "@/lib/outbound-log";
import { fillTemplateText } from "@/lib/template-variables";
import { normaliseWaNumber } from "@/lib/whatsapp-link";
import { walletStatus } from "@/lib/wallet-charge";
import { canSpend, costOf } from "@/lib/wallet";
import {
  advance,
  matchesKeyword,
  normaliseKeywords,
  type DripSettings,
  type DripStep,
} from "@/lib/drip";

// Running the sequences: sending what has come due, letting people in, and
// letting them out.
//
// The queue is the enrolment table itself. There is no separate list of
// pending sends, because an enrolment already says exactly one thing —
// which step is next and when — and a second table saying the same thing
// is a second table that can disagree with it.
//
// Every send is idempotent in the only way that matters here: the row is
// moved forward before anything else can pick it up, so a redeploy
// mid-batch or two overlapping cron runs cannot send the same step twice.

const BATCH = 50;

export interface DripRunResult {
  due: number;
  sent: number;
  failed: number;
  finished: number;
  error?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

/** Sends one batch of due steps. Safe to call repeatedly. */
export async function dispatchDueDrips(): Promise<DripRunResult> {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: due, error } = await supabase
    .from("drip_enrollments")
    .select("id, org_id, campaign_id, contact_id, wa_id, next_step_index")
    .eq("status", "active")
    .lte("next_send_at", now.toISOString())
    .order("next_send_at")
    .limit(BATCH);

  if (error) {
    console.error("Could not read due drip enrolments", error);
    return { due: 0, sent: 0, failed: 0, finished: 0, error: error.message };
  }

  let sent = 0;
  let failed = 0;
  let finished = 0;

  const cache = new Map<string, Awaited<ReturnType<typeof loadCampaign>>>();
  const wallets = new Map<string, boolean>();

  for (const row of due ?? []) {
    if (!wallets.has(row.org_id)) {
      const { balance, rates } = await walletStatus(supabase, row.org_id);
      wallets.set(row.org_id, canSpend(balance, costOf("marketing", rates), rates));
    }

    // Left where it is, not failed. A sequence somebody is half way
    // through must pick up when the wallet is topped up, rather than
    // dropping them at step three for the want of a few rupees.
    if (!wallets.get(row.org_id)) continue;

    if (!cache.has(row.campaign_id)) {
      cache.set(row.campaign_id, await loadCampaign(supabase, row.campaign_id));
    }
    const campaign = cache.get(row.campaign_id)!;

    if (!campaign) {
      await stop(supabase, row.id, "failed", "The sequence no longer exists");
      failed += 1;
      continue;
    }

    // Paused while this batch was in flight. Left active and untouched, so
    // it picks up where it was the moment somebody presses resume — a
    // pause that quietly drops people out of a sequence is not a pause.
    if (campaign.status !== "active") continue;

    const step = campaign.steps.find((entry) => entry.stepIndex === row.next_step_index);
    if (!step) {
      // The sequence was shortened under them. Finishing is the honest
      // outcome: there is no message left to send.
      await stop(supabase, row.id, "completed", null);
      finished += 1;
      continue;
    }

    // Somebody who has opted out must not receive a follow-up, whatever
    // sequence they are part way through. Checked every step rather than
    // only at enrolment, because the opt-out usually arrives in the middle
    // — that is what the sequence provoked.
    if (await hasOptedOut(supabase, row.org_id, row.wa_id)) {
      await stop(supabase, row.id, "exited", "Opted out");
      finished += 1;
      continue;
    }

    const outcome = await sendStep(supabase, campaign, step, row);
    if (!outcome.ok) {
      await stop(supabase, row.id, "failed", outcome.error);
      failed += 1;
      continue;
    }

    sent += 1;

    const next = advance(campaign.steps, step.stepIndex, new Date(), campaign.settings);
    await supabase
      .from("drip_enrollments")
      .update({
        status: next.status,
        next_step_index: next.nextStepIndex,
        next_send_at: (next.nextSendAt ?? new Date()).toISOString(),
        last_sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", row.id);

    if (next.status === "completed") finished += 1;
  }

  return { due: due?.length ?? 0, sent, failed, finished };
}

/** Whether this number has asked not to be messaged. */
async function hasOptedOut(supabase: Admin, orgId: string, waId: string): Promise<boolean> {
  const { data } = await supabase
    .from("contacts")
    .select("opted_out")
    .eq("org_id", orgId)
    .eq("wa_id", waId)
    .maybeSingle();
  return data?.opted_out === true;
}

async function stop(
  supabase: Admin,
  id: string,
  status: "failed" | "completed" | "exited",
  reason: string | null
) {
  await supabase
    .from("drip_enrollments")
    .update({
      status,
      last_error: status === "failed" ? (reason ?? "").slice(0, 500) : null,
      exited_reason: status === "exited" ? (reason ?? "").slice(0, 200) : null,
    })
    .eq("id", id);
}

interface LoadedCampaign {
  id: string;
  orgId: string;
  name: string;
  status: string;
  connectionId: string | null;
  settings: DripSettings;
  steps: DripStep[];
}

async function loadCampaign(supabase: Admin, id: string): Promise<LoadedCampaign | null> {
  const { data: campaign } = await supabase
    .from("drip_campaigns")
    .select(
      "id, org_id, name, status, connection_id, trigger_type, trigger_keywords, exit_on_keyword, exit_keywords, exit_on_reply, skip_missed_steps, time_zone"
    )
    .eq("id", id)
    .maybeSingle();

  if (!campaign) return null;

  const { data: steps } = await supabase
    .from("drip_steps")
    .select("step_index, template_id, variables, wait_kind, wait_minutes, send_at_minutes, send_at_days")
    .eq("campaign_id", id)
    .order("step_index");

  return {
    id: campaign.id,
    orgId: campaign.org_id,
    name: campaign.name,
    status: campaign.status,
    connectionId: campaign.connection_id,
    settings: {
      trigger: campaign.trigger_type,
      triggerKeywords: campaign.trigger_keywords ?? [],
      exitOnKeyword: campaign.exit_on_keyword,
      exitKeywords: campaign.exit_keywords ?? [],
      exitOnReply: campaign.exit_on_reply,
      skipMissedSteps: campaign.skip_missed_steps,
      timeZone: campaign.time_zone,
    },
    steps: (steps ?? []).map((step) => ({
      stepIndex: step.step_index,
      templateId: step.template_id,
      variables: step.variables ?? [],
      waitKind: step.wait_kind,
      waitMinutes: step.wait_minutes,
      sendAtMinutes: step.send_at_minutes,
      sendAtDays: step.send_at_days,
    })),
  };
}

async function sendStep(
  supabase: Admin,
  campaign: LoadedCampaign,
  step: DripStep,
  row: { wa_id: string; contact_id: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!step.templateId) {
    return { ok: false, error: `Step ${step.stepIndex} has no template on it` };
  }

  const { data: template } = await supabase
    .from("message_templates")
    .select("name, language, status, body_text, header_format, header_text, header_media_url, components_json")
    .eq("id", step.templateId)
    .maybeSingle();

  if (!template) return { ok: false, error: `Step ${step.stepIndex}'s template no longer exists` };
  if (template.status !== "approved") {
    return {
      ok: false,
      error: `The template "${template.name}" is ${template.status}, so WhatsApp will not send it`,
    };
  }

  const connection = await resolveConnection(supabase, campaign.orgId, {
    connectionId: campaign.connectionId,
  });
  if ("error" in connection) return { ok: false, error: connection.error };

  const shape = resolveTemplateShape(template);
  const built = buildTemplateComponents(shape, step.variables);
  if ("error" in built) return { ok: false, error: built.error };

  const waId = normaliseWaNumber(row.wa_id);
  if (!waId) return { ok: false, error: "That contact has no usable WhatsApp number" };

  try {
    const result = await sendTemplateMessage(
      connection.phoneNumberId,
      waId,
      template.name,
      template.language,
      built.components,
      connection.accessToken
    );

    // Into the inbox, like every other outbound template. A sequence whose
    // messages do not appear in the thread is one where an agent picking
    // up the reply has no idea what was said to them.
    await recordOutboundTemplate(supabase, {
      orgId: campaign.orgId,
      connectionId: connection.id,
      waId,
      contactName: null,
      templateName: template.name,
      language: template.language,
      body: fillTemplateText(shape.bodyText, step.variables),
      source: `${campaign.name} — step ${step.stepIndex}`,
      waMessageId: result.messages[0]?.id ?? null,
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof MetaApiError
          ? describeMetaError(error.status, error.body)
          : error instanceof Error
            ? error.message
            : "Unknown send failure",
    };
  }
}

// --- getting in and out ----------------------------------------------------

export interface EnrolResult {
  enrolled: number;
  skipped: number;
  error?: string;
}

/**
 * Puts people into a sequence, starting them on step one immediately.
 *
 * Immediately because that is what every drip tool means by it and what
 * the sequence's own wording assumes: step one is the message that says
 * "thanks for getting in touch", and it is worthless an hour later.
 *
 * Joining twice does nothing. The unique index refuses it, and that is the
 * right answer rather than an error — somebody who sends the keyword twice
 * meant to join once, and two copies of every message is the complaint
 * that gets a number blocked.
 */
export async function enrol(
  supabase: Admin,
  campaignId: string,
  people: Array<{ waId: string; contactId?: string | null }>,
  via: "manual" | "keyword" | "api" | "import" = "manual"
): Promise<EnrolResult> {
  const { data: campaign } = await supabase
    .from("drip_campaigns")
    .select("id, org_id, status")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) return { enrolled: 0, skipped: 0, error: "That sequence no longer exists." };
  if (campaign.status === "archived") {
    return { enrolled: 0, skipped: 0, error: "That sequence is archived." };
  }

  const rows = [];
  for (const person of people) {
    const waId = normaliseWaNumber(person.waId ?? "");
    if (!waId) continue;
    rows.push({
      org_id: campaign.org_id,
      campaign_id: campaignId,
      contact_id: person.contactId ?? null,
      wa_id: waId,
      status: "active" as const,
      next_step_index: 1,
      next_send_at: new Date().toISOString(),
      enrolled_via: via,
    });
  }

  if (rows.length === 0) return { enrolled: 0, skipped: people.length };

  // ignoreDuplicates, so somebody already in the sequence stays exactly
  // where they are rather than being thrown back to step one.
  const { data, error } = await supabase
    .from("drip_enrollments")
    .upsert(rows, { onConflict: "campaign_id,wa_id", ignoreDuplicates: true })
    .select("id");

  if (error) return { enrolled: 0, skipped: 0, error: error.message };

  const enrolled = data?.length ?? 0;
  return { enrolled, skipped: people.length - enrolled };
}

/**
 * Everything an inbound message does to the sequences this number is in.
 *
 * Called from the webhook for every inbound message, so it has to be cheap
 * and it has to never throw: a sequence rule that breaks the webhook is a
 * sequence rule that stops the inbox receiving anything at all.
 */
export async function applyInboundToDrips(input: {
  orgId: string;
  waId: string;
  contactId?: string | null;
  text: string | null;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const waId = normaliseWaNumber(input.waId ?? "");
    if (!waId) return;

    const { data: live } = await supabase
      .from("drip_campaigns")
      .select("id, trigger_type, trigger_keywords, exit_on_keyword, exit_keywords, exit_on_reply")
      .eq("org_id", input.orgId)
      .eq("status", "active");

    if (!live || live.length === 0) return;

    // Which of them this number is already walking through.
    const { data: enrolments } = await supabase
      .from("drip_enrollments")
      .select("id, campaign_id")
      .eq("org_id", input.orgId)
      .eq("wa_id", waId)
      .eq("status", "active");

    const active = new Map((enrolments ?? []).map((row) => [row.campaign_id, row.id]));

    for (const campaign of live) {
      const enrolmentId = active.get(campaign.id);

      if (enrolmentId) {
        const exitWords = normaliseKeywords(campaign.exit_keywords);
        const byKeyword =
          campaign.exit_on_keyword && matchesKeyword(input.text, exitWords, true);

        if (byKeyword || campaign.exit_on_reply) {
          await stop(
            supabase,
            enrolmentId,
            "exited",
            byKeyword ? "Sent an exit keyword" : "Replied to the sequence"
          );
        }
        continue;
      }

      // Not in it yet — the keyword is how they get in.
      if (campaign.trigger_type !== "keyword") continue;
      if (!matchesKeyword(input.text, normaliseKeywords(campaign.trigger_keywords), true)) continue;

      await enrol(supabase, campaign.id, [{ waId, contactId: input.contactId }], "keyword");
    }
  } catch (error) {
    // Logged, never thrown. The webhook has a message to store.
    console.error("Could not apply an inbound message to the drip sequences", error);
  }
}
