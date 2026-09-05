"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { resolveConnection, listActiveConnections, describe } from "@/lib/connections";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  uploadTemplateHeaderSample,
  describeMetaError,
  type MetaTemplateSummary,
  MetaApiError,
} from "@/lib/meta-whatsapp";
import {
  buildComponents,
  normaliseName,
  validateTemplate,
  variablesIn,
  type ButtonSpec,
  type TemplateSpec,
} from "@/lib/template-spec";
import { normaliseWaId } from "@/lib/audience";
import { dispatchDueCampaigns } from "@/lib/campaign-dispatch";
import type { ActionResult } from "./actions";
import type { Database, TemplateCategory, TemplateStatus } from "@/types/database";

// Templates go to Meta for review; campaigns queue recipients that a
// dispatcher sends. Nothing here sends a message directly — a campaign that
// blocks a form submission for ten thousand sends is a campaign that times
// out halfway through with no record of where it got to.

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * The number to act on, and a usable token.
 *
 * Templates live on a WhatsApp Business Account, so which number is chosen
 * decides which account the template lands in. Callers pass a connection id
 * where the operator picked one; otherwise the workspace default wins.
 */
async function wabaCredentials(
  supabase: Client,
  orgId: string,
  connectionId?: string | null
): Promise<
  { wabaId: string; phoneNumberId: string; appId: string; token: string } | { error: string }
> {
  const connection = await resolveConnection(supabase, orgId, { connectionId });
  if ("error" in connection) return { error: connection.error };
  return {
    wabaId: connection.wabaId,
    phoneNumberId: connection.phoneNumberId,
    appId: connection.metaAppId,
    token: connection.accessToken,
  };
}

function readButtons(raw: string): ButtonSpec[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? (parsed as ButtonSpec[]) : [];
  } catch {
    return [];
  }
}

// --- templates ------------------------------------------------------------

/**
 * Saves a template row against the account it belongs to.
 *
 * Templates are unique per account, not per workspace: two connected
 * accounts can each hold one called "marketing_", and keying only on the
 * name lets a sync overwrite one with the other. The account column arrives
 * with a migration, so a database without it falls back to the old key —
 * losing the distinction, but never the row.
 */
type TemplateInsert = Database["public"]["Tables"]["message_templates"]["Insert"];

async function upsertTemplate(
  supabase: Client,
  wabaId: string,
  row: TemplateInsert
): Promise<{ id: string } | { error: string }> {
  const withAccount = await supabase
    .from("message_templates")
    .upsert({ ...row, waba_id: wabaId }, { onConflict: "org_id,waba_id,name,language" })
    .select("id")
    .maybeSingle();

  if (!withAccount.error && withAccount.data) return withAccount.data;

  const fallback = await supabase
    .from("message_templates")
    .upsert(row, { onConflict: "org_id,name,language" })
    .select("id")
    .maybeSingle();

  if (fallback.error) return { error: fallback.error.message };
  if (!fallback.data) return { error: "The template could not be saved." };
  return fallback.data;
}



/**
 * Saves a template and submits it to Meta for review.
 *
 * The local row is written first with status 'pending': a template that
 * reached Meta but not the database would be invisible here and
 * un-resubmittable, which is the worse of the two failures.
 */
