import "server-only";
import { randomUUID } from "node:crypto";
import type { FlowGraph, FlowNode } from "@/types/flow";
import type { ChatbotFlow } from "@/types/portal";
import {
  answerAccepted,
  buttonsOf,
  checkCondition,
  delayMs,
  entryNode,
  findNode,
  graphOf,
  handleIdsOf,
  interpolate,
  isWaitingNode,
  nextNode,
  sectionsOf,
  triggerListensOn,
  triggerMatches,
  INLINE_DELAY_LIMIT_MS,
  type FlowVariables,
} from "@/lib/flow-engine";
import {
  describeMetaError,
  MetaApiError,
  sendCtaUrl,
  sendFlowMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendMediaMessage,
  sendTemplateMessage,
  sendTextMessage,
  type MetaMediaType,
} from "@/lib/meta-whatsapp";
import { generateAssistantReply } from "@/lib/ai-assistant";
import { nodeDef } from "@/types/flow";
import type { OrgConnection, RunnerClient } from "@/lib/whatsapp-send";

// The I/O half of the flow runtime. flow-engine.ts decides where to go; this
// performs the sends, writes the side effects, and knows when to stop.
//
// A run walks the graph until it reaches a node that waits for the customer,
// a terminal node, or the step budget. The budget exists because a graph can
// contain a cycle — the builder does not stop you drawing one — and an
// unbounded walk would hold the webhook open until the platform killed it.

const MAX_STEPS = 25;

export interface FlowContext {
  supabase: RunnerClient;
  connection: OrgConnection;
  orgId: string;
  conversationId: string;
  contactId: string;
  contactWaId: string;
  contactName: string | null;
  orgName: string;
  /** Text of the message that started this run, already extracted. */
  inboundText: string;
  /** Button or list-row id the customer tapped, if any. */
  buttonId: string | null;
}

export interface FlowOutcome {
  /** Nodes we executed, oldest first — the audit trail for one run. */
  executed: { id: string; kind: string }[];
  /** Last thing sent, for the bot_runs summary. */
  lastReply: string | null;
  /** Node the conversation now waits at, or null when the flow ended. */
  parkedAt: string | null;
  error: string | null;
  handedOff: boolean;
  /** Set when a Delay parked the run for longer than we run inline. */
  resumeAt: string | null;
  /**
   * Where the scheduler should pick the flow back up. Distinct from
   * parkedAt, which means "waiting for the customer" — this one means
   * "waiting for the clock", and the two resume differently.
   */
  resumeNodeId: string | null;
}

/**
 * Decides whether an inbound message starts this flow, and from which node.
 * Returns null when the flow does not apply.
 */
export function flowEntryFor(
  flow: ChatbotFlow,
  text: string,
  connectionId: string | null = null
): FlowNode | null {
  const graph = graphOf(flow);
  const start = entryNode(graph, (flow as ChatbotFlow & { entry_node_id?: string | null }).entry_node_id);
  if (!start) return null;

  // A graph whose entry is a trigger node only fires when the trigger
  // matches; one without a trigger (a flow built in the old simple form)
  // relies on the flow's own trigger_type, checked by the caller.
  if (start.kind === "on_message") {
    // The number comes first: a trigger set to listen on one number must
    // stay silent on the others however well the keywords match.
    if (!triggerListensOn(start, connectionId)) return null;
    return triggerMatches(start, text) ? start : null;
  }
  return start;
}

/**
 * Resumes a conversation parked at a waiting node, given the customer's
 * reply. Returns the node to continue from, or null when the reply did not
 * satisfy the node — in which case the caller re-asks.
 */
export async function resumeFrom(
  graph: FlowGraph,
  parkedNode: FlowNode,
  context: FlowContext,
  variables: FlowVariables
): Promise<{ next: FlowNode | null; variables: FlowVariables; reask: string | null }> {
  if (parkedNode.kind === "ask_question" || parkedNode.kind === "ask_location") {
    const answer =
      parkedNode.kind === "ask_location" ? context.inboundText || "shared" : context.inboundText;

    if (!answerAccepted(parkedNode, answer)) {
      const retry = String(parkedNode.data.retry ?? "").trim();
      return { next: null, variables, reask: retry || String(parkedNode.data.body ?? "") };
    }

    const name = String(parkedNode.data.variable ?? "answer");
    const updated = { ...variables, [name]: answer };
    return { next: nextNode(graph, parkedNode.id, null), variables: updated, reask: null };
  }

  // Buttons and lists: the tapped outlet decides the path. A typed reply
  // that matches no outlet leaves the flow — better than trapping someone
  // who asked something else entirely.
  const handles = handleIdsOf(parkedNode);
  const tapped =
    handles.find((h) => h.id === context.buttonId) ??
    handles.find((h) => h.label.toLowerCase() === context.inboundText.trim().toLowerCase());

  if (!tapped) return { next: null, variables, reask: null };
  return { next: nextNode(graph, parkedNode.id, tapped.id), variables, reask: null };
}

