import "server-only";
import type { AiAssistant, AssistantKnowledge, ChatbotFlow, FaqEntry } from "@/types/portal";
import { generateAssistantReply, type AssistantTurn } from "@/lib/ai-assistant";
import { dispatchWebhookEvent } from "@/lib/outgoing-webhooks";
import {
  loadOrgConnection,
  sendAndLogText,
  type RunnerClient,
} from "@/lib/whatsapp-send";
import {
  extractInboundText,
  planReply,
  type AutomationFlow,
  type ReplyPlan,
  type RunnerResources,
} from "@/lib/reply-matcher";
import { graphOf, findNode } from "@/lib/flow-engine";
import { flowEntryFor, resumeFrom, runFlow, type FlowContext } from "@/lib/flow-runner";
import { sendTextMessage } from "@/lib/meta-whatsapp";

// The execution half of the message runner. `reply-matcher.ts` decides what
// to say; this decides whether to say it at all, sends it, moves the
// conversation's bot state along, and writes the audit row.

const HISTORY_LIMIT = 20;
const POSTGRES_UNIQUE_VIOLATION = "23505";

export interface InboundEvent {
  supabase: RunnerClient;
  orgId: string;
  conversationId: string;
  contactId: string;
  contactWaId: string;
  contactName: string | null;
  waMessageId: string | null;
  messageType: string;
  content: Record<string, unknown>;
}

/**
 * Runs the bot pipeline for one inbound message.
 *
 * Never throws. Every exit path writes a bot_runs row, so the Automations
 * log can answer "why did nothing happen?" as well as "why did it say
 * that?".
 */
export async function runInboundMessage(event: InboundEvent): Promise<void> {
  const startedAt = Date.now();
  const { supabase, orgId } = event;
  const { text, buttonId } = extractInboundText(event.messageType, event.content);

  // Claim this message before doing any work. Meta redelivers a webhook
  // whenever it does not get a prompt 200, and the unique index on
  // inbound_wa_message_id turns the second attempt into a conflict here
  // rather than a duplicate reply to the customer.
  const { data: run, error: claimError } = await supabase
    .from("bot_runs")
    .insert({
      org_id: orgId,
      conversation_id: event.conversationId,
      contact_id: event.contactId,
      inbound_wa_message_id: event.waMessageId,
      inbound_text: text || null,
      outcome: "skipped",
      matched_kind: "none",
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === POSTGRES_UNIQUE_VIOLATION) return; // already handled
    console.error("Failed to open a bot run", claimError);
    return;
  }

  const finish = async (update: {
    matched_kind?: ReplyPlan["kind"];
    matched_id?: string | null;
    matched_label?: string | null;
    node_id?: string | null;
    node_kind?: string | null;
    reply_text?: string | null;
    outcome: "replied" | "skipped" | "handoff" | "failed";
    error?: string | null;
  }) => {
    const { error } = await supabase
      .from("bot_runs")
      .update({ ...update, duration_ms: Date.now() - startedAt })
      .eq("id", run.id);
    if (error) console.error("Failed to close the bot run", error);
  };

  try {
    const conversation = await loadConversation(supabase, event.conversationId);
    if (!conversation) {
      await finish({ outcome: "failed", error: "Conversation disappeared mid-run" });
      return;
    }

    if (!conversation.bot_enabled) {
      await finish({
        outcome: "skipped",
        matched_label: "Automated replies are off on this conversation",
      });
      return;
    }

    const resources = await loadResources(supabase, event, conversation);

    // Graph flows come first. A conversation parked mid-flow must continue
    // from where it stopped rather than being re-matched from scratch, and a
    // flow with a trigger node owns its own matching — planReply knows
    // nothing about either.
    const connectionForFlow = await loadOrgConnection(supabase, orgId, { conversationId: event.conversationId });
    if (connectionForFlow) {
      const flowResult = await tryGraphFlow({
        supabase,
        event,
        conversation,
        resources,
        connection: connectionForFlow,
        text,
        buttonId,
      });

      if (flowResult) {
        await finish({
          matched_kind: "chatbot",
          matched_id: flowResult.flowId,
          matched_label: flowResult.label,
          node_id: flowResult.nodeId,
          node_kind: flowResult.nodeKind,
          reply_text: flowResult.reply,
          outcome: flowResult.outcome,
          error: flowResult.error,
        });
        return;
      }
    }

    const plan = planReply({ text, buttonId }, resources);

    if (plan.kind === "none") {
      await finish({ outcome: "skipped", matched_label: "Nothing matched" });
      // Nothing matched, so nothing is parked — clear any stale flow state
      // rather than leaving the conversation pinned to an old node.
      await clearFlowState(supabase, event.conversationId, conversation);
      return;
    }

    const connection = await loadOrgConnection(supabase, orgId, { conversationId: event.conversationId });
    if (!connection) {
      await finish({
        matched_kind: plan.kind,
        matched_id: "id" in plan ? plan.id : null,
        matched_label: "label" in plan ? plan.label : null,
        outcome: "failed",
        error: "No active WhatsApp connection, or its access token could not be decrypted.",
      });
      return;
    }

    // The assistant is the one plan whose text does not exist yet.
    let body: string;
    if (plan.kind === "assistant") {
      const assistant = resources.assistants.find((candidate) => candidate.id === plan.id)!;
      const generated = await generateAssistantReply({
        assistant,
        orgName: resources.orgName,
        contactName: event.contactName,
        history: await loadHistory(supabase, event.conversationId),
        // Org-wide entries plus this assistant's own. generateAssistantReply
        // drops the lot when use_knowledge_base is off.
        knowledge: resources.knowledge.filter(
          (entry) => entry.assistant_id === null || entry.assistant_id === assistant.id
        ),
      });

      if (generated.status !== "replied") {
        // "skipped" is a rule doing its job — off duty, nothing to answer.
        // Logging it as failed would put a red row in front of the tenant
        // for behaviour they configured on purpose.
        await finish({
          matched_kind: "assistant",
          matched_id: assistant.id,
          matched_label: assistant.name,
          outcome: generated.status === "skipped" ? "skipped" : "failed",
          error: generated.status === "skipped" ? generated.reason : generated.error,
        });
        return;
      }
      body = generated.text;
    } else {
      body = plan.body;
    }

    const sent = await sendAndLogText({
      supabase,
      connection,
      conversationId: event.conversationId,
      toWaId: event.contactWaId,
      body,
      buttons:
        "buttons" in plan
          ? plan.buttons.map((label, index) => ({ id: `${plan.flowId}:${index}`, title: label }))
          : undefined,
      // We are answering a message that just arrived, so the 24-hour
      // service window is open by definition.
      skipWindowCheck: true,
    });

    if (!sent.ok) {
      await finish({
        matched_kind: plan.kind,
        matched_id: plan.id,
        matched_label: plan.label,
        reply_text: body,
        outcome: "failed",
        error: sent.error,
      });
      return;
    }

    await applySideEffects(supabase, event, plan, conversation);

    await finish({
      matched_kind: plan.kind,
      matched_id: plan.id,
      matched_label: plan.label,
      reply_text: body,
      outcome: plan.kind === "handoff" ? "handoff" : "replied",
    });
  } catch (error) {
    console.error("Message runner crashed", error);
    await finish({
      outcome: "failed",
      error: error instanceof Error ? error.message : "Unknown runner failure",
    });
  }
}


