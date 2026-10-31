import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/crypto";
import { sendDirectMessage } from "@/lib/instagram-api";
import { emailIn, mentions, withinMessagingWindow, type DirectMessage } from "@/lib/instagram";
import {
  asLoadedRule,
  bump,
  rememberPending,
  RULE_COLUMNS,
  sendEmailPrompt,
  sendFollowGate,
  sendRuleMessage,
} from "@/lib/instagram-deliver";
import { planReply, type RunnerResources } from "@/lib/reply-matcher";
import { generateAssistantReply, type AssistantTurn } from "@/lib/ai-assistant";
import type { AiAssistant, AssistantKnowledge, ChatbotFlow, FaqEntry } from "@/types/portal";
import type { AutomationFlow } from "@/lib/reply-matcher";

// Somebody sends a direct message, and the same bots answer it.
//
// Deliberately a separate runner from the WhatsApp one rather than a
// channel flag threaded through it. Most of that runner is WhatsApp's
// shape — interactive lists, button payloads, approved templates, the
// form sender, the 24-hour *template* escape hatch — and Instagram has
// none of them. Bending it to cover a channel with a plain text box
// would make the common path carry conditionals for the rare one.
//
// What is shared is the part worth sharing: `planReply` decides what to
// say, identically for both channels, so a workspace's FAQ and chatbots
// answer the same way whichever door the question came through.

const TEXT_LIMIT = 1000;
const HISTORY_LIMIT = 20;
const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function handleDirectMessage(
  connection: {
    id: string;
    org_id: string;
    ig_user_id: string;
    access_token_encrypted: string;
  },
  message: DirectMessage
): Promise<void> {
  // The account's own outgoing message, echoed back. Parsing drops these,
  // but a sender id equal to the account is the same thing by another
  // route and answering it is a conversation with yourself.
  if (message.fromId === connection.ig_user_id) return;

  const admin = createAdminClient();
  const orgId = connection.org_id;

  const contact = await upsertContact(admin, orgId, message.fromId);
  if (!contact) return;

  const conversation = await upsertConversation(admin, orgId, contact.id, connection.id);
  if (!conversation) return;

  // Claim it. Instagram redelivers whenever it does not get a prompt 200,
  // and the unique index on wa_message_id turns the second delivery into
  // a conflict here rather than a second reply to the customer.
  const { error: claimError } = await admin.from("messages").insert({
    conversation_id: conversation.id,
    org_id: orgId,
    channel: "instagram",
    direction: "inbound",
    type: "text",
    content: { text: message.text },
    wa_message_id: message.messageId,
    status: "delivered",
  });

  if (claimError) {
    if (claimError.code !== POSTGRES_UNIQUE_VIOLATION) {
      console.error("Could not store an Instagram direct message", claimError);
    }
    return;
  }

  const receivedAt = message.at ?? new Date().toISOString();
  await admin
    .from("conversations")
    .update({ last_inbound_at: receivedAt, last_message_at: receivedAt })
    .eq("id", conversation.id);

  // An email address the automation asked for. Caught before anything
  // else answers, because "sure, it's me@example.com" would otherwise
  // fall through to the FAQ and get a shrug.
  const address = emailIn(message.text);
  if (address) {
    await admin.from("contacts").update({ email: address }).eq("id", contact.id);
    await countEmailFor(admin, orgId, message.fromId);
  }

  if (!conversation.bot_enabled) return;

  // Checked before composing anything. Outside the window Instagram
  // refuses the send, and there is no template fallback as there is on
  // WhatsApp — so the only honest outcome is to leave it for a human,
  // which is what the inbox is for.
  if (!withinMessagingWindow(receivedAt)) return;

  // A keyword automation written for direct messages. Checked before
  // the chatbots so an automation the person built on purpose beats a
  // generic FAQ hit on the same word.
  if (await runDirectAutomation(admin, connection, message, orgId)) return;

  const resources = await loadResources(admin, orgId, conversation.id, {
    flowId: conversation.bot_flow_id,
    nodeId: conversation.bot_node_id,
  });
  const plan = planReply({ text: message.text, buttonId: null }, resources);

  let body: string | null = null;

  if (plan.kind === "assistant") {
    const assistant = resources.assistants.find((row) => row.id === plan.id);
    if (!assistant) return;

    const history = await loadHistory(admin, conversation.id);
    const reply = await generateAssistantReply({
      assistant,
      orgName: resources.orgName,
      contactName: contact.name,
      history,
      knowledge: resources.knowledge,
    });
    if (reply.status !== "replied") return;
    body = reply.text;
  } else if (plan.kind === "none") {
    return;
  } else {
    // A chatbot step may carry buttons. Instagram's API has no quick
    // replies on this endpoint, so the choices go into the text as a
    // numbered list — otherwise the message asks a question whose
    // answers are invisible.
    body = "buttons" in plan && plan.buttons.length > 0
      ? `${plan.body}\n\n${plan.buttons.map((label, index) => `${index + 1}. ${label}`).join("\n")}`
      : plan.body;
  }

  if (!body?.trim()) return;
  const text = body.slice(0, TEXT_LIMIT);

  const outcome = await sendDirectMessage({
    igUserId: connection.ig_user_id,
    recipientId: message.fromId,
    text,
    token: decryptToken(connection.access_token_encrypted),
  });

  await admin.from("messages").insert({
    conversation_id: conversation.id,
    org_id: orgId,
    channel: "instagram",
    direction: "outbound",
    type: "text",
    content: { text, source: plan.kind },
    status: outcome.ok ? "sent" : "failed",
  });

  if (!outcome.ok) {
    console.error(`Instagram direct message failed: ${outcome.error}`);
    return;
  }

  // Where the flow got to. Read back by the next message's
  // loadResources; without writing it, a resumable flow would answer its
  // first question forever.
  const moved =
    plan.kind === "flow_step" || plan.kind === "chatbot"
      ? { bot_flow_id: plan.nextNodeId ? plan.flowId : null, bot_node_id: plan.nextNodeId }
      : {};

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), ...moved })
    .eq("id", conversation.id);
}

