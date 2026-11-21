"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrg } from "@/lib/org";
import { handleEvent } from "@/lib/event-runner";
import { normaliseEventName, type MatchOperator } from "@/lib/events";
import { starterFor } from "@/lib/event-starters";
import { resolveTemplateShape } from "@/lib/template-unpack";
import { templateVariables } from "@/lib/template-variables";
import type { ActionResult } from "./actions";

// The rules that listen for events, and the button that proves one works.

const ACTIONS = ["send_template", "start_sequence", "add_tag"] as const;
const OPERATORS = ["equals", "not_equals", "contains", "gt", "lt", "exists"] as const;

export async function saveEventAutomation(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const eventName = normaliseEventName(formData.get("event_name"));

  if (!name) return { ok: false, error: "Give the rule a name so you can find it later." };
  if (!eventName) return { ok: false, error: "Say which event this listens for." };
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(eventName)) {
    return {
      ok: false,
      error: "An event name can use lowercase letters, numbers, dots, dashes and underscores.",
    };
  }

  const action = String(formData.get("action") ?? "send_template");
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
    return { ok: false, error: "That is not something a rule can do." };
  }

  const templateId = String(formData.get("template_id") ?? "").trim() || null;
  const campaignId = String(formData.get("campaign_id") ?? "").trim() || null;
  const tag = String(formData.get("tag") ?? "").trim() || null;

  // Refused here rather than discovered when the event arrives at
  // midnight and nothing happens.
  if (action === "send_template" && !templateId) {
    return { ok: false, error: "Choose the template this sends." };
  }
  if (action === "start_sequence" && !campaignId) {
    return { ok: false, error: "Choose the sequence this starts." };
  }
  if (action === "add_tag" && !tag) {
    return { ok: false, error: "Give the tag to add." };
  }

  const operatorRaw = String(formData.get("match_operator") ?? "").trim();
  const operator = OPERATORS.includes(operatorRaw as MatchOperator)
    ? (operatorRaw as MatchOperator)
    : null;
  const field = String(formData.get("match_field") ?? "").trim() || null;

  // A condition is only a condition when both halves are there. Half of
  // one would quietly match everything, which is the opposite of what
  // somebody setting a condition wanted.
  const hasCondition = Boolean(field && operator);

  const row = {
    org_id: orgId,
    name,
    event_name: eventName,
    is_active: formData.get("is_active") !== null,
    match_field: hasCondition ? field : null,
    match_operator: hasCondition ? operator : null,
    match_value: hasCondition ? String(formData.get("match_value") ?? "").trim() : null,
    action: action as (typeof ACTIONS)[number],
    template_id: action === "send_template" ? templateId : null,
    template_language: String(formData.get("template_language") ?? "en_US").trim() || "en_US",
    variables: String(formData.get("variables") ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
    campaign_id: action === "start_sequence" ? campaignId : null,
    tag: action === "add_tag" ? tag : null,
    connection_id: String(formData.get("connection_id") ?? "").trim() || null,
  };

  // The template's blanks, counted against the values given.
  //
  // Meta refuses a mismatch with "Parameter format does not match format
  // in the created template", which names neither the template nor the
  // blank, and arrives once per customer at the worst possible moment.
  // Counting here turns that into a sentence before anything is saved.
  if (row.action === "send_template" && row.template_id) {
    const { data: template } = await supabase
      .from("message_templates")
      .select("name, body_text, header_format, header_text, components_json")
      .eq("id", row.template_id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (template) {
      const shape = resolveTemplateShape(template);
      const blanks =
        templateVariables(shape.bodyText ?? "").length +
        ((shape.headerFormat ?? "NONE").toUpperCase() === "TEXT"
          ? templateVariables(shape.headerText ?? "").length
          : 0);

      if (blanks !== row.variables.length) {
        return {
          ok: false,
          error:
            blanks === 0
              ? `“${template.name}” has no blanks to fill, but ${row.variables.length} ${
                  row.variables.length === 1 ? "value was" : "values were"
                } given. Clear the box and save again.`
              : `“${template.name}” has ${blanks} blank${blanks === 1 ? "" : "s"} to fill, and ${
                  row.variables.length
                } ${row.variables.length === 1 ? "value was" : "values were"} given. Put one value on each line, in order.`,
        };
      }
    }
  }

  const { error } = id
    ? await supabase.from("event_automations").update(row).eq("id", id).eq("org_id", orgId)
    : await supabase.from("event_automations").insert(row);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/connections");
  return { ok: true, message: row.is_active ? "Saved and listening." : "Saved as a draft." };
}

export async function toggleEventAutomation(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "").trim();
  const next = String(formData.get("is_active") ?? "") !== "true";

  // Switching on a rule that cannot possibly run is the trap the
  // ready-made sets walked people into. They arrive as drafts with no
  // template chosen — correctly, because nobody can choose one for you —
  // and the toggle happily switched them on anyway. From then on every
  // matching event failed, and because two rules can listen for the same
  // event, this one's failure was often the only thing on the log.
  if (next) {
    const { data: rule } = await supabase
      .from("event_automations")
      .select("name, action, template_id, campaign_id, tag")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (rule) {
      const missing =
        rule.action === "send_template" && !rule.template_id
          ? "a message to send"
          : rule.action === "start_sequence" && !rule.campaign_id
            ? "a sequence to start"
            : rule.action === "add_tag" && !(rule.tag ?? "").trim()
              ? "a tag to add"
              : null;

      if (missing) {
        return {
          ok: false,
          error: `“${rule.name}” has no ${missing} yet. Press Edit, choose one, then switch it on.`,
        };
      }
    }
  }

  const { error } = await supabase
    .from("event_automations")
    .update({ is_active: next })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/connections");
  return { ok: true, message: next ? "Listening." : "Paused." };
}