// --- graph flows -----------------------------------------------------------

interface GraphFlowResult {
  flowId: string;
  label: string;
  nodeId: string | null;
  nodeKind: string | null;
  reply: string | null;
  outcome: "replied" | "skipped" | "handoff" | "failed";
  error: string | null;
}

/**
 * Runs a visual flow if one applies. Returns null when none does, leaving
 * the message to the ordinary matcher.
 */
async function tryGraphFlow(args: {
  supabase: RunnerClient;
  event: InboundEvent;
  conversation: ConversationState;
  resources: RunnerResources & { orgName: string };
  connection: Awaited<ReturnType<typeof loadOrgConnection>>;
  text: string;
  buttonId: string | null;
}): Promise<GraphFlowResult | null> {
  const { supabase, event, conversation, resources, connection, text, buttonId } = args;
  if (!connection) return null;

  const context: FlowContext = {
    supabase,
    connection,
    orgId: event.orgId,
    conversationId: event.conversationId,
    contactId: event.contactId,
    contactWaId: event.contactWaId,
    contactName: event.contactName,
    orgName: resources.orgName,
    inboundText: text,
    buttonId,
  };

  const variables = conversation.bot_variables ?? {};

  // 1. Already inside a flow? Continue it.
  if (conversation.bot_flow_id && conversation.bot_node_id) {
    const flow = resources.flows.find((f) => f.id === conversation.bot_flow_id);
    const graph = flow ? graphOf(flow) : null;
    const parked = graph ? findNode(graph, conversation.bot_node_id) : null;

    if (flow && graph && parked) {
      const resumed = await resumeFrom(graph, parked, context, variables);

      if (resumed.reask) {
        // The answer did not fit the question — ask again and stay parked.
        await sendTextMessage(
          connection.phoneNumberId,
          event.contactWaId,
          resumed.reask,
          connection.accessToken
        );
        return {
          flowId: flow.id,
          label: `${flow.name} · re-asked`,
          nodeId: parked.id,
          nodeKind: parked.kind,
          reply: resumed.reask,
          outcome: "replied",
          error: null,
        };
      }

      if (resumed.next) {
        const outcome = await runFlow(graph, resumed.next, context, resumed.variables);
        await applyFlowState(supabase, event.conversationId, flow.id, outcome);
        return summarise(flow.id, flow.name, outcome);
      }

      // Nothing matched at the parked node: leave the flow rather than
      // trapping the customer, and fall through to ordinary matching.
      await supabase
        .from("conversations")
        .update({ bot_flow_id: null, bot_node_id: null })
        .eq("id", event.conversationId);
    }
  }

  // 2. Not in a flow — does any active graph flow's trigger match?
  for (const flow of resources.flows) {
    const graph = graphOf(flow);
    if (graph.nodes.length === 0) continue;
    // A flow with no trigger node is an old-style single reply; leave those
    // to planReply so their trigger_type semantics keep working.
    if (!graph.nodes.some((n) => n.kind === "on_message")) continue;

    const start = flowEntryFor(flow, text, conversation.connectionId);
    if (!start) continue;

    const outcome = await runFlow(graph, start, context, {});
    await applyFlowState(supabase, event.conversationId, flow.id, outcome);
    return summarise(flow.id, flow.name, outcome);
  }

  return null;
}

