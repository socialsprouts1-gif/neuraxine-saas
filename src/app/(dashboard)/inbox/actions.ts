"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import {
  analyzeConversation,
  rewriteDraft,
  suggestReply,
  translate,
  COPILOT_MODEL,
  type ConversationAnalysis,
  type CopilotContext,
  type RewriteStyle,
} from "@/lib/inbox-ai";
import type { AiCallConfig, AiTurn } from "@/lib/ai-call";
import type { ActionResult } from "@/app/(dashboard)/actions";
import type { AiMode, LeadStage, Priority } from "@/types/portal";
import type { Database } from "@/types/database";

// Everything the inbox does beyond sending a message. Sending stays on
// /api/messages/send — one outbound path, one place the 24-hour window and
// the Meta errors are handled.

const HISTORY_LIMIT = 30;

type Client = Awaited<ReturnType<typeof createClient>>;

/** Records what happened, for the activity timeline. Best-effort. */
async function logEvent(
  supabase: Client,
  orgId: string,
  conversationId: string,
  kind: string,
  label: string,
  actorId?: string
) {
  await supabase.from("conversation_events").insert({
    org_id: orgId,
    conversation_id: conversationId,
    kind,
    label,
    actor_id: actorId ?? null,
  });
}

/**
 * The conversation as the copilot sees it, plus the rig to run on.
 *
 * The org's own assistant supplies the instructions, the knowledge and — if
 * they pasted one — the API key, so the copilot sounds like their assistant
 * and bills to their account.
 */
async function loadContext(
  supabase: Client,
  orgId: string,
  conversationId: string
): Promise<{ context: CopilotContext; config: AiCallConfig } | { error: string }> {
  const [{ data: conversation }, { data: org }, { data: assistant }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, contacts(name)")
      .eq("id", conversationId)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase
      .from("ai_assistants")
      .select("provider, model, api_key_encrypted, api_base_url, system_prompt, use_knowledge_base")
      .eq("org_id", orgId)
      .order("is_active", { ascending: false })
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);

  if (!conversation) return { error: "That conversation is not in this workspace." };

  const { data: messages } = await supabase
    .from("messages")
    .select("direction, type, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const history: AiTurn[] = (messages ?? [])
    .reverse()
    .map((message) => ({
      role: message.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      text: plainText(message.type, message.content),
    }))
    .filter((turn) => turn.text.trim());

  let knowledge = "";
  if (assistant?.use_knowledge_base) {
    const { data: entries } = await supabase
      .from("assistant_knowledge")
      .select("title, content")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .limit(20);
    knowledge = (entries ?? [])
      .map((entry) => `### ${entry.title}\n${entry.content.slice(0, 1500)}`)
      .join("\n\n");
  }

  const contact = conversation.contacts as { name: string | null } | null;

  return {
    context: {
      orgName: org?.name ?? "this business",
      contactName: contact?.name ?? null,
      history,
      instructions: assistant?.system_prompt ?? undefined,
      knowledge,
    },
    config: assistant
      ? {
          provider: assistant.provider,
          model: assistant.model,
          api_key_encrypted: assistant.api_key_encrypted,
          api_base_url: assistant.api_base_url,
          temperature: COPILOT_MODEL.temperature,
          max_tokens: COPILOT_MODEL.max_tokens,
        }
      : COPILOT_MODEL,
  };
}

/** Message payloads are type-specific; the copilot only wants the words. */
function plainText(type: string, content: Record<string, unknown>): string {
  if (type === "text") return String(content.body ?? "");
  if (type === "interactive" || type === "button") {
    const c = content as {
      body?: string;
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    };
    return String(c.button_reply?.title ?? c.list_reply?.title ?? c.body ?? "");
  }
  if (type === "template") return `(template: ${String(content.template_name ?? "")})`;
  const caption = content.caption ? String(content.caption) : "";
  return caption ? `(${type}) ${caption}` : `(${type})`;
}

// --- copilot --------------------------------------------------------------

export type CopilotAction =
  | { kind: "suggest" }
  | { kind: "rewrite"; style: RewriteStyle; draft: string }
  | { kind: "translate"; target: string; text: string };

/** Returns text for the composer. Nothing here reaches the customer. */
export async function runCopilot(
  conversationId: string,
  action: CopilotAction
): Promise<ActionResult & { text?: string }> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const loaded = await loadContext(supabase, orgId, conversationId);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const result =
    action.kind === "suggest"
      ? await suggestReply(loaded.context, loaded.config)
      : action.kind === "rewrite"
        ? await rewriteDraft(action.draft, action.style, loaded.context, loaded.config)
        : await translate(action.text, action.target, loaded.config);

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, text: result.text };
}

