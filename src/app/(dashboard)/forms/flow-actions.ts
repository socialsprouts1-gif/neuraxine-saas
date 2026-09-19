"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { resolveConnection, listActiveConnections } from "@/lib/connections";
import { routeFlow, accountsToSync } from "@/lib/flow-routing";
import { describe as describeNumber } from "@/lib/number-identity";
import {
  createFlow,
  updateFlowJson,
  updateFlowMetadata,
  publishFlow,
  deprecateFlow,
  deleteFlow,
  getFlow,
  listFlows,
  sendFlowMessage,
  describeMetaError,
  MetaApiError,
  type MetaFlowValidationError,
} from "@/lib/meta-whatsapp";
import {
  buildFlowJson,
  repairScreens,
  validateFlow,
  newScreen,
  newField,
  type FormScreen,
  type FlowCategory,
} from "@/lib/flow-json";
import { findTemplate, templateScreens } from "@/lib/form-templates";
import type { ActionResult } from "../actions";
import type { FlowStatus } from "@/types/portal";

// Flows are edited here and published at Meta. Nothing in this file edits a
// published flow: Meta freezes one on publish, so an edit uploads a new
// version of the JSON and republishes rather than patching in place.

type Client = Awaited<ReturnType<typeof createClient>>;

interface FlowCredentials {
  wabaId: string;
  phoneNumberId: string;
  token: string;
  /** For messages that name the number a form is tied to. */
  describe: string;
}

async function wabaCredentials(
  supabase: Client,
  orgId: string,
  options: { connectionId?: string | null } = {}
): Promise<FlowCredentials | { error: string }> {
  const connection = await resolveConnection(supabase, orgId, options);
  if ("error" in connection) return { error: connection.error };
  return {
    wabaId: connection.wabaId,
    phoneNumberId: connection.phoneNumberId,
    token: connection.accessToken,
    describe: describeNumber(connection),
  };
}

/**
 * The number to act on for one form.
 *
 * A flow is owned by a single WhatsApp Business Account, and a workspace
 * with two numbers usually has two accounts. Every one of these actions
 * used to take the workspace default instead, so as soon as the default
 * was not the account the form was built on:
 *
 *   - Update Flow uploaded to `<flow>/assets` with a token that cannot see
 *     that flow, and Meta answered 100/33;
 *   - Test send sent from a number that does not own the flow, and Meta
 *     answered 131009.
 *
 * Both errors name the parameter and not the account, which is why this
 * read as "the form is broken" rather than "the wrong number is being
 * used". The account is recorded on the row, so it is used.
 *
 * A row from before that column was filled in has no account recorded. It
 * falls back to the default — which is what it was doing anyway — and the
 * caller stamps what it learns, so the row repairs itself on first use.
 */
async function flowCredentials(
  supabase: Client,
  orgId: string,
  wabaId: string | null | undefined
): Promise<FlowCredentials | { error: string }> {
  const connections = await listActiveConnections(supabase, orgId);
  const route = routeFlow(connections, wabaId);

  if (!route.ok) {
    return {
      error:
        route.reason === "none-connected"
          ? "No active WhatsApp number in this workspace. Connect one under WhatsApp Numbers."
          : "This form was built on a WhatsApp Business Account that none of your active numbers are on. Connect that number under WhatsApp Numbers, or rebuild the form on an account you have.",
    };
  }

  return wabaCredentials(supabase, orgId, { connectionId: route.connectionId });
}

/** Records the account a form turned out to be on, once it is known. */
async function stampWaba(
  supabase: Client,
  id: string,
  known: string | null | undefined,
  actual: string
): Promise<void> {
  if (known === actual) return;
  await supabase.from("whatsapp_flows").update({ waba_id: actual }).eq("id", id);
}

function metaReason(error: unknown, fallback: string): string {
  if (error instanceof MetaApiError) return describeMetaError(error.status, error.body);
  return error instanceof Error ? error.message : fallback;
}

/** Meta's validation errors, flattened into sentences an author can act on. */
function describeValidation(errors: MetaFlowValidationError[] | undefined): string | null {
  if (!errors || errors.length === 0) return null;
  return errors
    .slice(0, 4)
    .map((entry) => {
      const path = entry.pointers?.[0]?.path;
      return path ? `${entry.message} (${path})` : entry.message;
    })
    .join(" ");
}