export async function submitTemplate(
  formData: FormData
): Promise<ActionResult & { id?: string; detail?: string }> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const spec: TemplateSpec = {
    name: normaliseName(String(formData.get("name") ?? "")),
    language: String(formData.get("language") ?? "en_US"),
    category: String(formData.get("category") ?? "UTILITY") as TemplateSpec["category"],
    headerFormat: String(formData.get("header_format") ?? "NONE") as TemplateSpec["headerFormat"],
    headerText: String(formData.get("header_text") ?? ""),
    headerMediaUrl: String(formData.get("header_media_url") ?? ""),
    body: String(formData.get("body") ?? ""),
    footer: String(formData.get("footer") ?? ""),
    buttons: readButtons(String(formData.get("buttons") ?? "[]")),
    samples: String(formData.get("samples") ?? "")
      .split("\n")
      .map((sample) => sample.trim()),
  };

  const validation = validateTemplate(spec);
  if (!validation.ok) return { ok: false, error: validation.errors.join(" ") };

  // Which WhatsApp Business Account the template is created on. Templates
  // belong to an account, not to a workspace, so with more than one number
  // connected "the default" is a guess the operator cannot see or correct.
  const connectionId = String(formData.get("connection_id") ?? "").trim() || null;

  const credentials = await wabaCredentials(supabase, orgId, connectionId);
  if ("error" in credentials) return { ok: false, error: credentials.error };

  // A media header's sample has to reach Meta as bytes, not as a link. Do
  // it before anything is written locally: a template row saved as pending
  // against an upload that never happened is a row that can only ever fail.
  let headerHandle: string | undefined;
  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(spec.headerFormat)) {
    try {
      headerHandle = await uploadTemplateHeaderSample(
        credentials.appId,
        credentials.token,
        spec.headerMediaUrl.trim()
      );
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof MetaApiError
            ? `Meta would not accept the header file: ${describeMetaError(error.status, error.body)}`
            : error instanceof Error
              ? error.message
              : "The header file could not be uploaded to Meta.",
      };
    }
  }

  const components = buildComponents(spec, headerHandle);

  const saved = await upsertTemplate(supabase, credentials.wabaId, {
        org_id: orgId,
        name: spec.name,
        language: spec.language,
        category: spec.category,
        status: "pending",
        components_json: components,
        header_format: spec.headerFormat,
        header_text: spec.headerText,
        header_media_url: spec.headerMediaUrl,
        body_text: spec.body,
        footer_text: spec.footer,
        buttons: spec.buttons,
        variable_samples: spec.samples.filter(Boolean),
        rejected_reason: null,
        updated_at: new Date().toISOString(),
  });

  if ("error" in saved) return { ok: false, error: saved.error };

  try {
    const result = await createMessageTemplate(credentials.wabaId, credentials.token, {
      name: spec.name,
      language: spec.language,
      category: spec.category,
      components,
    });

    await supabase
      .from("message_templates")
      .update({
        waba_template_id: result.id,
        status: result.status.toLowerCase() === "approved" ? "approved" : "pending",
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", saved.id);

    revalidatePath("/templates");
    return {
      ok: true,
      id: saved.id,
      message: "Submitted to Meta. Approval usually takes minutes, sometimes a day.",
    };
  } catch (error) {
    // The whole envelope, once, where it can be read. describeMetaError
    // deliberately never shows raw JSON to an operator, but a template
    // rejection Meta explains only in a subcode is undiagnosable without it,
    // and asking someone to reproduce the failure to learn its cause wastes
    // a submission each time.
    if (error instanceof MetaApiError) {
      console.error(
        "Template rejected by Meta",
        JSON.stringify({
          name: spec.name,
          wabaId: credentials.wabaId,
          status: error.status,
          body: error.body,
        })
      );
    }

    const described =
      error instanceof MetaApiError
        ? describeMetaError(error.status, error.body)
        : error instanceof Error
          ? error.message
          : "Meta refused the template.";

    // Which account refused it. Without this an account-level rejection reads
    // as a fault in the template, and the operator edits text that was never
    // the problem.
    const reason = `${described} (WhatsApp Business Account ${credentials.wabaId})`;

    // Kept as a draft with the reason attached, so it can be fixed and
    // resubmitted rather than retyped.
    await supabase
      .from("message_templates")
      .update({ status: "draft", rejected_reason: reason })
      .eq("id", saved.id);

    revalidatePath("/templates");

    // Meta's whole envelope, alongside the sentence. The reason a template is
    // refused lives in subcode and error_data, which the readable wording
    // deliberately drops — and asking someone to go and press a separate
    // diagnostic costs another round trip they should not have to make.
    return {
      ok: false,
      error: reason,
      detail: error instanceof MetaApiError ? JSON.stringify(error.body, null, 2) : undefined,
    };
  }
}

/**
 * Reconciles local rows with what Meta says.
 *
 * Approval happens asynchronously and Meta does not call us, so this is the
 * only way a template stops saying "pending" hours after it went live.
 */
export async function syncTemplates(): Promise<ActionResult & { synced?: number }> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  // Every account, not just the default one. Templates belong to a WhatsApp
  // Business Account, so syncing one account leaves every template on the
  // others invisible here — including ones created in WhatsApp Manager,
  // which is the whole reason someone presses this button.
  const connections = await listActiveConnections(supabase, orgId);
  if (connections.length === 0) {
    return { ok: false, error: "No active WhatsApp number to read templates from." };
  }

  const seen = new Set<string>();
  const remote: Array<{ waba: string; template: MetaTemplateSummary }> = [];
  const problems: string[] = [];

  for (const connection of connections) {
    // Two numbers on one account would otherwise be read twice.
    if (seen.has(connection.wabaId)) continue;
    seen.add(connection.wabaId);

    const resolved = await resolveConnection(supabase, orgId, { connectionId: connection.id });
    if ("error" in resolved) {
      problems.push(resolved.error);
      continue;
    }

    try {
      for (const template of await listMessageTemplates(connection.wabaId, resolved.accessToken)) {
        remote.push({ waba: connection.wabaId, template });
      }
    } catch (error) {
      // One unreadable account must not hide every template on the others.
      problems.push(
        `${describe(connection)}: ${
          error instanceof MetaApiError
            ? describeMetaError(error.status, error.body)
            : "could not be read."
        }`
      );
    }
  }

  if (remote.length === 0 && problems.length > 0) {
    return { ok: false, error: problems.join(" ") };
  }

  const now = new Date().toISOString();
  let synced = 0;

  for (const { waba, template } of remote) {
    const status = template.status?.toLowerCase() ?? "pending";
    const saved = await upsertTemplate(supabase, waba, {
      org_id: orgId,
      name: template.name,
      language: template.language,
      category: normaliseCategory(template.category),
      // Meta reports states the column has to allow; anything unexpected
      // is stored as pending rather than failing the whole sync.
      status: normaliseStatus(status),
      waba_template_id: template.id,
      rejected_reason: template.rejected_reason ?? null,
      components_json: template.components ?? [],
      last_synced_at: now,
      updated_at: now,
    });
    if (!("error" in saved)) synced += 1;
  }

  revalidatePath("/templates");
  return {
    ok: true,
    synced,
    message: `Synced ${synced} template${synced === 1 ? "" : "s"} from ${seen.size} account${
      seen.size === 1 ? "" : "s"
    }.${problems.length > 0 ? ` ${problems.join(" ")}` : ""}`,
  };
}