/**
 * Reads the thread and caches the result on the conversation and contact.
 *
 * One call fills the score, the intent, the sentiment, the summary and the
 * next action, so the five never disagree with each other.
 */
export async function analyzeThread(
  conversationId: string
): Promise<ActionResult & { analysis?: ConversationAnalysis }> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const loaded = await loadContext(supabase, orgId, conversationId);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const result = await analyzeConversation(loaded.context, loaded.config);
  if (!result.ok) return { ok: false, error: result.error };
  const analysis = result.analysis;

  const { data: latest } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: conversation } = await supabase
    .from("conversations")
    .update({
      ai_summary: analysis.summary,
      ai_next_action: analysis.nextAction,
      ai_intent: analysis.intent,
      ai_sentiment: analysis.sentiment,
      needs_human: analysis.needsHuman,
      needs_human_reason: analysis.needsHumanReason,
      ai_analyzed_at: new Date().toISOString(),
      ai_analyzed_message_id: latest?.id ?? null,
    })
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .select("contact_id")
    .maybeSingle();

  if (conversation) {
    await supabase
      .from("contacts")
      .update({
        lead_score: analysis.score,
        lead_score_reasons: analysis.reasons,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation.contact_id)
      .eq("org_id", orgId);
  }

  await logEvent(
    supabase,
    orgId,
    conversationId,
    "ai",
    `AI scored this lead ${analysis.score}/100 — ${analysis.intent}`
  );

  revalidatePath("/inbox");
  return { ok: true, analysis, message: "Analysed." };
}

// --- conversation controls ------------------------------------------------

export async function setAiMode(conversationId: string, mode: AiMode): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();
  const supabase = await createClient();

  const { error } = await supabase
    .from("conversations")
    .update({
      ai_mode: mode,
      // bot_enabled is what the message runner actually checks, so the mode
      // has to move it or "Human" would be a label over a bot still replying.
      bot_enabled: mode === "ai",
      ...(mode === "human" ? { bot_flow_id: null, bot_node_id: null } : {}),
    })
    .eq("id", conversationId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  await logEvent(
    supabase,
    orgId,
    conversationId,
    "mode",
    mode === "ai"
      ? "AI set to answer automatically"
      : mode === "copilot"
        ? "Switched to Copilot — AI suggests, a human sends"
        : "A human took over",
    user.id
  );

  revalidatePath("/inbox");
  return {
    ok: true,
    message:
      mode === "ai" ? "AI is answering." : mode === "copilot" ? "Copilot mode." : "You have the chat.",
  };
}

