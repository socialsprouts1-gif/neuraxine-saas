"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFeature } from "@/lib/org";
import { enrol } from "@/lib/drip-engine";
import { normaliseWaNumber } from "@/lib/whatsapp-link";
import {
  DEFAULT_SETTINGS,
  isTrigger,
  normaliseKeywords,
  sequenceProblem,
  settingsProblem,
  type DripSettings,
  type DripStep,
  type TriggerType,
  type WaitKind,
} from "@/lib/drip";

// Building and running the sequences.
//
// Everything that changes a sequence goes through requireFeature, which
// settles the workspace and the plan in one call, so none of these take an
// org id from the browser — a sequence belonging to somebody else is not
// something a request should be able to name.

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  id?: string;
}

export interface DripInput {
  id?: string;
  name: string;
  description?: string;
  connectionId?: string | null;
  settings: DripSettings;
  steps: DripStep[];
  /** Whether it should be live the moment it is saved. */
  activate: boolean;
}

function cleanSettings(raw: DripSettings): DripSettings {
  const trigger: TriggerType = isTrigger(raw?.trigger) ? raw.trigger : "manual";
  return {
    trigger,
    triggerKeywords: normaliseKeywords(raw?.triggerKeywords),
    exitOnKeyword: raw?.exitOnKeyword === true,
    exitKeywords: normaliseKeywords(raw?.exitKeywords),
    exitOnReply: raw?.exitOnReply === true,
    skipMissedSteps: raw?.skipMissedSteps === true,
    timeZone: (raw?.timeZone ?? "").trim() || DEFAULT_SETTINGS.timeZone,
  };
}

function cleanSteps(raw: DripStep[]): DripStep[] {
  return (Array.isArray(raw) ? raw : []).map((step, index) => ({
    stepIndex: index + 1,
    templateId: step?.templateId ?? null,
    variables: Array.isArray(step?.variables) ? step.variables.map(String) : [],
    waitKind: (step?.waitKind === "time_of_day" ? "time_of_day" : "duration") as WaitKind,
    waitMinutes: Math.max(0, Math.floor(Number(step?.waitMinutes) || 0)),
    sendAtMinutes: Math.min(Math.max(Math.floor(Number(step?.sendAtMinutes) || 0), 0), 1439),
    sendAtDays: Math.max(0, Math.floor(Number(step?.sendAtDays) || 0)),
  }));
}

export async function saveDrip(input: DripInput): Promise<ActionResult> {
  const { orgId } = await requireFeature("drip");
  const supabase = await createClient();

  const name = (input?.name ?? "").trim();
  if (!name) return { ok: false, error: "Give the sequence a name." };

  const settings = cleanSettings(input?.settings ?? DEFAULT_SETTINGS);
  const steps = cleanSteps(input?.steps ?? []);

  // Refused here rather than discovered one customer at a time: a sequence
  // with a step that cannot send is a sequence that stops dead half way
  // through for whoever is in it.
  const bad = sequenceProblem(steps) ?? settingsProblem(settings);
  if (bad) return { ok: false, error: bad };

  const row = {
    org_id: orgId,
    name,
    description: (input?.description ?? "").trim() || null,
    status: input?.activate ? ("active" as const) : ("draft" as const),
    trigger_type: settings.trigger,
    trigger_keywords: settings.triggerKeywords,
    exit_on_keyword: settings.exitOnKeyword,
    exit_keywords: settings.exitKeywords,
    exit_on_reply: settings.exitOnReply,
    skip_missed_steps: settings.skipMissedSteps,
    time_zone: settings.timeZone,
    connection_id: input?.connectionId || null,
  };

  let campaignId = input?.id ?? "";

  if (campaignId) {
    const { error } = await supabase
      .from("drip_campaigns")
      .update(row)
      .eq("id", campaignId)
      .eq("org_id", orgId);
    if (error) return { ok: false, error: error.message };

    // Steps are replaced wholesale rather than diffed. They are a short
    // ordered list with no identity of their own — nothing references a
    // step — and a diff would be more code for the same result.
    await supabase.from("drip_steps").delete().eq("campaign_id", campaignId).eq("org_id", orgId);
  } else {
    const { data, error } = await supabase
      .from("drip_campaigns")
      .insert(row)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    campaignId = data.id;
  }

  const { error: stepError } = await supabase.from("drip_steps").insert(
    steps.map((step) => ({
      org_id: orgId,
      campaign_id: campaignId,
      step_index: step.stepIndex,
      template_id: step.templateId,
      variables: step.variables,
      wait_kind: step.waitKind,
      wait_minutes: step.waitMinutes,
      send_at_minutes: step.sendAtMinutes,
      send_at_days: step.sendAtDays,
    }))
  );
  if (stepError) return { ok: false, error: stepError.message };

  revalidatePath("/drip");
  return {
    ok: true,
    id: campaignId,
    message: input?.activate
      ? `"${name}" is live. People can join it from now on.`
      : `"${name}" is saved as a draft — switch it on when you are ready.`,
  };
}