function summarise(flowId: string, name: string, outcome: FlowOutcomeLike): GraphFlowResult {
  const last = outcome.executed[outcome.executed.length - 1];
  return {
    flowId,
    label: `${name} · ${outcome.executed.length} node${outcome.executed.length === 1 ? "" : "s"}`,
    nodeId: last?.id ?? null,
    nodeKind: last?.kind ?? null,
    reply: outcome.lastReply,
    outcome: outcome.error
      ? "failed"
      : outcome.handedOff
        ? "handoff"
        : outcome.lastReply
          ? "replied"
          : "skipped",
    error: outcome.error,
  };
}

type FlowOutcomeLike = Awaited<ReturnType<typeof runFlow>>;

async function applyFlowState(
  supabase: RunnerClient,
  conversationId: string,
  flowId: string,
  outcome: FlowOutcomeLike
): Promise<void> {
  if (outcome.handedOff) return; // the handoff node already wrote its state

  const { error } = await supabase
    .from("conversations")
    .update({
      // Either kind of pause keeps the flow id: one waits for the customer,
      // the other waits for the clock, and both need to find their way back.
      bot_flow_id: outcome.parkedAt || outcome.resumeNodeId ? flowId : null,
      bot_node_id: outcome.parkedAt,
      bot_resume_at: outcome.resumeAt,
      bot_resume_node_id: outcome.resumeNodeId,
    })
    .eq("id", conversationId);

  if (error) console.error("Failed to store flow position", error);
}

// --- loading --------------------------------------------------------------

type ConversationState = {
  /** Which of the workspace's numbers this thread is on. */
  connectionId: string | null;
  bot_enabled: boolean;
  bot_flow_id: string | null;
  bot_node_id: string | null;
  bot_variables: Record<string, string>;
};

async function loadConversation(
  supabase: RunnerClient,
  conversationId: string
): Promise<ConversationState | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("bot_enabled, bot_flow_id, bot_node_id, bot_variables, connection_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) return null;
  return { ...data, connectionId: data.connection_id };
}

async function loadResources(
  supabase: RunnerClient,
  event: InboundEvent,
  conversation: ConversationState
): Promise<RunnerResources & { orgName: string; knowledge: AssistantKnowledge[] }> {
  const [
    flowsResult,
    faqsResult,
    automationsResult,
    assistantsResult,
    knowledgeResult,
    orgResult,
    inboundCount,
  ] = await Promise.all([
      // A bot pinned to one number must not answer a message that arrived
      // on another. `connection_id is null` is "any number", which is what
      // every bot created before numbers were a concept means.
      supabase
        .from("chatbot_flows")
        .select("*")
        .eq("org_id", event.orgId)
        .eq("is_active", true)
        .or(scopedToNumber(conversation.connectionId)),
      supabase.from("faq_entries").select("*").eq("org_id", event.orgId).eq("is_active", true),
      supabase
        .from("automation_flows")
        .select("*")
        .eq("org_id", event.orgId)
        .eq("is_active", true)
        .or(scopedToNumber(conversation.connectionId)),
      supabase
        .from("ai_assistants")
        .select("*")
        .eq("org_id", event.orgId)
        .eq("is_active", true)
        .or(scopedToNumber(conversation.connectionId))
        .order("created_at"),
      supabase
        .from("assistant_knowledge")
        .select("*")
        .eq("org_id", event.orgId)
        .eq("is_active", true)
        .order("created_at"),
      supabase.from("organizations").select("name").eq("id", event.orgId).maybeSingle(),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", event.conversationId)
        .eq("direction", "inbound"),
    ]);

  const flows = (flowsResult.data ?? []) as ChatbotFlow[];

  return {
    flows,
    faqs: (faqsResult.data ?? []) as FaqEntry[],
    automations: (automationsResult.data ?? []) as AutomationFlow[],
    assistants: (assistantsResult.data ?? []) as AiAssistant[],
    knowledge: (knowledgeResult.data ?? []) as AssistantKnowledge[],
    // The message that triggered this run is already stored, so a first
    // message means exactly one inbound row exists.
    isFirstMessage: (inboundCount.count ?? 0) <= 1,
    activeFlow: conversation.bot_flow_id
      ? (flows.find((flow) => flow.id === conversation.bot_flow_id) ?? null)
      : null,
    activeNodeId: conversation.bot_node_id,
    orgName: orgResult.data?.name ?? "the business",
  };
}