// --- the form itself ------------------------------------------------------

/**
 * Creates a form, either blank or from one of the bundled templates.
 *
 * A template fills in the category, the screens, the invitation and the
 * button as well as the fields — a form that arrives half-configured still
 * has to be finished before it can be sent, which is most of the work a
 * template was supposed to save.
 */
export async function createForm(formData: FormData): Promise<ActionResult & { id?: string }> {
  const { orgId } = await requireFeature("forms");
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the form a name." };

  const template = findTemplate(String(formData.get("template") ?? "").trim());

  let screens;
  if (template) {
    screens = templateScreens(template);
  } else {
    const first = newScreen(0);
    first.fields = [newField("TextHeading"), newField("TextInput")];
    screens = [first];
  }

  // The chosen category wins over the template's, because the picker shows
  // both and the one the person touched last is the one they meant.
  const chosen = String(formData.get("category") ?? "").trim();
  const category = (chosen || template?.category || "LEAD_GENERATION") as FlowCategory;

  // Which number this form is built on, decided here rather than at the
  // first save. A form belongs to one WhatsApp Business Account for its
  // whole life and cannot be moved between them afterwards, so it is a
  // choice worth making deliberately instead of inheriting from whichever
  // number happened to be default that day.
  const connectionId = String(formData.get("connection_id") ?? "").trim();
  let wabaId: string | null = null;

  if (connectionId) {
    const connection = await resolveConnection(supabase, orgId, { connectionId });
    if ("error" in connection) return { ok: false, error: connection.error };
    wabaId = connection.wabaId;
  } else {
    // Nothing picked: the single-number case, where asking would be noise.
    const connections = await listActiveConnections(supabase, orgId);
    wabaId = connections.length === 1 ? connections[0].wabaId : null;
  }

  const { data, error } = await supabase
    .from("whatsapp_flows")
    .insert({
      org_id: orgId,
      name,
      waba_id: wabaId,
      categories: [category],
      screens: screens as unknown as Record<string, unknown>,
      description: template?.description ?? null,
      invitation: template?.invitation ?? null,
      button_text: template?.buttonText ?? "Open form",
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/forms");
  return {
    ok: true,
    id: data.id,
    message: template ? `Created from the ${template.name} template.` : "Form created.",
  };
}

/**
 * Saves the description, invitation and button — the parts a bot needs to
 * send the form without being told them again at every call site.
 */
export async function saveFormDelivery(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireFeature("forms");
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "No form selected." };

  const { error } = await supabase
    .from("whatsapp_flows")
    .update({
      description: String(formData.get("description") ?? "").trim() || null,
      invitation: String(formData.get("invitation") ?? "").trim() || null,
      button_text: String(formData.get("button_text") ?? "").trim().slice(0, 20) || "Open form",
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/forms");
  revalidatePath(`/forms/${id}`);
  return { ok: true, message: "Saved." };
}

/**
 * Saves the draft and pushes the JSON to Meta.
 *
 * The local save happens first and unconditionally: work typed into the
 * builder must survive a Meta outage, an expired token, or a document Meta
 * refuses. Only after that is anything uploaded.
 */
export async function saveForm(input: {
  id: string;
  name: string;
  categories: string[];
  screens: FormScreen[];
}): Promise<ActionResult & { validationErrors?: MetaFlowValidationError[] }> {
  const { orgId } = await requireFeature("forms");
  const supabase = await createClient();

  // Repaired here too, not only in the builder: an older client or a
  // direct call could still send ids Meta will refuse.
  const screens = repairScreens(input.screens);

  const { error: saveError } = await supabase
    .from("whatsapp_flows")
    .update({
      name: input.name.trim() || "Untitled form",
      categories: input.categories,
      screens: screens as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("org_id", orgId);

  if (saveError) return { ok: false, error: saveError.message };
  revalidatePath("/forms");

  const check = validateFlow(screens);
  if (!check.ok) {
    return { ok: false, error: check.errors.slice(0, 3).join(" ") };
  }

  // The row comes first now: which number uploads this is decided by the
  // account the form is already on, not by whichever number is default.
  const { data: flow } = await supabase
    .from("whatsapp_flows")
    .select("meta_flow_id, status, waba_id")
    .eq("id", input.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!flow) return { ok: false, error: "That form is not in this workspace." };

  const credentials = await flowCredentials(supabase, orgId, flow.waba_id);
  if ("error" in credentials) {
    return { ok: true, message: `Saved. ${credentials.error}` };
  }

  // A published flow is frozen at Meta. Editing one means it goes back to
  // being a draft there, which needs an explicit republish.
  if (flow.status === "published") {
    return {
      ok: true,
      message:
        "Saved here. This form is already published — press Publish again to send the change to WhatsApp.",
    };
  }

  const document = buildFlowJson(screens);

  try {
    let metaFlowId = flow.meta_flow_id;

    if (!metaFlowId) {
      const created = await createFlow(credentials.wabaId, credentials.token, {
        name: input.name.trim() || "Untitled form",
        categories: input.categories,
      });
      metaFlowId = created.id;
      // Recorded with the account it was created on. A flow belongs to one
      // WhatsApp Business Account, and without this the only way to learn
      // that a number cannot send it is Meta's 131009, which names neither.
      await supabase
        .from("whatsapp_flows")
        .update({ meta_flow_id: metaFlowId, waba_id: credentials.wabaId })
        .eq("id", input.id);
    } else {
      await updateFlowMetadata(metaFlowId, credentials.token, {
        name: input.name.trim() || "Untitled form",
        categories: input.categories,
      });
      // A form that reached Meta before the account was recorded learns it
      // here, so the next send routes itself without this guesswork.
      await stampWaba(supabase, input.id, flow.waba_id, credentials.wabaId);
    }

    const result = await updateFlowJson(metaFlowId, credentials.token, document);
    const problem = describeValidation(result.validation_errors);

    await supabase
      .from("whatsapp_flows")
      .update({
        validation_errors: (result.validation_errors ?? []) as unknown as Record<string, unknown>[],
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", input.id);

    revalidatePath("/forms");

    // Meta answers 200 with the errors in the body, so a green status code
    // is not proof the document was accepted.
    if (problem) {
      return {
        ok: false,
        error: `WhatsApp refused this form: ${problem}`,
        validationErrors: result.validation_errors,
      };
    }
    return { ok: true, message: "Saved and sent to WhatsApp." };
  } catch (error) {
    return { ok: false, error: `Saved here, but WhatsApp said: ${metaReason(error, "upload failed")}` };
  }
}

/** Publishing makes the form sendable to customers rather than test numbers. */
export async function publishForm(id: string): Promise<ActionResult> {
  const { orgId } = await requireFeature("forms");
  const supabase = await createClient();

  const { data: flow } = await supabase
    .from("whatsapp_flows")
    .select("meta_flow_id, screens, name, categories, waba_id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!flow) return { ok: false, error: "That form is not in this workspace." };
  if (!flow.meta_flow_id) {
    return { ok: false, error: "Press Update Flow first — this form hasn't reached WhatsApp yet." };
  }

  const screens = repairScreens(flow.screens as unknown as FormScreen[]);
  const check = validateFlow(screens);
  if (!check.ok) return { ok: false, error: check.errors.slice(0, 3).join(" ") };

  const credentials = await flowCredentials(supabase, orgId, flow.waba_id);
  if ("error" in credentials) return { ok: false, error: credentials.error };

  try {
    // Push the current document first: publishing sends whatever version
    // Meta last received, which may be older than what is on screen.
    const result = await updateFlowJson(
      flow.meta_flow_id,
      credentials.token,
      buildFlowJson(screens)
    );
    const problem = describeValidation(result.validation_errors);
    if (problem) return { ok: false, error: `WhatsApp refused this form: ${problem}` };

    await publishFlow(flow.meta_flow_id, credentials.token);

    await supabase
      .from("whatsapp_flows")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        validation_errors: [],
      })
      .eq("id", id);

    revalidatePath("/forms");
    return { ok: true, message: "Published. You can now send this form to customers." };
  } catch (error) {
    return { ok: false, error: metaReason(error, "Meta would not publish that form.") };
  }
}

/** Reconciles status with Meta and refreshes the preview link. */
export async function syncForm(id: string): Promise<ActionResult & { previewUrl?: string }> {
  const { orgId } = await requireFeature("forms");
  const supabase = await createClient();

  const { data: flow } = await supabase
    .from("whatsapp_flows")
    .select("meta_flow_id, waba_id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!flow?.meta_flow_id) {
    return { ok: false, error: "This form hasn't reached WhatsApp yet." };
  }

  const credentials = await flowCredentials(supabase, orgId, flow.waba_id);
  if ("error" in credentials) return { ok: false, error: credentials.error };

  try {
    const remote = await getFlow(flow.meta_flow_id, credentials.token, { withPreview: true });

    await supabase
      .from("whatsapp_flows")
      .update({
        status: normaliseStatus(remote.status),
        validation_errors: (remote.validation_errors ?? []) as unknown as Record<string, unknown>[],
        preview_url: remote.preview?.preview_url ?? null,
        preview_expires_at: remote.preview?.expires_at ?? null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", id);

    revalidatePath("/forms");
    return { ok: true, previewUrl: remote.preview?.preview_url, message: "Synced with WhatsApp." };
  } catch (error) {
    return { ok: false, error: metaReason(error, "Could not read that form from Meta.") };
  }
}

/**
 * Imports forms built directly in WhatsApp Manager.
 *
 * Across every connected account, not just the default one. Flows are
 * listed per WhatsApp Business Account, so a workspace with two numbers on
 * two accounts only ever saw half its forms — and the half it could not see
 * looked like forms that had failed to sync.
 */
export async function syncAllForms(): Promise<ActionResult & { synced?: number }> {
  const { orgId } = await requireFeature("forms");
  const supabase = await createClient();

  const connections = await listActiveConnections(supabase, orgId);
  if (connections.length === 0) {
    return { ok: false, error: "No active WhatsApp number in this workspace. Connect one under WhatsApp Numbers." };
  }

  const { data: known } = await supabase
    .from("whatsapp_flows")
    .select("id, meta_flow_id")
    .eq("org_id", orgId)
    .not("meta_flow_id", "is", null);

  const byMetaId = new Map((known ?? []).map((row) => [row.meta_flow_id, row.id]));
  const now = new Date().toISOString();
  const failures: string[] = [];
  let synced = 0;

  // One account can sit on several numbers; listing it twice would import
  // every form on it twice over.
  for (const wabaId of accountsToSync(connections)) {
    const credentials = await flowCredentials(supabase, orgId, wabaId);
    if ("error" in credentials) {
      failures.push(credentials.error);
      continue;
    }

    let remote;
    try {
      remote = await listFlows(wabaId, credentials.token);
    } catch (error) {
      // One unreachable account must not abandon the others — that would
      // make a single expired token look like a total failure to sync.
      failures.push(`${credentials.describe}: ${metaReason(error, "could not be listed")}`);
      continue;
    }

    for (const flow of remote) {
      const existing = byMetaId.get(flow.id);
      const patch = {
        name: flow.name,
        status: normaliseStatus(flow.status),
        categories: flow.categories ?? ["OTHER"],
        waba_id: wabaId,
        last_synced_at: now,
      };

      // A form built in WhatsApp Manager has no screens here, so it is
      // imported read-only rather than opened in the builder with nothing in
      // it — an empty builder would overwrite the real thing on first save.
      const { error } = existing
        ? await supabase.from("whatsapp_flows").update(patch).eq("id", existing)
        : await supabase
            .from("whatsapp_flows")
            .insert({ org_id: orgId, meta_flow_id: flow.id, screens: [], ...patch });

      if (!error) synced += 1;
    }
  }

  revalidatePath("/forms");

  if (synced === 0 && failures.length > 0) {
    return { ok: false, error: failures.join(" ") };
  }

  const counted = `Synced ${synced} form${synced === 1 ? "" : "s"}`;
  return {
    ok: true,
    synced,
    message: failures.length > 0 ? `${counted}. ${failures.join(" ")}` : `${counted}.`,
  };
}

export async function deleteForm(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireFeature("forms");
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");

  const { data: flow } = await supabase
    .from("whatsapp_flows")
    .select("meta_flow_id, status, waba_id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!flow) return { ok: false, error: "That form is not in this workspace." };

  if (flow.meta_flow_id) {
    const credentials = await flowCredentials(supabase, orgId, flow.waba_id);
    if (!("error" in credentials)) {
      try {
        // A published flow cannot be deleted, only retired — customers may
        // still have the message sitting in their chat.
        if (flow.status === "published") {
          await deprecateFlow(flow.meta_flow_id, credentials.token);
        } else {
          await deleteFlow(flow.meta_flow_id, credentials.token);
        }
      } catch (error) {
        return { ok: false, error: metaReason(error, "Meta would not remove that form.") };
      }
    }
  }

  const { error } = await supabase
    .from("whatsapp_flows")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/forms");
  return { ok: true, message: "Form removed." };
}

/**
 * Sends the form to one number.
 *
 * A draft flow can only be opened by numbers on the WhatsApp account, which
 * is what makes this useful before publishing — test it on your own phone
 * without exposing it to customers.
 */
export async function sendForm(input: {
  id: string;
  waId: string;
  cta: string;
  body: string;
}): Promise<ActionResult> {
  const { orgId } = await requireFeature("forms");
  const supabase = await createClient();

  const { data: flow } = await supabase
    .from("whatsapp_flows")
    .select("id, meta_flow_id, status, screens, waba_id")
    .eq("id", input.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!flow) return { ok: false, error: "That form is not in this workspace." };
  if (!flow.meta_flow_id) return { ok: false, error: "Press Update Flow first." };

  const screens = flow.screens as unknown as FormScreen[];
  const firstScreen = screens[0]?.screenId;
  if (!firstScreen) return { ok: false, error: "This form has no screens to open." };

  const waId = input.waId.replace(/\D/g, "");
  if (waId.length < 8) return { ok: false, error: "That doesn't look like a WhatsApp number." };

  // Sent from a number on the form's own account. Sending from any other
  // number is what Meta rejects with 131009, and the message it returns
  // names the flow_id rather than the number, which sent everyone looking
  // at the form.
  const credentials = await flowCredentials(supabase, orgId, flow.waba_id);
  if ("error" in credentials) return { ok: false, error: credentials.error };

  await stampWaba(supabase, flow.id, flow.waba_id, credentials.wabaId);

  // The token is the only thing tying the answers back to this person, so
  // it is recorded alongside the send rather than derived later.
  const flowToken = randomUUID();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("wa_id", waId)
    .maybeSingle();

  try {
    const result = await sendFlowMessage(credentials.phoneNumberId, waId, credentials.token, {
      flowId: flow.meta_flow_id,
      flowToken,
      cta: input.cta.trim().slice(0, 20) || "Open form",
      body: input.body.trim() || "Tap below to fill in the form.",
      firstScreen,
      draft: flow.status !== "published",
    });

    await supabase.from("flow_sends").insert({
      org_id: orgId,
      flow_id: flow.id,
      contact_id: contact?.id ?? null,
      wa_id: waId,
      flow_token: flowToken,
      wa_message_id: result.messages[0]?.id ?? null,
    });

    revalidatePath("/forms");
    // Naming the sending number: which one a form goes out on is decided by
    // the account the form lives on, not by the workspace default, and that
    // is worth seeing rather than assuming.
    return {
      ok: true,
      message:
        flow.status === "published"
          ? `Sent from ${credentials.describe}.`
          : `Sent from ${credentials.describe} as a draft — until you publish, only numbers on that WhatsApp account can open it.`,
    };
  } catch (error) {
    return { ok: false, error: metaReason(error, "The form could not be sent.") };
  }
}

const KNOWN: readonly string[] = ["draft", "published", "deprecated", "blocked", "throttled"];

/** Meta reports states the column may not know; anything new reads as draft. */
function normaliseStatus(status: string | undefined): FlowStatus {
  const lower = (status ?? "draft").toLowerCase();
  return KNOWN.includes(lower) ? (lower as FlowStatus) : "draft";
}