export async function setLeadStage(
  conversationId: string,
  contactId: string,
  stage: LeadStage
): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();
  const supabase = await createClient();

  const { error } = await supabase
    .from("contacts")
    .update({ lead_stage: stage, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  await logEvent(supabase, orgId, conversationId, "stage", `Stage set to ${stage}`, user.id);
  revalidatePath("/inbox");
  return { ok: true, message: `Stage: ${stage}.` };
}

export async function setPriority(
  conversationId: string,
  priority: Priority
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { error } = await supabase
    .from("conversations")
    .update({ priority })
    .eq("id", conversationId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}

/** Closing takes a thread out of the active list; reopening puts it back. */
export async function setConversationClosed(
  conversationId: string,
  closed: boolean
): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();
  const supabase = await createClient();

  const { error } = await supabase
    .from("conversations")
    .update({
      closed_at: closed ? new Date().toISOString() : null,
      status: closed ? "resolved" : "open",
    })
    .eq("id", conversationId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  await logEvent(
    supabase,
    orgId,
    conversationId,
    "status",
    closed ? "Conversation closed" : "Conversation reopened",
    user.id
  );
  revalidatePath("/inbox");
  return { ok: true, message: closed ? "Closed." : "Reopened." };
}

export async function updateContactDetails(
  contactId: string,
  fields: {
    source?: string | null;
    campaign?: string | null;
    dealValue?: number | null;
    tags?: string[];
  }
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const update: Partial<Database["public"]["Tables"]["contacts"]["Update"]> = {
    updated_at: new Date().toISOString(),
  };
  if (fields.source !== undefined) update.source = fields.source?.trim() || null;
  if (fields.campaign !== undefined) update.campaign = fields.campaign?.trim() || null;
  if (fields.tags !== undefined) update.tags = fields.tags;
  if (fields.dealValue !== undefined) {
    if (fields.dealValue !== null && (!Number.isFinite(fields.dealValue) || fields.dealValue < 0)) {
      return { ok: false, error: "Deal value must be a positive number." };
    }
    update.deal_value = fields.dealValue;
  }

  const { error } = await supabase
    .from("contacts")
    .update(update)
    .eq("id", contactId)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true, message: "Saved." };
}

// --- notes and reminders --------------------------------------------------

export async function addInternalNote(
  conversationId: string,
  body: string
): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Write the note first." };

  const supabase = await createClient();
  const { error } = await supabase.from("conversation_notes").insert({
    org_id: orgId,
    conversation_id: conversationId,
    author_id: user.id,
    body: trimmed,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true, message: "Note saved — the customer cannot see it." };
}

export async function deleteInternalNote(id: string): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversation_notes")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}

export async function addReminder(
  conversationId: string,
  contactId: string,
  minutes: number,
  title: string
): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();
  if (!Number.isFinite(minutes) || minutes < 1) {
    return { ok: false, error: "Pick when to be reminded." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reminders").insert({
    org_id: orgId,
    conversation_id: conversationId,
    contact_id: contactId,
    created_by: user.id,
    title: title.trim() || "Follow up",
    remind_at: new Date(Date.now() + minutes * 60_000).toISOString(),
  });

  if (error) return { ok: false, error: error.message };

  await logEvent(supabase, orgId, conversationId, "reminder", `Reminder set: ${title}`, user.id);
  revalidatePath("/inbox");
  return { ok: true, message: "Reminder set." };
}

export async function cancelReminder(id: string): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return { ok: true };
}

// --- bulk -----------------------------------------------------------------

export async function bulkUpdate(
  ids: string[],
  action:
    | { kind: "assign"; userId: string | null }
    | { kind: "close" }
    | { kind: "read" }
    | { kind: "tag"; tag: string }
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };

  const supabase = await createClient();
  const now = new Date().toISOString();

  if (action.kind === "tag") {
    // Tags live on the contact, so a bulk tag has to go through the
    // conversations to find them.
    const { data: rows } = await supabase
      .from("conversations")
      .select("contact_id, contacts(tags)")
      .eq("org_id", orgId)
      .in("id", ids);

    for (const row of rows ?? []) {
      const existing = (row.contacts as { tags: string[] } | null)?.tags ?? [];
      if (existing.includes(action.tag)) continue;
      await supabase
        .from("contacts")
        .update({ tags: [...existing, action.tag], updated_at: now })
        .eq("id", row.contact_id)
        .eq("org_id", orgId);
    }
    revalidatePath("/inbox");
    return { ok: true, message: `Tagged ${ids.length}.` };
  }

  const update =
    action.kind === "assign"
      ? { assigned_to: action.userId }
      : action.kind === "close"
        ? { closed_at: now, status: "resolved" as const }
        : { last_read_at: now };

  const { error } = await supabase
    .from("conversations")
    .update(update)
    .eq("org_id", orgId)
    .in("id", ids);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/inbox");
  return {
    ok: true,
    message:
      action.kind === "assign"
        ? `Assigned ${ids.length}.`
        : action.kind === "close"
          ? `Closed ${ids.length}.`
          : `Marked ${ids.length} read.`,
  };
}