/**
 * The person who sent the message, as a contact.
 *
 * Instagram-scoped user ids are not phone numbers, so `wa_id` carries a
 * prefixed form of the id. The column is not null and unique per
 * workspace, and a prefix keeps an Instagram contact from ever colliding
 * with a real number — a bare numeric id could.
 */
async function upsertContact(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  igUserId: string
): Promise<{ id: string; name: string | null } | null> {
  const { data: existing } = await admin
    .from("contacts")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("ig_user_id", igUserId)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await admin
    .from("contacts")
    .insert({ org_id: orgId, wa_id: `ig:${igUserId}`, ig_user_id: igUserId })
    .select("id, name")
    .maybeSingle();

  if (error) {
    // Two deliveries at once. The row the other one wrote is the answer.
    if (error.code === POSTGRES_UNIQUE_VIOLATION) {
      const { data: raced } = await admin
        .from("contacts")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("ig_user_id", igUserId)
        .maybeSingle();
      return raced ?? null;
    }
    console.error("Could not create an Instagram contact", error);
    return null;
  }
  return created ?? null;
}

async function upsertConversation(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  contactId: string,
  connectionId: string
): Promise<{
  id: string;
  bot_enabled: boolean;
  bot_flow_id: string | null;
  bot_node_id: string | null;
} | null> {
  const { data: existing } = await admin
    .from("conversations")
    .select("id, bot_enabled, bot_flow_id, bot_node_id")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .eq("channel", "instagram")
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await admin
    .from("conversations")
    .insert({
      org_id: orgId,
      contact_id: contactId,
      channel: "instagram",
      instagram_connection_id: connectionId,
      status: "open",
    })
    .select("id, bot_enabled, bot_flow_id, bot_node_id")
    .maybeSingle();

  if (error) {
    console.error("Could not open an Instagram conversation", error);
    return null;
  }
  return created ?? null;
}