/**
 * Walks the graph from `start`, executing each node.
 *
 * Never throws: a flow that errors mid-walk records what it managed and
 * stops, so the customer is not left mid-conversation with no explanation
 * in the log.
 */
export async function runFlow(
  graph: FlowGraph,
  start: FlowNode,
  context: FlowContext,
  initialVariables: FlowVariables
): Promise<FlowOutcome> {
  const outcome: FlowOutcome = {
    executed: [],
    lastReply: null,
    parkedAt: null,
    resumeNodeId: null,
    error: null,
    handedOff: false,
    resumeAt: null,
  };

  let variables = { ...initialVariables };
  let current: FlowNode | null = start;
  let steps = 0;

  while (current && steps < MAX_STEPS) {
    // Narrowed once per iteration: `current` is reassigned inside the try,
    // so TypeScript widens it back to nullable for the catch handler.
    const node: FlowNode = current;
    steps += 1;
    outcome.executed.push({ id: node.id, kind: node.kind });

    try {
      const step = await executeNode(node, context, variables);
      variables = step.variables;
      if (step.reply) outcome.lastReply = step.reply;
      if (step.handedOff) outcome.handedOff = true;
      if (step.resumeAt) {
        outcome.resumeAt = step.resumeAt;
        // The node after the delay is where time resumes the flow. Recorded
        // now because once the loop breaks the graph position is lost.
        outcome.resumeNodeId = nextNode(graph, node.id, null)?.id ?? null;
      }

      if (step.stop) {
        current = null;
        break;
      }

      if (isWaitingNode(node)) {
        outcome.parkedAt = node.id;
        break;
      }

      current = nextNode(graph, node.id, step.nextHandle ?? null);
    } catch (error) {
      // describeMetaError exists precisely so this never reads as a JSON
      // envelope. A tenant seeing "(#131030) Recipient phone number not in
      // allowed list" inside braces cannot act on it; the sentence it maps
      // to names the screen in Meta where the fix lives.
      outcome.error =
        error instanceof MetaApiError
          ? `${describeMetaError(error.status, error.body)} (at the ${nodeLabel(node.kind)} step)`
          : error instanceof Error
            ? `${node.kind}: ${error.message}`
            : `${node.kind}: unknown failure`;
      break;
    }
  }

  if (steps >= MAX_STEPS && !outcome.error) {
    outcome.error = `Stopped after ${MAX_STEPS} steps — the flow probably contains a loop.`;
  }

  await persistVariables(context, variables);
  return outcome;
}

// --- one node --------------------------------------------------------------

interface StepResult {
  variables: FlowVariables;
  reply?: string | null;
  stop?: boolean;
  handedOff?: boolean;
  resumeAt?: string | null;
  /** Which outlet to follow. undefined means the default. */
  nextHandle?: string | null;
}