async function loadHistory(
  supabase: RunnerClient,
  conversationId: string
): Promise<AssistantTurn[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("direction, type, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error || !data) return [];

  return data
    .slice()
    .reverse()
    .map((message) => {
      const content = message.content as Record<string, unknown>;
      const { text } = extractInboundText(message.type, content);
      return {
        role: message.direction === "inbound" ? ("user" as const) : ("assistant" as const),
        // Media with no caption still matters to the thread's shape, so
        // describe it rather than dropping the turn entirely.
        text: text || `[${message.type}]`,
      };
    });
}

// --- side effects ---------------------------------------------------------

async function applySideEffects(
  supabase: RunnerClient,
  event: InboundEvent,
  plan: ReplyPlan,
  conversation: ConversationState
): Promise<void> {
  if (plan.kind === "handoff") {
    // Silence the bot and flag the thread so it surfaces as needing a
    // human. Only an agent turning replies back on undoes this.
    await supabase
      .from("conversations")
      .update({
        bot_enabled: false,
        bot_flow_id: null,
        bot_node_id: null,
        status: "pending",
      })
      .eq("id", event.conversationId);
    return;
  }

  if (plan.kind === "chatbot" || plan.kind === "flow_step") {
    await supabase
      .from("conversations")
      .update({ bot_flow_id: plan.nextNodeId ? plan.flowId : null, bot_node_id: plan.nextNodeId })
      .eq("id", event.conversationId);
    return;
  }

  if (plan.kind === "faq") {
    // Best-effort counter for the FAQ screen's "most asked" ordering.
    const { data } = await supabase
      .from("faq_entries")
      .select("hit_count")
      .eq("id", plan.id)
      .maybeSingle();
    if (data) {
      await supabase
        .from("faq_entries")
        .update({ hit_count: data.hit_count + 1 })
        .eq("id", plan.id);
    }
  }

  await clearFlowState(supabase, event.conversationId, conversation);
}

async function clearFlowState(
  supabase: RunnerClient,
  conversationId: string,
  conversation: ConversationState
): Promise<void> {
  if (!conversation.bot_flow_id && !conversation.bot_node_id) return;
  await supabase
    .from("conversations")
    .update({ bot_flow_id: null, bot_node_id: null })
    .eq("id", conversationId);
}

// --- events ---------------------------------------------------------------

/**
 * Notifies the org's outgoing webhooks that a message arrived. Separate
 * from the bot pipeline so a customer's Zapier hook still fires on
 * messages no bot answers.
 */
export async function notifyInboundMessage(
  supabase: RunnerClient,
  orgId: string,
  payload: {
    conversationId: string;
    contactId: string;
    contactWaId: string;
    contactName: string | null;
    waMessageId: string | null;
    messageType: string;
    content: Record<string, unknown>;
  }
): Promise<void> {
  const { text } = extractInboundText(payload.messageType, payload.content);
  await dispatchWebhookEvent(supabase, orgId, "message.received", {
    conversation_id: payload.conversationId,
    contact: {
      id: payload.contactId,
      wa_id: payload.contactWaId,
      name: payload.contactName,
    },
    message: {
      wa_message_id: payload.waMessageId,
      type: payload.messageType,
      text: text || null,
      content: payload.content,
    },
  });
}

/**
 * The PostgREST filter for "runs on any number, or on this one".
 *
 * A conversation with no number recorded — one that predates numbers being
 * tracked — matches only the unpinned rows, which is the safe reading:
 * better a general bot answers than a bot for the wrong number.
 */
function scopedToNumber(connectionId: string | null): string {
  return connectionId
    ? `connection_id.is.null,connection_id.eq.${connectionId}`
    : "connection_id.is.null";
}