async function loadResources(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  conversationId: string,
  active: { flowId: string | null; nodeId: string | null }
): Promise<RunnerResources & { orgName: string; knowledge: AssistantKnowledge[] }> {
  // Only unpinned bots answer here.
  //
  // `connection_id` on these tables is a *WhatsApp number*. A bot pinned
  // to one is about that number — a workspace running two businesses
  // under one account pins each business's FAQ to its own line, and
  // letting a pinned bot answer Instagram would cross them. A null means
  // "any channel", which is what every bot created before Instagram
  // existed means, so nothing a customer already built goes quiet.
  const [flows, faqs, automations, assistants, knowledge, org, inboundCount] = await Promise.all([
    admin
      .from("chatbot_flows")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .is("connection_id", null),
    admin
      .from("faq_entries")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .is("connection_id", null),
    admin
      .from("automation_flows")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .is("connection_id", null),
    admin
      .from("ai_assistants")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .is("connection_id", null)
      .order("created_at"),
    admin
      .from("assistant_knowledge")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at"),
    admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound"),
  ]);

  const flowRows = (flows.data ?? []) as ChatbotFlow[];

  return {
    flows: flowRows,
    faqs: (faqs.data ?? []) as FaqEntry[],
    automations: (automations.data ?? []) as AutomationFlow[],
    assistants: (assistants.data ?? []) as AiAssistant[],
    knowledge: (knowledge.data ?? []) as AssistantKnowledge[],
    // The message that triggered this run is already stored, so a first
    // message means exactly one inbound row exists.
    isFirstMessage: (inboundCount.count ?? 0) <= 1,
    // Without these a multi-step chatbot restarts from its first
    // question on every message, which reads as the bot not listening.
    activeFlow: active.flowId
      ? (flowRows.find((flow) => flow.id === active.flowId) ?? null)
      : null,
    activeNodeId: active.nodeId,
    orgName: org.data?.name ?? "the business",
  };
}

async function loadHistory(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string
): Promise<AssistantTurn[]> {
  const { data } = await admin
    .from("messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  return (data ?? [])
    .reverse()
    .map((row) => ({
      role: row.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      text: typeof row.content?.text === "string" ? row.content.text : "",
    }))
    .filter((turn) => turn.text.trim());
}


/**
 * A DM-triggered automation, if one matches.
 *
 * Returns true when it handled the message, so the chatbots do not then
 * answer the same message a second time.
 */
async function runDirectAutomation(
  admin: ReturnType<typeof createAdminClient>,
  connection: { id: string; org_id: string; ig_user_id: string; access_token_encrypted: string },
  message: DirectMessage,
  orgId: string
): Promise<boolean> {
  const { data: rows } = await admin
    .from("instagram_comment_rules")
    .select(RULE_COLUMNS)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .eq("trigger_type", "dm")
    .or(`connection_id.is.null,connection_id.eq.${connection.id}`);

  const match = (rows ?? []).find((row) => {
    const keywords = row.keywords ?? [];
    return keywords.length === 0 || keywords.some((word) => mentions(message.text, word));
  });
  if (!match) return false;

  const rule = asLoadedRule(match as Parameters<typeof asLoadedRule>[0]);
  const token = decryptToken(connection.access_token_encrypted);
  await bump(admin, rule.id, "run_count");

  const outcome = rule.followGate
    ? await sendFollowGate({ connection, rule, recipient: { id: message.fromId }, token })
    : await sendRuleMessage({ connection, rule, recipient: { id: message.fromId }, token });

  await admin.from("instagram_comment_events").insert({
    org_id: orgId,
    connection_id: connection.id,
    rule_id: rule.id,
    kind: "dm",
    ig_user_id: message.fromId,
    comment_text: message.text.slice(0, 2000),
    outcome: outcome.ok ? "sent" : "failed",
    error: outcome.ok ? null : outcome.error,
  });

  if (!outcome.ok) return true;

  await bump(admin, rule.id, "sent_count");
  if (rule.followGate) {
    await rememberPending(admin, {
      orgId,
      connectionId: connection.id,
      ruleId: rule.id,
      igUserId: message.fromId,
    });
  } else {
    await sendEmailPrompt({ connection, rule, personId: message.fromId, token });
  }
  return true;
}

/**
 * Credits the automation that asked for the address.
 *
 * The person is answering a prompt sent some time ago, and the only
 * link back to which automation asked is the log — so the most recent
 * one that sent them something is the one that gets the count.
 */
async function countEmailFor(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  igUserId: string
): Promise<void> {
  const { data } = await admin
    .from("instagram_comment_events")
    .select("rule_id")
    .eq("org_id", orgId)
    .eq("ig_user_id", igUserId)
    .eq("outcome", "sent")
    .not("rule_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.rule_id) await bump(admin, data.rule_id, "email_count");
}