export async function removeTemplate(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");

  const { data: template } = await supabase
    .from("message_templates")
    .select("name, waba_template_id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!template) return { ok: false, error: "That template is not in this workspace." };

  // Delete at Meta first: a local row removed while the template still
  // exists there blocks the name from being reused, with nothing on screen
  // to explain why.
  if (template.waba_template_id) {
    const credentials = await wabaCredentials(supabase, orgId);
    if (!("error" in credentials)) {
      try {
        await deleteMessageTemplate(credentials.wabaId, credentials.token, template.name);
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof MetaApiError
              ? describeMetaError(error.status, error.body)
              : "Meta would not delete that template.",
        };
      }
    }
  }

  const { error } = await supabase
    .from("message_templates")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/templates");
  return { ok: true, message: "Template deleted." };
}

// --- campaigns ------------------------------------------------------------

export type Audience =
  | { kind: "all" }
  | { kind: "tag"; value: string }
  | { kind: "group"; value: string }
  | { kind: "numbers"; waIds: string[] };

/**
 * Creates a campaign and queues its recipients.
 *
 * Queuing rather than sending: the dispatcher owns delivery, so a campaign
 * of ten thousand survives a page close, a timeout and a redeploy, and
 * always knows exactly who it has already reached.
 */
export async function createCampaign(input: {
  name: string;
  templateId: string;
  variables: string[];
  audience: Audience;
  /** Which number to send from; null uses the workspace default. */
  connectionId?: string | null;
  scheduledAt: string | null;
  steps: Array<{ templateId: string; delayHours: number; variables: string[] }>;
}): Promise<ActionResult & { id?: string; queued?: number }> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  if (!input.name.trim()) return { ok: false, error: "Give the campaign a name." };
  if (!input.templateId) return { ok: false, error: "Pick a template." };

  const { data: template } = await supabase
    .from("message_templates")
    .select("id, name, status, body_text")
    .eq("id", input.templateId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!template) return { ok: false, error: "That template is not in this workspace." };
  if (template.status !== "approved") {
    return {
      ok: false,
      error: "Only an approved template can be sent. This one is " + template.status + ".",
    };
  }

  const needed = variablesIn(template.body_text ?? "").length;
  const filled = input.variables.filter((value) => value.trim()).length;
  if (filled < needed) {
    return { ok: false, error: `This template needs ${needed} variable value(s).` };
  }

  // Resolve the audience to concrete numbers before creating anything, so a
  // campaign never exists with nobody to send to.
  const recipients = await resolveAudience(supabase, orgId, input.audience);
  if ("error" in recipients) return { ok: false, error: recipients.error };
  if (recipients.rows.length === 0) {
    return { ok: false, error: "That audience has nobody in it." };
  }

  const scheduled = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduled && Number.isNaN(scheduled.getTime())) {
    return { ok: false, error: "That schedule date is not valid." };
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      org_id: orgId,
      name: input.name.trim(),
      template_id: input.templateId,
      variables: input.variables,
      audience: input.audience as unknown as Record<string, unknown>,
      connection_id: input.connectionId ?? null,
      status: scheduled ? "scheduled" : "running",
      scheduled_at: scheduled?.toISOString() ?? null,
      started_at: scheduled ? null : new Date().toISOString(),
      is_drip: input.steps.length > 0,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  for (const [index, step] of input.steps.entries()) {
    await supabase.from("campaign_steps").insert({
      org_id: orgId,
      campaign_id: campaign.id,
      template_id: step.templateId,
      step_index: index + 1,
      delay_hours: step.delayHours,
      variables: step.variables,
    });
  }

  const sendAfter = (scheduled ?? new Date()).toISOString();
  // Chunked because a single insert of ten thousand rows is a request body
  // large enough to be refused.
  const CHUNK = 500;
  let queued = 0;
  for (let start = 0; start < recipients.rows.length; start += CHUNK) {
    const slice = recipients.rows.slice(start, start + CHUNK).map((row) => ({
      campaign_id: campaign.id,
      org_id: orgId,
      contact_id: row.contactId,
      wa_id: row.waId,
      step_index: 0,
      send_after: sendAfter,
      status: "pending" as const,
    }));
    const { error: insertError } = await supabase
      .from("campaign_recipients")
      .upsert(slice, { onConflict: "campaign_id,recipient_key,step_index", ignoreDuplicates: true });
    if (!insertError) queued += slice.length;
  }

  revalidatePath("/campaigns");
  return {
    ok: true,
    id: campaign.id,
    queued,
    message: scheduled
      ? `Scheduled for ${scheduled.toLocaleString()} — ${queued} recipients queued.`
      : `${queued} recipients queued. Sending starts within a minute.`,
  };
}

