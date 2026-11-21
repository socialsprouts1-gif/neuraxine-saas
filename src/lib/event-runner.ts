import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normaliseWaNumber } from "@/lib/whatsapp-link";
import { resolveConnection } from "@/lib/connections";
import { resolveTemplateShape } from "@/lib/template-unpack";
import { buildTemplateComponents } from "@/lib/template-components";
import { fillTemplateText } from "@/lib/template-variables";
import { sendTemplateMessage, describeMetaError, MetaApiError } from "@/lib/meta-whatsapp";
import { recordOutboundTemplate } from "@/lib/outbound-log";
import { enrol } from "@/lib/drip-engine";
import {
  fillFromEvent,
  missingValues,
  ruleMatches,
  type IncomingEvent,
  type MatchOperator,
} from "@/lib/events";

// What happens when somebody else's system tells us something.
//
// The event is written down first, always, and the outcome written back
// afterwards. That order is the whole design: the first question anybody
// integrating asks is "did it arrive", and a log that only records
// events that matched a rule cannot answer it. Half the support time on
// any integration goes on that question.
//
// Three things a rule can do, and no more. A sequence covers everything
// needing a delay or a second message — "thank you now, review tomorrow"
// is a two-step sequence — and that engine already handles delays, exits
// and people who reply. Growing a scheduler here would be a second,
// worse copy of it.

export interface EventResult {
  eventId: string | null;
  matched: number;
  /** Set when a rule matched but could not be carried out. */
  problem?: string;
}

interface AutomationRow {
  id: string;
  name: string;
  event_name: string;
  match_field: string | null;
  match_operator: string | null;
  match_value: string | null;
  action: string;
  template_id: string | null;
  template_language: string;
  variables: string[];
  campaign_id: string | null;
  tag: string | null;
  connection_id: string | null;
}

/**
 * Takes one event and does whatever is listening for it.
 *
 * Never throws. The caller is an HTTP endpoint somebody else's software
 * is calling, often in the middle of taking a payment — a 500 from here
 * can stop a till working, and no message is worth that.
 */
export async function handleEvent(input: {
  orgId: string;
  name: string;
  data: Record<string, unknown>;
  phone: string;
  contactName: string;
  email?: string;
  source?: "api" | "test";
}): Promise<EventResult> {
  const admin = createAdminClient();
  const event: IncomingEvent = { name: input.name, data: input.data };
  // Empty rather than null: every use below asks "is there a number",
  // and one falsy check reads better than two.
  const waId = normaliseWaNumber(input.phone) ?? "";

  let eventId: string | null = null;
  let contactId: string | null = null;

  try {
    // The contact first, so the log reads as a person rather than a
    // number, and so a rule can tag them.
    if (waId) {
      contactId = await findOrCreateContact(admin, input.orgId, waId, input.contactName, input.email);
    }

    const { data: written } = await admin
      .from("events")
      .insert({
        org_id: input.orgId,
        name: input.name,
        contact_id: contactId,
        wa_id: waId || null,
        data: input.data,
        source: input.source ?? ("api" as const),
      })
      .select("id")
      .single();

    eventId = written?.id ?? null;
  } catch (error) {
    // Could not even write it down. Nothing else is going to work, and
    // the caller gets told rather than a silent 200.
    return {
      eventId: null,
      matched: 0,
      problem: error instanceof Error ? error.message : "The event could not be recorded.",
    };
  }

  try {
    const { data: rules } = await admin
      .from("event_automations")
      .select(
        "id, name, event_name, match_field, match_operator, match_value, action, template_id, template_language, variables, campaign_id, tag, connection_id"
      )
      .eq("org_id", input.orgId)
      .eq("is_active", true)
      .eq("event_name", input.name);

    const listening = ((rules ?? []) as AutomationRow[]).filter((rule) =>
      ruleMatches(
        {
          eventName: rule.event_name,
          matchField: rule.match_field,
          matchOperator: rule.match_operator as MatchOperator | null,
          matchValue: rule.match_value,
        },
        event
      )
    );

    if (listening.length === 0) {
      await stamp(admin, eventId, "no_match", 0, null);
      return { eventId, matched: 0 };
    }

    let done = 0;
    const problems: string[] = [];

    for (const rule of listening) {
      const outcome = await runOne(admin, rule, {
        orgId: input.orgId,
        event,
        waId,
        contactId,
        contactName: input.contactName,
      });
      if (outcome.ok) done += 1;
      else problems.push(`${rule.name}: ${outcome.problem ?? "did not run"}`);
    }

    // Every failure, not the first.
    //
    // Reporting only the first hid the one that mattered. Two rules
    // listened for the same event; one was a leftover with no template
    // and failed instantly, and its message was the only thing on the
    // log — so the rule the operator had actually set up could fail for
    // its own reason, every time, and never say why.
    const problem = problems.length > 0 ? problems.join(" · ") : null;

    // Failed only when nothing at all ran. One rule working and another
    // failing is still a message delivered, and burying that under a red
    // line would send somebody looking for a problem they do not have —
    // the line beside it says what is wrong.
    await stamp(admin, eventId, done > 0 ? "matched" : "failed", done, problem);

    return { eventId, matched: done, problem: problem ?? undefined };
  } catch (error) {
    const problem = error instanceof Error ? error.message : "The automations could not be run.";
    await stamp(admin, eventId, "failed", 0, problem);
    return { eventId, matched: 0, problem };
  }
}

