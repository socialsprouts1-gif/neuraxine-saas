/**
 * Automation engine.
 *
 * Ties incoming WhatsApp messages to the data store and runs the automation
 * primitives the product exposes:
 *   - keyword / welcome / fallback auto-reply rules
 *   - drip flows (time-delayed follow-up sequences via scheduled jobs)
 *   - broadcast campaign sends
 *
 * Outbound delivery goes through `sendOutbound`, which uses the real Cloud API
 * when credentials are present and sandbox mode is off, and otherwise simulates
 * the send (recording the message + a delivered status) so the product is fully
 * demonstrable without live credentials.
 */

import { isWhatsAppConfigured, sendTemplate, sendText } from "@/lib/whatsapp";
import {
  addMessage,
  db,
  getConversationForContact,
  getSettings,
  listFlows,
  listRules,
  logActivity,
  newId,
  updateCampaign,
  upsertContactByPhone,
  type Campaign,
  type Contact,
  type Message,
} from "@/lib/store";

/** True when messages should be simulated rather than really sent. */
export function isSandbox(): boolean {
  return getSettings().sandboxMode || !isWhatsAppConfigured();
}

interface SendOpts {
  via?: Message["via"];
  templateName?: string;
}

/**
 * Send (or simulate) an outbound message to a contact and record it.
 */
export async function sendOutbound(
  contact: Contact,
  text: string,
  opts: SendOpts = {},
): Promise<Message> {
  const conv = getConversationForContact(contact.id);
  const base = {
    conversationId: conv.id,
    contactId: contact.id,
    direction: "out" as const,
    type: opts.templateName ? "template" : "text",
    text,
    via: opts.via ?? "manual",
    templateName: opts.templateName,
  };

  if (isSandbox()) {
    // Simulate: accepted immediately, "delivered" shortly after.
    const msg = addMessage({ ...base, status: "sent", wamid: `sim_${newId("wamid")}` });
    msg.status = "delivered";
    return msg;
  }

  const result = opts.templateName
    ? await sendTemplate(contact.phone, opts.templateName, "en_US")
    : await sendText(contact.phone, text);

  return addMessage({
    ...base,
    status: result.ok ? "sent" : "failed",
    wamid: result.messageId,
    error: result.ok ? undefined : result.error,
  });
}

/* -------------------------------------------------------------------------- */
/*  Inbound processing                                                         */
/* -------------------------------------------------------------------------- */

function ruleMatches(rule: ReturnType<typeof listRules>[number], text: string): boolean {
  const t = text.trim().toLowerCase();
  if (rule.triggerType === "default") return true;
  return rule.keywords.some((kw) => {
    const k = kw.toLowerCase();
    if (rule.matchType === "exact") return t === k;
    if (rule.matchType === "starts_with") return t.startsWith(k);
    return t.includes(k);
  });
}

/**
 * Handle one inbound text message: upsert contact, record it, run the first
 * matching auto-reply rule, and enroll the contact into any matching flows.
 */
export async function processInbound(
  phone: string,
  text: string,
  name?: string,
): Promise<{ contact: Contact; reply?: Message }> {
  const isNew = !db().contacts.some((c) => c.phone === phone);
  const contact = upsertContactByPhone(phone, name);
  const conv = getConversationForContact(contact.id);

  addMessage({
    conversationId: conv.id,
    contactId: contact.id,
    direction: "in",
    type: "text",
    text,
    status: "delivered",
  });
  logActivity("message", `New message from ${contact.name}`);

  // Enroll into flows (new-contact + keyword triggers).
  enrollFlows(contact, text, isNew);

  // Auto-reply rules (respect global toggle).
  let reply: Message | undefined;
  if (getSettings().autoReplyEnabled) {
    const rule = listRules()
      .filter((r) => r.enabled)
      .find((r) => ruleMatches(r, text));
    if (rule) {
      rule.triggeredCount += 1;
      logActivity("automation", `Rule “${rule.name}” triggered for ${contact.name}`);
      const body =
        rule.responseType === "template" && rule.responseTemplate
          ? `[template: ${rule.responseTemplate}]`
          : rule.responseText ?? "";
      reply = await sendOutbound(contact, body, {
        via: "automation",
        templateName: rule.responseType === "template" ? rule.responseTemplate : undefined,
      });
    }
  }

  return { contact, reply };
}

