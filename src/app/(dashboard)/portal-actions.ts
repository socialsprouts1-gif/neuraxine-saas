"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { NODE_DEFS, type FlowEdge, type FlowNode } from "@/types/flow";
import { encryptToken } from "@/lib/crypto";
import { checkAccessToken } from "@/lib/access-token";
import {
  defaultModelFor,
  isProviderId,
  presetById,
  providerById,
} from "@/lib/ai-providers";
import { parseClock } from "@/lib/working-hours";
import {
  KNOWLEDGE_SOURCE_TYPES,
  type AiAssistant,
  type KnowledgeSourceType,
} from "@/types/portal";
import { integrationBySlug } from "@/lib/integrations";
import { generateFlow, PLATFORM_FLOW_MODEL } from "@/lib/flow-generator";
import { buildInstructions, PROMPT_BUILDER_MODEL } from "@/lib/prompt-builder";
import type { ActionResult } from "./actions";

// As in actions.ts: the org is always re-derived from the session, never
// taken from the submitted form.

async function requireManager() {
  const ctx = await requireOrg();
  if (ctx.role !== "owner" && ctx.role !== "admin") return null;
  return ctx;
}

// ---------------------------------------------------------------- AI assistants

/**
 * Creates the row and hands back its id, so the caller can send the user
 * straight into the editor. Everything else about an assistant is edited
 * there rather than guessed at creation time.
 */
export async function createAiAssistant(
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const { orgId } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Assistant name is required." };

  const presetId = String(formData.get("prompt_preset") ?? "support");
  const preset = presetById(presetId);
  const providerId = String(formData.get("provider") ?? "anthropic");
  const provider = isProviderId(providerId) ? providerId : "anthropic";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_assistants")
    .insert({
      org_id: orgId,
      name,
      role: preset?.role ?? "Support agent",
      provider,
      model: defaultModelFor(provider),
      system_prompt: preset?.prompt ?? "",
      prompt_preset: preset?.id ?? "custom",
      // New assistants start switched off. An assistant that begins
      // answering customers the moment it is named, before anyone has read
      // its prompt, is a support incident waiting to happen.
      is_active: false,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/ai-assistant");
  return { ok: true, message: "Assistant created.", id: data.id };
}

/** The assistant an org's AI features should run on: their own key first. */
async function orgAiConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
) {
  const { data } = await supabase
    .from("ai_assistants")
    .select("provider, model, api_key_encrypted, api_base_url")
    .eq("org_id", orgId)
    .not("api_key_encrypted", "is", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data;
}

/** Writes the system prompt from a plain-language description of the job. */
export async function generateAssistantInstructions(
  description: string,
  role: string
): Promise<ActionResult & { prompt?: string }> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const own = await orgAiConfig(supabase, orgId);

  const result = await buildInstructions(
    description,
    role,
    own
      ? {
          ...own,
          // Their assistant is tuned for chat replies; a prompt needs
          // structure and a little more room.
          temperature: PROMPT_BUILDER_MODEL.temperature,
          max_tokens: PROMPT_BUILDER_MODEL.max_tokens,
        }
      : PROMPT_BUILDER_MODEL
  );

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, prompt: result.prompt, message: "Instructions written." };
}

/**
 * Pulls the readable text off a page so it can be stored as knowledge.
 *
 * The assistant answers from what is stored here — it never browses — so the
 * text is fetched once, now, and kept.
 */