async function resolveAudience(
  supabase: Client,
  orgId: string,
  audience: Audience
): Promise<{ rows: Array<{ contactId: string | null; waId: string }> } | { error: string }> {
  if (audience.kind === "numbers") {
    // Match against existing contacts so a reply lands in the right thread
    // rather than creating a second conversation for the same person.
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, wa_id")
      .eq("org_id", orgId)
      .in("wa_id", audience.waIds.slice(0, 1000));

    const byWaId = new Map((contacts ?? []).map((contact) => [contact.wa_id, contact.id]));
    return {
      rows: audience.waIds.map((waId) => ({ contactId: byWaId.get(waId) ?? null, waId })),
    };
  }

  let query = supabase
    .from("contacts")
    .select("id, wa_id")
    .eq("org_id", orgId)
    // Opted-out contacts are excluded here rather than at send time: a
    // campaign should never queue someone it is not allowed to message.
    .eq("opted_out", false);

  if (audience.kind === "tag") query = query.contains("tags", [audience.value]);

  const { data, error } = await query.limit(5000);
  if (error) return { error: error.message };

  let rows = (data ?? []).map((contact) => ({
    contactId: contact.id,
    waId: contact.wa_id,
  }));

  if (audience.kind === "group") {
    const { data: members } = await supabase
      .from("contact_group_members")
      .select("contact_id")
      .eq("group_id", audience.value);
    const ids = new Set((members ?? []).map((member) => member.contact_id));
    rows = rows.filter((row) => ids.has(row.contactId));
  }

  return { rows };
}