type Admin = ReturnType<typeof createAdminClient>;

type Outcome = "received" | "matched" | "no_match" | "failed" | "ignored";

async function stamp(
  admin: Admin,
  eventId: string | null,
  outcome: Outcome,
  matched: number,
  error: string | null
): Promise<void> {
  if (!eventId) return;
  try {
    await admin
      .from("events")
      .update({ outcome, matched, error: error?.slice(0, 500) ?? null })
      .eq("id", eventId);
  } catch {
    // The work already happened. A log line that could not be updated is
    // not worth failing the request over.
  }
}

/** One rule, carried out. */
async function runOne(
  admin: Admin,
  rule: AutomationRow,
  context: {
    orgId: string;
    event: IncomingEvent;
    waId: string;
    contactId: string | null;
    contactName: string;
  }
): Promise<{ ok: boolean; problem?: string }> {
  if (rule.action === "add_tag") {
    const tag = (rule.tag ?? "").trim();
    if (!tag) return { ok: false, problem: "no tag set" };
    if (!context.contactId) return { ok: false, problem: "no contact on the event" };

    const { data: contact } = await admin
      .from("contacts")
      .select("tags")
      .eq("id", context.contactId)
      .maybeSingle();

    const tags = new Set([...(contact?.tags ?? []), tag]);
    const { error } = await admin
      .from("contacts")
      .update({ tags: [...tags] })
      .eq("id", context.contactId);

    return error ? { ok: false, problem: error.message } : { ok: true };
  }

  // Everything else needs somebody to send to.
  if (!context.waId) {
    return { ok: false, problem: "the event carried no phone number" };
  }

  if (rule.action === "start_sequence") {
    if (!rule.campaign_id) return { ok: false, problem: "no sequence chosen" };

    const result = await enrol(
      admin,
      rule.campaign_id,
      [{ waId: context.waId, contactId: context.contactId }],
      "api",
      { restart: true }
    );

    if (result.error) return { ok: false, problem: result.error };
    return result.enrolled > 0
      ? { ok: true }
      : { ok: false, problem: "already in that sequence" };
  }

  // send_template.
  if (!rule.template_id) return { ok: false, problem: "no template chosen" };

  const { data: template } = await admin
    .from("message_templates")
    .select("name, language, body_text, header_format, header_text, components_json")
    .eq("id", rule.template_id)
    .eq("org_id", context.orgId)
    .maybeSingle();

  if (!template) return { ok: false, problem: "that template no longer exists" };

  // The blanks, filled from this event. This is the part a campaign
  // cannot do: one event is one person, so the customer's own name goes
  // in rather than one name shared by everybody.
  const filled = fillFromEvent(rule.variables ?? [], context.event);
  const missing = missingValues(filled, rule.variables ?? []);
  if (missing.length > 0) {
    return {
      ok: false,
      problem: `the event had nothing for ${missing.join(", ")}`,
    };
  }

  const connection = await resolveConnection(admin, context.orgId, {
    connectionId: rule.connection_id,
  });
  if ("error" in connection) return { ok: false, problem: connection.error };

  const shape = resolveTemplateShape(template);
  const built = buildTemplateComponents(shape, filled);
  if (!built.ok) return { ok: false, problem: built.error };

  try {
    const result = await sendTemplateMessage(
      connection.phoneNumberId,
      context.waId,
      template.name,
      template.language || rule.template_language || "en_US",
      built.components,
      connection.accessToken
    );

    await recordOutboundTemplate(admin, {
      orgId: context.orgId,
      connectionId: connection.id,
      waId: context.waId,
      contactName: context.contactName || null,
      templateName: template.name,
      language: template.language,
      body: fillTemplateText(shape.bodyText, filled),
      source: rule.name,
      waMessageId: result.messages[0]?.id ?? null,
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      problem:
        error instanceof MetaApiError
          ? describeMetaError(error.status, error.body)
          : error instanceof Error
            ? error.message
            : "the message could not be sent",
    };
  }
}

/** The person this happened to, created if this is the first we have heard of them. */
async function findOrCreateContact(
  admin: Admin,
  orgId: string,
  waId: string,
  name: string,
  email?: string
): Promise<string | null> {
  const { data: existing } = await admin
    .from("contacts")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("wa_id", waId)
    .maybeSingle();

  if (existing) {
    // A name we did not have before is worth keeping; one we did is not
    // worth overwriting with whatever the till calls them.
    if (name && !existing.name) {
      await admin.from("contacts").update({ name }).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created } = await admin
    .from("contacts")
    .insert({
      org_id: orgId,
      wa_id: waId,
      name: name || null,
      email: email || null,
      source: "api",
    })
    .select("id")
    .single();

  return created?.id ?? null;
}