async function executeNode(
  node: FlowNode,
  context: FlowContext,
  variables: FlowVariables
): Promise<StepResult> {
  const { connection, contactWaId } = context;
  const text = (key: string) => interpolate(String(node.data[key] ?? ""), variables);

  switch (node.kind) {
    case "on_message":
      return { variables };

    case "send_text": {
      const body = text("body");
      if (!body) return { variables };
      const result = await sendTextMessage(connection.phoneNumberId, contactWaId, body, connection.accessToken);
      await logOutbound(context, "text", { body }, result.messages[0]?.id ?? null);
      return { variables, reply: body };
    }

    case "send_buttons": {
      const body = text("body");
      const buttons = buttonsOf(node);
      if (!body || buttons.length === 0) return { variables };
      const result = await sendInteractiveButtons(
        connection.phoneNumberId,
        contactWaId,
        body,
        buttons,
        connection.accessToken
      );
      await logOutbound(context, "interactive", { body, buttons }, result.messages[0]?.id ?? null);
      return { variables, reply: body };
    }

    case "send_list": {
      const body = text("body");
      const sections = sectionsOf(node);
      if (!body || sections.length === 0) return { variables };
      const result = await sendInteractiveList(
        connection.phoneNumberId,
        contactWaId,
        body,
        String(node.data.buttonText ?? "View options"),
        sections,
        connection.accessToken,
        { footer: text("footer") || undefined }
      );
      await logOutbound(context, "interactive", { body, sections }, result.messages[0]?.id ?? null);
      return { variables, reply: body };
    }

    case "send_media": {
      const url = text("url");
      if (!url) return { variables };
      const mediaType = String(node.data.mediaType ?? "image") as MetaMediaType;
      const caption = text("caption");
      const result = await sendMediaMessage(
        connection.phoneNumberId,
        contactWaId,
        mediaType,
        url,
        connection.accessToken,
        { caption: caption || undefined, filename: String(node.data.filename ?? "") || undefined }
      );
      await logOutbound(context, mediaType, { link: url, caption }, result.messages[0]?.id ?? null);
      return { variables, reply: caption || `[${mediaType}]` };
    }

    case "send_cta": {
      const body = text("body");
      const url = text("url");
      const buttonText = String(node.data.buttonText ?? "");
      if (!body || !url || !buttonText) return { variables };
      const result = await sendCtaUrl(
        connection.phoneNumberId,
        contactWaId,
        body,
        buttonText,
        url,
        connection.accessToken,
        { footer: text("footer") || undefined }
      );
      await logOutbound(context, "interactive", { body, url, buttonText }, result.messages[0]?.id ?? null);
      return { variables, reply: body };
    }

    case "send_form": {
      const formId = String(node.data.formId ?? "").trim();
      const body = text("body");
      if (!formId || !body) return { variables };

      // Accept either the id shown on the Forms screen or the form's name,
      // because nobody wants to paste a UUID into a chatbot node.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formId);
      const query = context.supabase
        .from("whatsapp_flows")
        .select("id, meta_flow_id, status, screens")
        .eq("org_id", context.orgId);

      const { data: form } = await (isUuid ? query.eq("id", formId) : query.eq("name", formId))
        .maybeSingle();

      if (!form) {
        throw new Error(`No form called "${formId}" in this workspace.`);
      }

      if (!form?.meta_flow_id) {
        throw new Error("That form hasn't been sent to WhatsApp yet — open it and press Update Flow.");
      }

      const screens = (form.screens ?? []) as Array<{ screenId?: string }>;
      const firstScreen = screens[0]?.screenId;
      if (!firstScreen) {
        throw new Error("That form has no screens to open.");
      }

      // The token is what ties the answers back to this conversation; the
      // webhook has nothing else to match a submission on.
      const flowToken = randomUUID();

      const result = await sendFlowMessage(
        connection.phoneNumberId,
        contactWaId,
        connection.accessToken,
        {
          flowId: form.meta_flow_id,
          flowToken,
          cta: String(node.data.buttonText ?? "Open form").slice(0, 20) || "Open form",
          body,
          firstScreen,
          footer: text("footer") || undefined,
          draft: form.status !== "published",
        }
      );

      await context.supabase.from("flow_sends").insert({
        org_id: context.orgId,
        flow_id: form.id,
        contact_id: context.contactId,
        conversation_id: context.conversationId,
        wa_id: contactWaId,
        flow_token: flowToken,
        wa_message_id: result.messages[0]?.id ?? null,
      });

      await logOutbound(context, "interactive", { body, flow_id: form.meta_flow_id }, result.messages[0]?.id ?? null);
      return { variables, reply: body };
    }

    case "send_template": {
      const name = String(node.data.templateName ?? "").trim();
      if (!name) return { variables };
      const language = String(node.data.language ?? "en_US");
      const result = await sendTemplateMessage(
        connection.phoneNumberId,
        contactWaId,
        name,
        language,
        [],
        connection.accessToken
      );
      await logOutbound(context, "template", { template_name: name, language }, result.messages[0]?.id ?? null);
      return { variables, reply: `Template: ${name}` };
    }

    case "send_product":
      // Deliberately inert: sending would need a catalogue linked to the
      // WABA, which nothing in this product creates yet. Failing loudly here
      // is better than a 400 from Meta that reads like a bug.
      throw new Error("Send Product needs a Meta commerce catalogue, which is not connected yet.");

    case "ask_question":
    case "ask_location": {
      const body = text("body");
      if (!body) return { variables };
      const result = await sendTextMessage(connection.phoneNumberId, contactWaId, body, connection.accessToken);
      await logOutbound(context, "text", { body }, result.messages[0]?.id ?? null);
      return { variables, reply: body };
    }

    case "condition":
      return { variables, nextHandle: checkCondition(node, variables) ? "true" : "false" };

    case "delay": {
      const ms = delayMs(node);
      if (ms <= INLINE_DELAY_LIMIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { variables };
      }
      // Park rather than hold the webhook open for minutes. Nothing resumes
      // this yet; the run stops here and the log says why.
      return {
        variables,
        stop: true,
        resumeAt: new Date(Date.now() + ms).toISOString(),
      };
    }

    case "update_tag": {
      const tags = (Array.isArray(node.data.tags) ? node.data.tags : [])
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => interpolate(t, variables).trim());
      if (tags.length === 0) return { variables };

      const { data: contact } = await context.supabase
        .from("contacts")
        .select("tags")
        .eq("id", context.contactId)
        .maybeSingle();

      const existing = new Set(contact?.tags ?? []);
      if (String(node.data.action ?? "add") === "add") {
        tags.forEach((t) => existing.add(t));
      } else {
        tags.forEach((t) => existing.delete(t));
      }

      await context.supabase
        .from("contacts")
        .update({ tags: [...existing] })
        .eq("id", context.contactId);
      return { variables };
    }

    case "update_field": {
      const value = text("value").trim();
      if (!value) return { variables };
      await context.supabase.from("contacts").update({ name: value }).eq("id", context.contactId);
      return { variables };
    }

    case "fetch_contact": {
      const prefix = String(node.data.prefix ?? "contact");
      const { data: contact } = await context.supabase
        .from("contacts")
        .select("name, wa_id, tags")
        .eq("id", context.contactId)
        .maybeSingle();

      return {
        variables: {
          ...variables,
          [`${prefix}.name`]: contact?.name ?? "",
          [`${prefix}.wa_id`]: contact?.wa_id ?? "",
          [`${prefix}.tags`]: (contact?.tags ?? []).join(", "),
        },
      };
    }

    case "http": {
      const url = text("url");
      if (!url) return { variables };
      const method = String(node.data.method ?? "POST");
      const body = text("body");

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : body || "{}",
        // Bounded: an unresponsive endpoint must not hold up the reply.
        signal: AbortSignal.timeout(8000),
      });

      const raw = (await response.text()).slice(0, 2000);
      const name = String(node.data.variable ?? "response");
      return {
        variables: { ...variables, [name]: raw, [`${name}.status`]: String(response.status) },
      };
    }

    case "ai_agent": {
      const { data: assistant } = await context.supabase
        .from("ai_assistants")
        .select("*")
        .eq("org_id", context.orgId)
        .eq("is_active", true)
        .order("created_at")
        .limit(1)
        .maybeSingle();

      if (!assistant) throw new Error("No active AI assistant to hand this node to.");

      // Org-wide knowledge plus this assistant's own, matching what the
      // inbound-message path feeds it.
      const { data: knowledge } = await context.supabase
        .from("assistant_knowledge")
        .select("*")
        .eq("org_id", context.orgId)
        .eq("is_active", true)
        .or(`assistant_id.is.null,assistant_id.eq.${assistant.id}`)
        .order("created_at");

      const extra = text("instructions").trim();
      const generated = await generateAssistantReply({
        assistant: extra
          ? { ...assistant, system_prompt: `${assistant.system_prompt}\n\n${extra}`.trim() }
          : assistant,
        orgName: context.orgName,
        contactName: context.contactName,
        history: [{ role: "user", text: context.inboundText || "(no text)" }],
        knowledge: knowledge ?? [],
      });

      if (generated.status !== "replied") {
        // Inside a flow there is no "quietly do nothing" — the node has to
        // either send or stop the run with a reason a human can read.
        throw new Error(
          generated.status === "skipped" ? generated.reason : generated.error
        );
      }

      const result = await sendTextMessage(
        connection.phoneNumberId,
        contactWaId,
        generated.text,
        connection.accessToken
      );
      await logOutbound(context, "text", { body: generated.text }, result.messages[0]?.id ?? null);
      return { variables, reply: generated.text };
    }

    case "handoff": {
      const body = text("body");
      if (body) {
        const result = await sendTextMessage(connection.phoneNumberId, contactWaId, body, connection.accessToken);
        await logOutbound(context, "text", { body }, result.messages[0]?.id ?? null);
      }
      await context.supabase
        .from("conversations")
        .update({ bot_enabled: false, bot_flow_id: null, bot_node_id: null, status: "pending" })
        .eq("id", context.conversationId);
      return { variables, reply: body || null, stop: true, handedOff: true };
    }

    case "stop_bot":
      return { variables, stop: true };

    default:
      return { variables };
  }
}

// --- persistence -----------------------------------------------------------

async function logOutbound(
  context: FlowContext,
  type: string,
  content: Record<string, unknown>,
  waMessageId: string | null
): Promise<void> {
  const sentAt = new Date().toISOString();

  const { error } = await context.supabase.from("messages").insert({
    conversation_id: context.conversationId,
    direction: "outbound",
    type,
    content,
    wa_message_id: waMessageId,
    status: "sent",
  });
  if (error) console.error("Sent to WhatsApp but failed to log the outbound message", error);

  await context.supabase
    .from("conversations")
    .update({ last_message_at: sentAt })
    .eq("id", context.conversationId);
}

async function persistVariables(context: FlowContext, variables: FlowVariables): Promise<void> {
  const { error } = await context.supabase
    .from("conversations")
    .update({ bot_variables: variables })
    .eq("id", context.conversationId);
  if (error) console.error("Failed to persist flow variables", error);
}

export { findNode, graphOf };

/** "Send Text Message" reads better in an error than "send_text". */
function nodeLabel(kind: FlowNode["kind"]): string {
  return nodeDef(kind)?.label ?? kind;
}