export async function setDripStatus(
  id: string,
  status: "active" | "paused" | "archived"
): Promise<ActionResult> {
  const { orgId } = await requireFeature("drip");
  const supabase = await createClient();

  const { error } = await supabase
    .from("drip_campaigns")
    .update({ status })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/drip");
  return {
    ok: true,
    message:
      status === "active"
        ? "Running. Anybody part way through picks up where they left off."
        : status === "paused"
          ? "Paused. Nobody is dropped — sending stops until you switch it back on."
          : "Archived. Nobody new can join it.",
  };
}

export async function deleteDrip(id: string): Promise<ActionResult> {
  const { orgId } = await requireFeature("drip");
  const supabase = await createClient();

  const { error } = await supabase
    .from("drip_campaigns")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/drip");
  return { ok: true, message: "Deleted, along with everybody's place in it." };
}

/**
 * Adds people by hand.
 *
 * Takes numbers rather than contact ids so the same box accepts a pasted
 * list and a picked contact — which is what somebody with a spreadsheet
 * open actually has.
 */
export async function enrolInDrip(id: string, numbers: string[]): Promise<ActionResult> {
  const { orgId } = await requireFeature("drip");
  const supabase = await createClient();

  // Owned by this workspace, checked before the admin client is used for
  // the insert: enrol() runs as the service role and would otherwise take
  // any id it was handed.
  const { data: campaign } = await supabase
    .from("drip_campaigns")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!campaign) return { ok: false, error: "That sequence does not exist here." };

  const waIds = [...new Set((numbers ?? []).map((n) => normaliseWaNumber(n)).filter(Boolean))] as string[];
  if (waIds.length === 0) {
    return { ok: false, error: "No usable WhatsApp numbers in that list." };
  }

  const admin = createAdminClient();

  // Matched to existing contacts where there are any, so the sequence
  // shows up against the person rather than against a bare number.
  const { data: contacts } = await admin
    .from("contacts")
    .select("id, wa_id")
    .eq("org_id", orgId)
    .in("wa_id", waIds);

  const byNumber = new Map((contacts ?? []).map((row) => [row.wa_id, row.id]));

  const result = await enrol(
    admin,
    id,
    waIds.map((waId) => ({ waId, contactId: byNumber.get(waId) ?? null })),
    "manual"
  );

  if (result.error) return { ok: false, error: result.error };

  revalidatePath(`/drip/${id}`);
  revalidatePath("/drip");

  const already = result.skipped > 0 ? ` ${result.skipped} were already in it.` : "";
  return {
    ok: true,
    message: `${result.enrolled} added. Step one goes out within the minute.${already}`,
  };
}

/** Takes one person out, without deleting the record of them having been in. */
export async function unenrol(enrolmentId: string, campaignId: string): Promise<ActionResult> {
  const { orgId } = await requireFeature("drip");
  const supabase = await createClient();

  const { error } = await supabase
    .from("drip_enrollments")
    .update({ status: "exited", exited_reason: "Removed by an agent" })
    .eq("id", enrolmentId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/drip/${campaignId}`);
  return { ok: true, message: "Removed from the sequence." };
}