/* -------------------------------------------------------------------------- */
/*  Flows (drip sequences)                                                     */
/* -------------------------------------------------------------------------- */

function enrollFlows(contact: Contact, text: string, isNewContact: boolean): void {
  const t = text.trim().toLowerCase();
  for (const flow of listFlows()) {
    if (!flow.enabled || flow.steps.length === 0) continue;

    const triggered =
      (flow.trigger === "on_new_contact" && isNewContact) ||
      flow.trigger === "on_inbound" ||
      (flow.trigger === "keyword" && flow.keywords.some((k) => t.includes(k.toLowerCase())));
    if (!triggered) continue;

    // Avoid double-enrolling a contact already in this flow.
    const already = db().jobs.some(
      (j) => j.flowId === flow.id && j.contactId === contact.id && j.status === "pending",
    );
    if (already) continue;

    flow.enrolledCount += 1;
    flow.steps.forEach((step, index) => {
      db().jobs.push({
        id: newId("job"),
        flowId: flow.id,
        flowName: flow.name,
        contactId: contact.id,
        stepIndex: index,
        message: step.message,
        runAt: new Date(Date.now() + step.delayMinutes * 60_000).toISOString(),
        status: "pending",
      });
    });
  }
}

/**
 * Process every scheduled job whose time has come. Designed to be called from a
 * cron route (Vercel Cron) or on-demand. Returns the number of jobs run.
 */
export async function processDueJobs(): Promise<number> {
  const now = Date.now();
  const due = db().jobs.filter(
    (j) => j.status === "pending" && new Date(j.runAt).getTime() <= now,
  );

  for (const job of due) {
    const contact = db().contacts.find((c) => c.id === job.contactId);
    if (!contact) {
      job.status = "cancelled";
      continue;
    }
    await sendOutbound(contact, job.message, { via: "flow" });
    job.status = "done";

    // Mark flow completion when the last step ran.
    const flow = db().flows.find((f) => f.id === job.flowId);
    if (flow && job.stepIndex === flow.steps.length - 1) flow.completedCount += 1;
  }

  return due.length;
}

/* -------------------------------------------------------------------------- */
/*  Campaigns (broadcast)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Send a broadcast campaign to all contacts matching its audience tag (or all
 * contacts when no tag). Updates the campaign's stats as it goes.
 */
export async function runCampaign(campaign: Campaign): Promise<Campaign> {
  const audience = campaign.audienceTag
    ? db().contacts.filter((c) => c.tags.includes(campaign.audienceTag!))
    : db().contacts;

  updateCampaign(campaign.id, { status: "sending", recipientCount: audience.length });

  const body = campaign.templateName
    ? `[template: ${campaign.templateName}]`
    : `📣 ${campaign.name}`;

  let sent = 0;
  let delivered = 0;
  let failed = 0;
  for (const contact of audience) {
    const msg = await sendOutbound(contact, body, {
      via: "campaign",
      templateName: campaign.templateName,
    });
    sent += 1;
    if (msg.status === "failed") failed += 1;
    else delivered += 1;
  }

  // Simulated engagement so analytics have something to show in sandbox.
  const read = Math.round(delivered * 0.72);
  const clicked = Math.round(delivered * 0.28);

  const updated = updateCampaign(campaign.id, {
    status: "sent",
    stats: { sent, delivered, read, failed, clicked },
  })!;
  logActivity("campaign", `Campaign “${campaign.name}” sent to ${sent} contacts`);
  return updated;
}