export async function importKnowledgeFromUrl(
  url: string
): Promise<ActionResult & { title?: string; content?: string }> {
  await requireOrg();

  let target: URL;
  try {
    target = new URL(url.trim());
  } catch {
    return { ok: false, error: "That is not a valid URL." };
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return { ok: false, error: "The link must start with http:// or https://" };
  }

  let response: Response;
  try {
    response = await fetch(target, {
      headers: { accept: "text/html,text/plain" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
  } catch {
    return { ok: false, error: "Could not reach that page. Check the link and try again." };
  }

  if (!response.ok) {
    return { ok: false, error: `That page returned ${response.status}. Check the link.` };
  }

  const html = (await response.text()).slice(0, 500_000);

  // script and style first, or their contents land in the knowledge base as
  // a wall of minified JavaScript.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 40_000);

  if (text.length < 40) {
    return {
      ok: false,
      error: "There was no readable text on that page — it may render entirely in JavaScript. Copy the text in by hand instead.",
    };
  }

  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  const title = (titleMatch?.[1] ?? target.hostname).trim().slice(0, 120);

  return { ok: true, title, content: text };
}

/**
 * The whole Settings tab: who the assistant is, its prompt, and the provider
 * and key it runs on. One action because they are one decision — saving the
 * model apart from the key leaves an assistant pointing at something it
 * cannot authenticate against.
 */
export async function saveAssistantSettings(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Assistant name is required." };

  const providerId = String(formData.get("provider") ?? "anthropic");
  if (!isProviderId(providerId)) return { ok: false, error: "Unknown provider." };
  const provider = providerById(providerId)!;

  const model = String(formData.get("model") ?? "").trim() || defaultModelFor(providerId);
  if (!model) return { ok: false, error: "Pick a model, or type one for your endpoint." };

  const temperature = Number(formData.get("temperature") ?? 0.7);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false, error: "Creativity must be between 0 and 2." };
  }

  const maxTokens = Number(formData.get("max_tokens") ?? 1024);
  if (!Number.isFinite(maxTokens) || maxTokens < 64 || maxTokens > 8192) {
    return { ok: false, error: "Reply length must be between 64 and 8192 tokens." };
  }

  const baseUrl = String(formData.get("api_base_url") ?? "").trim();
  if (provider.needsBaseUrl && !baseUrl) {
    return {
      ok: false,
      error: "A custom endpoint needs a base URL, e.g. https://openrouter.ai/api/v1",
    };
  }
  if (baseUrl && !/^https:\/\/|^http:\/\/localhost/.test(baseUrl)) {
    return { ok: false, error: "The base URL must start with https:// (or http://localhost)." };
  }

  const handoffKeywords = String(formData.get("handoff_keywords") ?? "")
    .split(",")
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);

  const update: Partial<AiAssistant> = {
    name,
    role: String(formData.get("role") ?? "").trim() || "Support agent",
    system_prompt: String(formData.get("system_prompt") ?? "").trim(),
    prompt_preset: String(formData.get("prompt_preset") ?? "custom"),
    handoff_keywords: handoffKeywords,
    is_active: String(formData.get("is_active") ?? "") === "true",
    provider: providerId,
    model,
    api_base_url: provider.needsBaseUrl ? baseUrl : null,
    temperature,
    max_tokens: Math.round(maxTokens),
    updated_at: new Date().toISOString(),
  };

  // Three cases: clear it, replace it, or leave the stored one alone. An
  // empty box means "no change" — otherwise every unrelated save on this
  // tab would wipe a key the tenant pasted once and cannot read back.
  if (String(formData.get("remove_api_key") ?? "") === "true") {
    update.api_key_encrypted = null;
  } else {
    const pasted = String(formData.get("api_key") ?? "");
    if (pasted.trim()) {
      const check = checkAccessToken(pasted);
      if (!check.ok || !check.token) {
        return { ok: false, error: check.error ?? "That API key cannot be used." };
      }
      update.api_key_encrypted = encryptToken(check.token);
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_assistants")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/ai-assistant/${id}`);
  revalidatePath("/ai-assistant");
  return { ok: true, message: "Assistant saved." };
}

/** The Agent Rules tab: memory, working hours and follow-up. */
export async function saveAssistantRules(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");

  const memoryTurns = Number(formData.get("memory_turns") ?? 20);
  if (!Number.isFinite(memoryTurns) || memoryTurns < 0 || memoryTurns > 100) {
    return { ok: false, error: "Memory must be between 0 and 100 messages." };
  }

  const start = String(formData.get("working_hours_start") ?? "09:00");
  const end = String(formData.get("working_hours_end") ?? "18:00");
  const enabled = String(formData.get("working_hours_enabled") ?? "") === "true";
  if (enabled) {
    if (parseClock(start) === null || parseClock(end) === null) {
      return { ok: false, error: "Working hours must be times like 09:00 and 18:00." };
    }
    if (start === end) {
      return { ok: false, error: "The opening and closing time cannot be the same." };
    }
  }

  const workingDays = formData
    .getAll("working_days")
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (enabled && workingDays.length === 0) {
    return { ok: false, error: "Pick at least one working day, or turn working hours off." };
  }

  const delay = Number(formData.get("followup_delay_minutes") ?? 60);
  const maxFollowups = Number(formData.get("max_followups") ?? 1);
  const followupEnabled = String(formData.get("followup_enabled") ?? "") === "true";
  if (followupEnabled) {
    if (!Number.isFinite(delay) || delay < 1 || delay > 10080) {
      return { ok: false, error: "The follow-up delay must be between 1 minute and 7 days." };
    }
    if (!Number.isFinite(maxFollowups) || maxFollowups < 0 || maxFollowups > 10) {
      return { ok: false, error: "Send between 0 and 10 follow-ups." };
    }
    if (!String(formData.get("followup_message") ?? "").trim()) {
      return { ok: false, error: "Write the follow-up message, or turn follow-ups off." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_assistants")
    .update({
      memory_turns: Math.round(memoryTurns),
      use_knowledge_base: String(formData.get("use_knowledge_base") ?? "") === "true",
      stop_on_human: String(formData.get("stop_on_human") ?? "") === "true",
      working_hours_enabled: enabled,
      working_hours_timezone: String(formData.get("working_hours_timezone") ?? "UTC"),
      working_hours_start: start,
      working_hours_end: end,
      working_days: workingDays,
      off_hours_message: String(formData.get("off_hours_message") ?? "").trim(),
      followup_enabled: followupEnabled,
      followup_delay_minutes: Math.round(delay),
      followup_message: String(formData.get("followup_message") ?? "").trim(),
      max_followups: Math.round(maxFollowups),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/ai-assistant/${id}`);
  return { ok: true, message: "Agent rules saved." };
}

export async function toggleAiAssistant(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("is_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_assistants")
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/ai-assistant");
  revalidatePath(`/ai-assistant/${id}`);
  return { ok: true, message: isActive ? "Assistant paused." : "Assistant is live." };
}

export async function deleteAiAssistant(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_assistants")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/ai-assistant");
  return { ok: true, message: "Assistant deleted." };
}

// ------------------------------------------------------- Knowledge base

export async function saveKnowledgeEntry(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const assistantId = String(formData.get("assistant_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  const sourceType = String(formData.get("source_type") ?? "text");

  if (!title) return { ok: false, error: "Give this entry a title." };
  if (!KNOWLEDGE_SOURCE_TYPES.includes(sourceType as KnowledgeSourceType)) {
    return { ok: false, error: "Unknown knowledge source type." };
  }
  if (!content) {
    return {
      ok: false,
      error:
        sourceType === "url"
          ? "Paste the text from that page. The assistant reads what is stored here, it does not browse."
          : "This entry has no content for the assistant to read.",
    };
  }
  if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) {
    return { ok: false, error: "The source link must start with http:// or https://" };
  }

  const supabase = await createClient();
  const existingId = String(formData.get("id") ?? "").trim();

  const row = {
    title,
    content,
    source_type: sourceType as KnowledgeSourceType,
    source_url: sourceUrl || null,
    // Scoped to one assistant when opened from its editor, org-wide when
    // added from the shared list.
    assistant_id: assistantId || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = existingId
    ? await supabase
        .from("assistant_knowledge")
        .update(row)
        .eq("id", existingId)
        .eq("org_id", orgId)
    : await supabase.from("assistant_knowledge").insert({ org_id: orgId, ...row });

  if (error) return { ok: false, error: error.message };
  if (assistantId) revalidatePath(`/ai-assistant/${assistantId}`);
  revalidatePath("/ai-assistant");
  return { ok: true, message: existingId ? "Entry updated." : "Added to the knowledge base." };
}

export async function toggleKnowledgeEntry(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const isActive = String(formData.get("is_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("assistant_knowledge")
    .update({ is_active: !isActive, updated_at: new Date().toISOString() })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/ai-assistant/${String(formData.get("assistant_id") ?? "")}`);
  return { ok: true };
}

export async function deleteKnowledgeEntry(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const supabase = await createClient();
  const { error } = await supabase
    .from("assistant_knowledge")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/ai-assistant/${String(formData.get("assistant_id") ?? "")}`);
  return { ok: true, message: "Entry removed." };
}

// ---------------------------------------------------------------- Chatbot

export async function saveChatbotFlow(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const triggerType = String(formData.get("trigger_type") ?? "keyword");
  const triggerValue = String(formData.get("trigger_value") ?? "").trim() || null;
  const reply = String(formData.get("reply") ?? "").trim();
  const buttonsRaw = String(formData.get("buttons") ?? "").trim();

  if (!name) return { ok: false, error: "Bot name is required." };
  if (triggerType === "keyword" && !triggerValue) {
    return { ok: false, error: "A keyword is required for keyword triggers." };
  }

  // The quick form produces a real two-node graph rather than its own
  // shape, so opening it in the builder afterwards needs no conversion:
  // a trigger wired to one reply.
  const buttons = buttonsRaw
    ? buttonsRaw
        .split(",")
        .map((b) => b.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((title, index) => ({ id: `btn_${index}`, title }))
    : [];

  const stamp = Date.now().toString(36);
  const triggerId = `on_message_${stamp}`;
  const replyId = `send_${stamp}`;

  const nodes: FlowNode[] = [
    {
      id: triggerId,
      kind: "on_message",
      position: { x: 120, y: 180 },
      data: {
        keywords: triggerValue ? [triggerValue] : [],
        fuzzy: false,
        sensitivity: 80,
      },
    },
    {
      id: replyId,
      kind: buttons.length ? "send_buttons" : "send_text",
      position: { x: 470, y: 180 },
      data: buttons.length
        ? { body: reply || "Hi! How can we help?", footer: "", buttons }
        : { body: reply || "Hi! How can we help?" },
    },
  ];

  const edges: FlowEdge[] = [
    { id: `e_${stamp}`, source: triggerId, target: replyId, sourceHandle: null },
  ];

  const supabase = await createClient();
  const { error } = await supabase.from("chatbot_flows").insert({
    org_id: orgId,
    name,
    trigger_type: triggerType as "keyword" | "welcome" | "fallback" | "menu" | "business_hours",
    trigger_value: triggerValue,
    nodes,
    edges,
    entry_node_id: triggerId,
    is_active: false,
  });

  if (error) {
    // The partial unique index on active triggers surfaces here.
    if (error.code === "23505") {
      return { ok: false, error: "Another active bot already uses that trigger." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/chatbot");
  return { ok: true, message: "Bot created. Activate it when you're ready." };
}

export async function toggleChatbotFlow(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const isActive = String(formData.get("is_active") ?? "") === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("chatbot_flows")
    .update({ is_active: !isActive })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Another active bot already uses that trigger." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/chatbot");
  return { ok: true };
}

export async function deleteChatbotFlow(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("chatbot_flows")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/chatbot");
  return { ok: true, message: "Bot deleted." };
}

// ---------------------------------------------------------------- FAQ

export async function saveFaqEntry(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const question = String(formData.get("question") ?? "").trim();
  const answer = String(formData.get("answer") ?? "").trim();
  const keywords = String(formData.get("keywords") ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const category = String(formData.get("category") ?? "").trim() || null;

  if (!question || !answer) return { ok: false, error: "Question and answer are both required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("faq_entries")
    .insert({ org_id: orgId, question, answer, keywords, category });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/faq-bot");
  return { ok: true, message: "FAQ added." };
}

export async function deleteFaqEntry(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("faq_entries")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/faq-bot");
  return { ok: true, message: "FAQ deleted." };
}

// ---------------------------------------------------------------- Reminders

export async function saveReminder(formData: FormData): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const contactId = String(formData.get("contact_id") ?? "") || null;
  const remindAt = String(formData.get("remind_at") ?? "").trim();

  if (!title) return { ok: false, error: "Title is required." };
  if (!remindAt) return { ok: false, error: "Pick a date and time." };

  const when = new Date(remindAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "That date could not be read." };

  const supabase = await createClient();
  const { error } = await supabase.from("reminders").insert({
    org_id: orgId,
    contact_id: contactId,
    created_by: user.id,
    title,
    body,
    remind_at: when.toISOString(),
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/reminders");
  return { ok: true, message: "Reminder scheduled." };
}

export async function cancelReminder(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .update({ status: "cancelled" })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/reminders");
  return { ok: true, message: "Reminder cancelled." };
}

// ---------------------------------------------------------------- Integrations

export async function connectIntegration(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: "Only owners and admins can manage integrations." };

  const slug = String(formData.get("provider") ?? "");
  const def = integrationBySlug(slug);
  if (!def) return { ok: false, error: "Unknown integration." };

  const credentials: Record<string, string> = {};
  const config: Record<string, string> = {};

  for (const field of def.fields) {
    const value = String(formData.get(field.name) ?? "").trim();
    if (field.required && !value) {
      return { ok: false, error: `${field.label} is required.` };
    }
    if (!value) continue;
    // Anything secret is encrypted; non-secret settings such as a shop
    // domain stay queryable in config.
    if (field.type === "password") credentials[field.name] = value;
    else config[field.name] = value;
  }

  let encrypted: string | null = null;
  if (Object.keys(credentials).length > 0) {
    try {
      encrypted = encryptToken(JSON.stringify(credentials));
    } catch (err) {
      return {
        ok: false,
        error: `Can't store credentials securely — ${
          err instanceof Error ? err.message : "encryption failed"
        } Add it in Vercel → Settings → Environment Variables, then redeploy.`,
      };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("org_integrations").upsert(
    {
      org_id: ctx.orgId,
      provider: slug,
      status: "connected",
      credentials_encrypted: encrypted,
      config,
      last_error: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,provider" }
  );

  if (error) return { ok: false, error: error.message };

  // A webhook-based provider is only genuinely connected once the delivery
  // target exists, so create it in the same step.
  if (def.capability === "via_webhook" && config.target_url) {
    await supabase.from("outgoing_webhooks").upsert(
      {
        org_id: ctx.orgId,
        name: def.name,
        target_url: config.target_url,
        events: ["message.received", "message.status", "contact.created"],
        secret: randomBytes(24).toString("base64url"),
        is_active: true,
      },
      { onConflict: "id", ignoreDuplicates: false }
    );
  }

  revalidatePath("/integrations");
  return { ok: true, message: `${def.name} connected.` };
}

export async function disconnectIntegration(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: "Only owners and admins can manage integrations." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_integrations")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("provider", String(formData.get("provider") ?? ""));

  if (error) return { ok: false, error: error.message };
  revalidatePath("/integrations");
  return { ok: true, message: "Disconnected." };
}

// ---------------------------------------------------------------- API keys

export async function createApiKey(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: "Only owners and admins can create API keys." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give the key a name so you can identify it later." };

  // Only the hash is stored. The plaintext is returned once, here, and can
  // never be recovered afterwards.
  const secret = randomBytes(24).toString("base64url");
  const key = `nc_live_${secret}`;
  const hash = createHash("sha256").update(key).digest("hex");

  const supabase = await createClient();
  const { error } = await supabase.from("api_keys").insert({
    org_id: ctx.orgId,
    name,
    key_prefix: key.slice(0, 12),
    key_hash: hash,
    created_by: ctx.user.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/api-endpoints");
  return { ok: true, message: `Copy this now — it is shown only once:  ${key}` };
}

export async function revokeApiKey(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: "Only owners and admins can revoke API keys." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/api-endpoints");
  return { ok: true, message: "Key revoked." };
}

// ---------------------------------------------------------------- Webhooks

export async function createWebhook(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: "Only owners and admins can manage webhooks." };

  const name = String(formData.get("name") ?? "").trim();
  const targetUrl = String(formData.get("target_url") ?? "").trim();

  if (!name) return { ok: false, error: "Name is required." };
  if (!/^https:\/\//i.test(targetUrl)) {
    return { ok: false, error: "The target URL must start with https://" };
  }

  const events = ["message.received", "message.status", "contact.created"].filter(
    (e) => formData.get(e) === "on"
  );

  const supabase = await createClient();
  const { error } = await supabase.from("outgoing_webhooks").insert({
    org_id: ctx.orgId,
    name,
    target_url: targetUrl,
    events: events.length ? events : ["message.received"],
    secret: randomBytes(24).toString("base64url"),
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/integrations");
  return { ok: true, message: "Webhook created." };
}

export async function deleteWebhook(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: "Only owners and admins can manage webhooks." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("outgoing_webhooks")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", ctx.orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/integrations");
  return { ok: true, message: "Webhook deleted." };
}

// ---------------------------------------------------------------- Commerce / Gallery

export async function saveProduct(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim() || null;
  const priceRupees = Number(formData.get("price") ?? 0);
  const stockRaw = formData.get("stock");
  const imageUrl = String(formData.get("image_url") ?? "").trim() || null;

  if (!name) return { ok: false, error: "Product name is required." };
  if (!Number.isFinite(priceRupees) || priceRupees < 0) {
    return { ok: false, error: "Price must be a positive number." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    org_id: orgId,
    name,
    sku,
    price_cents: Math.round(priceRupees * 100),
    stock: stockRaw ? Number(stockRaw) : null,
    image_url: imageUrl,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, error: "That SKU already exists." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/commerce");
  return { ok: true, message: "Product added." };
}

export async function deleteProduct(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", String(formData.get("id") ?? ""))
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/commerce");
  return { ok: true, message: "Product deleted." };
}

export async function saveMediaAsset(formData: FormData): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const mediaType = String(formData.get("media_type") ?? "image");

  if (!name) return { ok: false, error: "Name is required." };
  if (!/^https:\/\//i.test(url)) return { ok: false, error: "The URL must start with https://" };

  const supabase = await createClient();
  const { error } = await supabase.from("media_assets").insert({
    org_id: orgId,
    name,
    url,
    media_type: mediaType as "image" | "video" | "document" | "audio",
    uploaded_by: user.id,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/gallery");
  return { ok: true, message: "Media added." };
}

export async function deleteMediaAsset(formData: FormData): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");

  // Read the object key before deleting the row — afterwards there is
  // nothing left to tell us which file to remove.
  const { data: asset } = await supabase
    .from("media_assets")
    .select("storage_path")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  const { error } = await supabase
    .from("media_assets")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  // Only files we uploaded. An asset added by pasting someone else's URL has
  // no storage_path and nothing of ours to clean up.
  if (asset?.storage_path) {
    const { error: storageError } = await supabase.storage
      .from("media")
      .remove([asset.storage_path]);
    // The row is already gone, so a failure here leaks a file rather than
    // breaking the delete. Worth logging, not worth failing.
    if (storageError) console.error("Deleted media row but not its file", storageError);
  }

  revalidatePath("/gallery");
  return { ok: true, message: "Media deleted." };
}

/**
 * Records a file the browser has already uploaded to the media bucket.
 *
 * The upload itself does not come through here: Vercel caps a serverless
 * request body at 4.5 MB, which is smaller than a phone photo, so the client
 * puts the file in storage directly and then calls this to make it visible.
 */
export async function recordUploadedMedia(input: {
  name: string;
  url: string;
  storagePath: string;
  mediaType: "image" | "video" | "document" | "audio";
  mimeType: string | null;
  sizeBytes: number | null;
}): Promise<ActionResult> {
  const { orgId, user } = await requireOrg();

  const name = input.name.trim();
  if (!name) return { ok: false, error: "The file needs a name." };

  // The client chose this path, so check it belongs to the caller's org
  // rather than trusting it. Storage RLS enforces the same rule, but a row
  // pointing at another tenant's object would still be wrong.
  if (!input.storagePath.startsWith(`${orgId}/`)) {
    return { ok: false, error: "That file does not belong to this workspace." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("media_assets").insert({
    org_id: orgId,
    name,
    url: input.url,
    storage_path: input.storagePath,
    media_type: input.mediaType,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    uploaded_by: user.id,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/gallery");
  return { ok: true, message: `Uploaded ${name}.` };
}

/**
 * Deletes several assets at once, for the gallery's multi-select.
 */
export async function deleteMediaAssets(ids: string[]): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };

  const supabase = await createClient();

  const { data: assets } = await supabase
    .from("media_assets")
    .select("storage_path")
    .in("id", ids)
    .eq("org_id", orgId);

  const { error } = await supabase
    .from("media_assets")
    .delete()
    .in("id", ids)
    .eq("org_id", orgId);

  if (error) return { ok: false, error: error.message };

  const paths = (assets ?? [])
    .map((a) => a.storage_path)
    .filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from("media").remove(paths);
    if (storageError) console.error("Deleted media rows but not their files", storageError);
  }

  revalidatePath("/gallery");
  return { ok: true, message: `Deleted ${ids.length} item${ids.length === 1 ? "" : "s"}.` };
}

export async function saveFlowGraph(input: {
  id: string;
  name: string;
  isActive: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
}): Promise<ActionResult> {
  const ctx = await requireOrg();

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Bot name is required." };

  // The entry node is stored rather than inferred: a graph can have several
  // trigger nodes while the canvas is being reorganised, and the runtime
  // needs one answer.
  const entry = input.nodes.find((n) => n.kind === "on_message") ?? input.nodes[0];

  const supabase = await createClient();
  const { error } = await supabase
    .from("chatbot_flows")
    .update({
      name,
      is_active: input.isActive,
      nodes: input.nodes,
      edges: input.edges,
      entry_node_id: entry?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("org_id", ctx.orgId);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Another active bot already uses that trigger." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/chatbot");
  revalidatePath(`/chatbot/${input.id}`);
  return {
    ok: true,
    message: input.isActive ? "Saved and active." : "Saved as draft.",
  };
}

/**
 * Builds a whole bot from a plain-language description.
 *
 * Saved as a draft, always: a generated flow is a first draft with real
 * message copy in it, and nobody should discover what it says by having a
 * customer receive it.
 */
export async function generateFlowFromPrompt(
  description: string
): Promise<ActionResult & { id?: string; warnings?: string[] }> {
  const ctx = await requireOrg();
  const supabase = await createClient();

  // Generate on the org's own assistant where they have one configured, so
  // this runs on their key and their provider rather than the platform's.
  const { data: assistant } = await supabase
    .from("ai_assistants")
    .select("provider, model, api_key_encrypted, api_base_url")
    .eq("org_id", ctx.orgId)
    .not("api_key_encrypted", "is", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const result = await generateFlow(
    description,
    assistant
      ? {
          ...assistant,
          // Their assistant's creativity and reply length are tuned for chat
          // replies; a flow needs structure and room.
          temperature: PLATFORM_FLOW_MODEL.temperature,
          max_tokens: PLATFORM_FLOW_MODEL.max_tokens,
        }
      : PLATFORM_FLOW_MODEL
  );

  if (!result.ok) return { ok: false, error: result.error };

  const entryNodeId =
    result.graph.nodes.find((node) => node.kind === "on_message")?.id ??
    result.graph.nodes[0]?.id ??
    null;

  const { data, error } = await supabase
    .from("chatbot_flows")
    .insert({
      org_id: ctx.orgId,
      name: result.name,
      trigger_type: "keyword",
      nodes: result.graph.nodes,
      edges: result.graph.edges,
      entry_node_id: entryNodeId,
      is_active: false,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/chatbot");
  return { ok: true, id: data.id, warnings: result.warnings, message: "Bot built." };
}

export async function createFlow(): Promise<ActionResult & { id?: string }> {
  const ctx = await requireOrg();
  const supabase = await createClient();

  // A new bot opens with a trigger already placed. An empty canvas gives no
  // hint that a flow must start from one.
  const triggerId = `on_message_${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from("chatbot_flows")
    .insert({
      org_id: ctx.orgId,
      name: "Untitled bot",
      trigger_type: "keyword",
      nodes: [
        {
          id: triggerId,
          kind: "on_message",
          position: { x: 120, y: 180 },
          data: { keywords: [], fuzzy: false, sensitivity: 80 },
        },
      ],
      edges: [],
      entry_node_id: triggerId,
      is_active: false,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/chatbot");
  return { ok: true, id: data.id, message: "Bot created." };
}

/**
 * A working example flow, not an empty canvas.
 *
 * The fastest way to understand what the builder can do is to open something
 * that already runs: a keyword trigger, a button message, and a branch per
 * button — including a handoff, which is the outlet people most often forget
 * to wire and then wonder why "talk to a human" does nothing.
 */
export async function createStarterFlow(): Promise<ActionResult & { id?: string }> {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const stamp = Date.now().toString(36);
  const trigger = `on_message_${stamp}`;
  const greet = `send_buttons_${stamp}`;
  const services = `send_text_${stamp}`;
  const human = `handoff_${stamp}`;
  const bye = `send_text_bye_${stamp}`;

  const buttons = [
    { id: `btn_more_${stamp}`, title: "Tell me more" },
    { id: `btn_human_${stamp}`, title: "Talk to a human" },
    { id: `btn_no_${stamp}`, title: "Not now" },
  ];

  const nodes: FlowNode[] = [
    {
      id: trigger,
      kind: "on_message",
      position: { x: 80, y: 220 },
      data: { keywords: ["hi", "hey", "hello"], fuzzy: true, sensitivity: 80 },
    },
    {
      id: greet,
      kind: "send_buttons",
      position: { x: 420, y: 180 },
      data: {
        body: "Hi! Thanks for getting in touch. What can I help you with?",
        footer: "",
        buttons,
      },
    },
    {
      id: services,
      kind: "send_text",
      position: { x: 820, y: 60 },
      data: { body: "Here is what we do — tell me which part interests you and I'll go deeper." },
    },
    {
      id: human,
      kind: "handoff",
      position: { x: 820, y: 240 },
      data: { body: "Of course — putting you through to the team now." },
    },
    {
      id: bye,
      kind: "send_text",
      position: { x: 820, y: 400 },
      data: { body: "No problem. Message us any time." },
    },
  ];

  const edges: FlowEdge[] = [
    { id: `e_trigger_${stamp}`, source: trigger, target: greet, sourceHandle: null },
    { id: `e_more_${stamp}`, source: greet, target: services, sourceHandle: buttons[0].id },
    { id: `e_human_${stamp}`, source: greet, target: human, sourceHandle: buttons[1].id },
    { id: `e_no_${stamp}`, source: greet, target: bye, sourceHandle: buttons[2].id },
  ];

  const { data, error } = await supabase
    .from("chatbot_flows")
    .insert({
      org_id: ctx.orgId,
      name: "Example bot",
      trigger_type: "keyword",
      nodes,
      edges,
      entry_node_id: trigger,
      // Draft on purpose: dropping an example bot into live traffic without
      // the owner reading it first is not a favour.
      is_active: false,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/chatbot");
  return { ok: true, id: data.id, message: "Example bot created as a draft. Open it and read it before publishing." };
}

/**
 * Recreates a flow from the JSON that the row menu exports.
 *
 * Deliberately strict about shape but forgiving about extras: a file from a
 * later version of the builder should still import, minus anything this
 * version does not understand.
 */
export async function importFlow(raw: string): Promise<ActionResult & { id?: string }> {
  const ctx = await requireOrg();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That is not valid JSON. Export a bot first to see the expected shape." };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "That file does not describe a bot." };
  }

  const source = parsed as { name?: unknown; nodes?: unknown; edges?: unknown };
  const nodes = Array.isArray(source.nodes) ? (source.nodes as FlowNode[]) : null;
  if (!nodes || nodes.length === 0) {
    return { ok: false, error: "That file has no nodes, so there is nothing to import." };
  }

  const known = new Set(NODE_DEFS.map((d) => d.kind));
  const unknown = nodes.find((n) => !n || typeof n !== "object" || !known.has(n.kind));
  if (unknown) {
    return {
      ok: false,
      error: `This file contains a node type this version does not know${
        unknown.kind ? ` ("${unknown.kind}")` : ""
      }.`,
    };
  }

  const edges = Array.isArray(source.edges) ? (source.edges as FlowEdge[]) : [];
  const entry = nodes.find((n) => n.kind === "on_message") ?? nodes[0];
  const name = typeof source.name === "string" && source.name.trim() ? source.name.trim() : "Imported bot";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chatbot_flows")
    .insert({
      org_id: ctx.orgId,
      name,
      trigger_type: "keyword",
      nodes,
      edges,
      entry_node_id: entry?.id ?? null,
      // Never import straight into live traffic.
      is_active: false,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/chatbot");
  return { ok: true, id: data.id, message: `Imported "${name}" as a draft.` };
}