/** Counts an audience without creating anything, for the review step. */
export async function previewAudience(
  audience: Audience
): Promise<ActionResult & { count?: number }> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const result = await resolveAudience(supabase, orgId, audience);
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, count: result.rows.length };
}

export async function setCampaignStatus(
  id: string,
  status: "running" | "cancelled"
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { error } = await supabase
    .from("campaigns")
    .update({
      status,
      ...(status === "running" ? { started_at: new Date().toISOString() } : {}),
    })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  if (status === "cancelled") {
    // Only the unsent ones: a cancelled campaign should not rewrite the
    // record of what already went out.
    await supabase
      .from("campaign_recipients")
      .update({ status: "failed", error: "Campaign cancelled" })
      .eq("campaign_id", id)
      .eq("status", "pending");
  }

  revalidatePath("/campaigns");
  return { ok: true, message: status === "running" ? "Campaign resumed." : "Campaign cancelled." };
}

export async function deleteCampaign(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/campaigns");
  return { ok: true, message: "Campaign deleted." };
}

/** Used by the number-list and CSV steps of the builder. */
export async function normaliseNumbers(
  raw: string,
  countryCode: string
): Promise<{ waIds: string[]; rejected: number; duplicates: number }> {
  await requireOrg();
  const seen = new Set<string>();
  const waIds: string[] = [];
  let rejected = 0;
  let duplicates = 0;

  for (const piece of raw.split(/[\n,;\t]+/)) {
    const value = piece.trim();
    if (!value) continue;
    const waId = normaliseWaId(value, countryCode);
    if (!waId) {
      rejected += 1;
      continue;
    }
    if (seen.has(waId)) {
      duplicates += 1;
      continue;
    }
    seen.add(waId);
    waIds.push(waId);
  }

  return { waIds, rejected, duplicates };
}

const KNOWN_STATUSES = [
  "approved",
  "rejected",
  "pending",
  "disabled",
  "paused",
  "in_appeal",
] as const;

/** Meta reports states the column may not know; anything new reads as pending. */
function normaliseStatus(status: string): TemplateStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(status)
    ? (status as TemplateStatus)
    : "pending";
}

function normaliseCategory(category: string | undefined): TemplateCategory {
  const upper = (category ?? "UTILITY").toUpperCase();
  return upper === "MARKETING" || upper === "AUTHENTICATION"
    ? (upper as TemplateCategory)
    : "UTILITY";
}

/**
 * Drains the campaign queue now, from the Campaigns screen.
 *
 * Campaigns queue recipients and a scheduler drains them. Vercel's Hobby
 * plan allows at most a daily cron, and this project ships no vercel.json at
 * all — so without this a campaign is created, queued, and then never sends,
 * which is indistinguishable from sending being broken.
 *
 * Sends one batch per press, the same batch the cron route sends, so a large
 * campaign is pressed a few times or left to a real scheduler.
 */
export async function sendQueuedNow(): Promise<ActionResult & { sent?: number }> {
  const { role } = await requireOrg();
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only owners and admins can send a campaign." };
  }

  const result = await dispatchDueCampaigns();
  if (result.error) return { ok: false, error: result.error };

  revalidatePath("/campaigns");

  if (result.due === 0) {
    return { ok: true, message: "Nothing is waiting to send right now." };
  }

  return {
    ok: true,
    sent: result.sent,
    message:
      result.failed > 0
        ? `Sent ${result.sent}, ${result.failed} failed — open the campaign to see why.`
        : `Sent ${result.sent}. Press again if more are queued.`,
  };
}