export async function deleteEventAutomation(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "").trim();

  const { error } = await (await createClient())
    .from("event_automations")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/connections");
  return { ok: true, message: "Removed." };
}

/**
 * Fires a made-up event, as if the other system had sent it.
 *
 * The one thing that turns "I think I wired it up right" into knowing.
 * Marked as a test in the log so a real one is never confused for it.
 */
export async function sendTestEvent(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const name = normaliseEventName(formData.get("event_name"));
  if (!name) return { ok: false, error: "Give the event a name to test." };

  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) {
    return { ok: false, error: "Give a phone number — your own — so you can see what arrives." };
  }

  let data: Record<string, unknown> = {};
  const raw = String(formData.get("data") ?? "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, error: "The details have to be a JSON object, like {\"total\": 1840}." };
      }
      data = parsed as Record<string, unknown>;
    } catch {
      return { ok: false, error: "That is not valid JSON. Check the quotes and commas." };
    }
  }

  const result = await handleEvent({
    orgId,
    name,
    data,
    phone,
    contactName: String(formData.get("contact_name") ?? "").trim(),
    source: "test",
  });

  revalidatePath("/connections");

  if (result.problem) return { ok: false, error: result.problem };

  return {
    ok: true,
    message:
      result.matched > 0
        ? `Sent. ${result.matched} automation${result.matched === 1 ? "" : "s"} ran.`
        : "The event arrived, but no rule is listening for it yet.",
  };
}

/** Creates a trade's worth of rules at once, as drafts. */
export async function addEventStarters(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const starter = starterFor(String(formData.get("starter") ?? "").trim());
  if (!starter) return { ok: false, error: "That set no longer exists." };

  const admin = createAdminClient();

  // Skip the ones already there, so pressing it twice does not leave two
  // of everything.
  const { data: existing } = await admin
    .from("event_automations")
    .select("name")
    .eq("org_id", orgId);

  const have = new Set((existing ?? []).map((row) => row.name));
  const toAdd = starter.rules.filter((rule) => !have.has(rule.name));

  if (toAdd.length === 0) {
    return { ok: false, error: "Those rules are already here." };
  }

  const { error } = await admin.from("event_automations").insert(
    toAdd.map((rule) => ({
      org_id: orgId,
      name: rule.name,
      event_name: rule.event,
      // Drafts, always. Each one still needs a template or a sequence
      // chosen, and a rule that was switched on without one would fail
      // for every customer until somebody noticed.
      is_active: false,
      action: rule.action,
      tag: rule.tag ?? null,
      variables: rule.variables ?? [],
      match_field: rule.match?.field ?? null,
      match_operator: rule.match?.operator ?? null,
      match_value: rule.match?.value ?? null,
    }))
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/connections");
  return {
    ok: true,
    message: `${toAdd.length} rules added as drafts. Open each one, choose what it sends, then switch it on.`,
  };
}


// --- staff links ----------------------------------------------------------
//
// The answer to "how do I trigger it" for a business that has no software
// of its own, which is most of them. One web address, no login, big
// buttons. A waiter opens it on their phone and keeps it open.

export async function createStaffLink(formData: FormData): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim() || "Staff link";

  // Twenty-four random bytes, the same as every other public token here.
  // It is the only thing standing between the URL and the automations,
  // so it is not derived from anything guessable.
  const token = randomBytes(24).toString("base64url");

  const { error } = await createAdminClient()
    .from("staff_links")
    .insert({ org_id: orgId, name, token, created_by: user.id });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/connections");
  return { ok: true, message: "Link ready. Send it to whoever is on the floor." };
}

export async function revokeStaffLink(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "").trim();

  const { error } = await (await createClient())
    .from("staff_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/connections");
  return { ok: true, message: "That link stops working now." };
}
