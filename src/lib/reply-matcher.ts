import type { AiAssistant, ChatbotFlow, LegacyChatbotNode, FaqEntry } from "@/types/portal";
import type { Database } from "@/types/database";

// The decision half of the message runner, kept free of Supabase, fetch and
// environment access so it can be reasoned about — and tested — on its own.
// Everything here is a pure function of the inbound text and the org's
// stored configuration.

export type AutomationFlow = Database["public"]["Tables"]["automation_flows"]["Row"];

export interface InboundText {
  /** Normalised message body, or the tapped button's title. */
  text: string;
  /** Set when the customer tapped a quick-reply button rather than typing. */
  buttonId?: string | null;
}

export interface RunnerResources {
  flows: ChatbotFlow[];
  faqs: FaqEntry[];
  automations: AutomationFlow[];
  assistants: AiAssistant[];
  /** True when this is the contact's very first inbound message. */
  isFirstMessage: boolean;
  /** The flow this conversation is partway through, if any. */
  activeFlow: ChatbotFlow | null;
  activeNodeId: string | null;
}

export type ReplyPlan =
  | {
      kind: "flow_step" | "chatbot";
      id: string;
      label: string;
      body: string;
      buttons: string[];
      flowId: string;
      /** Node to resume from on the next inbound message; null ends the flow. */
      nextNodeId: string | null;
    }
  | { kind: "faq"; id: string; label: string; body: string }
  | { kind: "automation"; id: string; label: string; body: string }
  | { kind: "handoff"; id: string; label: string; body: string }
  /** The assistant's text is generated later — matching only selects it. */
  | { kind: "assistant"; id: string; label: string }
  | { kind: "none" };

/**
 * Pulls the text a matcher can work with out of an inbound message.
 *
 * A tapped quick-reply button arrives as an interactive payload rather
 * than text, and matching its title is what lets a customer drive the bot
 * without typing.
 */
export function extractInboundText(
  messageType: string,
  content: Record<string, unknown>
): { text: string; buttonId: string | null } {
  const asString = (value: unknown): string => (typeof value === "string" ? value : "");

  if (messageType === "text") {
    return { text: asString(content.body), buttonId: null };
  }

  if (messageType === "interactive") {
    const interactive = content as {
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string };
    };
    const reply = interactive.button_reply ?? interactive.list_reply;
    if (reply) {
      return { text: asString(reply.title), buttonId: asString(reply.id) || null };
    }
  }

  // Quick-reply buttons on a template message come back as `button`, with
  // the visible label in `text` and the developer-set value in `payload`.
  if (messageType === "button") {
    return {
      text: asString(content.text) || asString(content.payload),
      buttonId: asString(content.payload) || null,
    };
  }

  // Media messages: a caption is real text worth matching on.
  const caption = asString(content.caption);
  return { text: caption, buttonId: null };
}

// --- text normalisation ---------------------------------------------------

/**
 * Lowercases, strips punctuation and collapses whitespace so that
 * "PRICE?", " price " and "Price!" all match a `price` keyword.
 *
 * Unicode-aware on purpose: stripping every non-ASCII character would
 * break Hindi, Arabic and every other non-Latin script this is sold into.
 * \p{M} is in the keep set alongside letters and numbers because Indic
 * vowel signs are Marks, not Letters — without it "कीमत" is mangled into
 * "क मत" and no Hindi keyword ever matches.
 */
export function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Whole-word containment. Substring matching would fire a `hi` keyword on
 * "this", which is the classic way a keyword bot embarrasses its owner.
 */
export function containsKeyword(normalisedText: string, keyword: string): boolean {
  const needle = normalise(keyword);
  if (!needle) return false;
  if (normalisedText === needle) return true;

  const padded = ` ${normalisedText} `;
  return padded.includes(` ${needle} `);
}

// Words too common to carry meaning when scoring an FAQ match.
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does",
  "for", "from", "get", "has", "have", "how", "i", "if", "in", "is", "it",
  "me", "my", "of", "on", "or", "our", "please", "that", "the", "there",
  "this", "to", "was", "we", "what", "when", "where", "which", "who", "why",
  "will", "with", "you", "your",
]);

function significantWords(normalisedText: string): Set<string> {
  return new Set(
    normalisedText.split(" ").filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );
}

// --- FAQ scoring ----------------------------------------------------------

// A single configured keyword hit is a deliberate signal from the business
// and is enough on its own. Word overlap is fuzzier, so it needs to carry
// most of the question before it fires.
const KEYWORD_HIT_SCORE = 3;
const FAQ_SCORE_THRESHOLD = 3;
const QUESTION_OVERLAP_THRESHOLD = 0.6;

export function scoreFaq(normalisedText: string, faq: FaqEntry): number {
  let score = 0;

  for (const keyword of faq.keywords) {
    if (containsKeyword(normalisedText, keyword)) score += KEYWORD_HIT_SCORE;
  }

  const questionWords = significantWords(normalise(faq.question));
  if (questionWords.size > 0) {
    const messageWords = significantWords(normalisedText);
    let overlap = 0;
    for (const word of questionWords) {
      if (messageWords.has(word)) overlap += 1;
    }
    const ratio = overlap / questionWords.size;
    if (ratio >= QUESTION_OVERLAP_THRESHOLD) {
      score += KEYWORD_HIT_SCORE;
    } else {
      score += overlap;
    }
  }

  return score;
}

// --- flow helpers ---------------------------------------------------------

/**
 * Reads a flow's nodes in the flat pre-builder shape.
 *
 * Graph flows are executed by flow-runner, not here, so anything carrying a
 * `kind` is skipped: this matcher only serves the single-reply flows the old
 * form produced, and treating a graph node as one would send its raw config.
 */
function nodesOf(flow: ChatbotFlow): LegacyChatbotNode[] {
  if (!Array.isArray(flow.nodes)) return [];
  return (flow.nodes as unknown[]).filter(
    (node) => Boolean(node) && typeof node === "object" && !("kind" in (node as object))
  ) as LegacyChatbotNode[];
}

function planFromNode(
  flow: ChatbotFlow,
  node: LegacyChatbotNode,
  kind: "chatbot" | "flow_step"
): ReplyPlan | null {
  if (!node.body?.trim()) return null;

  const buttons = (node.buttons ?? []).filter((label) => label.trim());
  return {
    kind,
    id: flow.id,
    label: flow.name,
    body: node.body,
    buttons,
    flowId: flow.id,
    // Only park the conversation on this node when a further step is
    // actually reachable. Parking on a dead end would make every later
    // message fall into a flow that has nowhere to go.
    nextNodeId: buttons.length > 0 || node.next ? node.id : null,
  };
}

/**
 * Resolves which node a reply to `currentNodeId` should move to.
 *
 * `button_next` maps a button's label to a node id; flows authored in the
 * simple builder do not set it, in which case a tapped button falls
 * through to ordinary matching so the label can hit a keyword bot.
 */
function resolveNextNode(flow: ChatbotFlow, currentNodeId: string, reply: string): LegacyChatbotNode | null {
  const nodes = nodesOf(flow);
  const current = nodes.find((node) => node.id === currentNodeId);
  if (!current) return null;

  const targets = current.button_next ?? {};
  for (const [label, nodeId] of Object.entries(targets)) {
    if (normalise(label) === reply) {
      return nodes.find((node) => node.id === nodeId) ?? null;
    }
  }

  // An unconditional `next` only advances when the node offered no choice;
  // otherwise a customer tapping button B would be sent down button A's path.
  if (current.next && (current.buttons ?? []).length === 0) {
    return nodes.find((node) => node.id === current.next) ?? null;
  }

  return null;
}

// --- the matcher ----------------------------------------------------------

export const HANDOFF_REPLY =
  "Got it — I'm passing this to a team member. Someone will reply here shortly.";

/**
 * Picks what to reply with, in priority order:
 *
 *   1. an explicit request for a human           (handoff)
 *   2. the next step of a flow already running   (flow_step)
 *   3. a keyword or menu chatbot                 (chatbot)
 *   4. a welcome bot, on a first message         (chatbot)
 *   5. the FAQ knowledge base                    (faq)
 *   6. a keyword automation                      (automation)
 *   7. the AI assistant                          (assistant)
 *   8. a fallback bot                            (chatbot)
 *
 * Rules the business wrote explicitly beat generated answers, and the
 * fallback bot sits below the assistant so it stays a genuine last resort.
 */
export function planReply(inbound: InboundText, resources: RunnerResources): ReplyPlan {
  const text = normalise(inbound.text);
  const activeFlows = resources.flows.filter((flow) => flow.is_active);

  if (text) {
    // 1. Handoff — checked before anything else so "talk to a human" is
    // never answered by the very bot the customer is trying to escape.
    for (const assistant of resources.assistants) {
      const keyword = assistant.handoff_keywords.find((word) => containsKeyword(text, word));
      if (keyword) {
        return {
          kind: "handoff",
          id: assistant.id,
          label: `Handoff keyword "${keyword}"`,
          body: HANDOFF_REPLY,
        };
      }
    }

    // 2. Continue a flow already in progress.
    if (resources.activeFlow && resources.activeNodeId) {
      const next = resolveNextNode(resources.activeFlow, resources.activeNodeId, text);
      if (next) {
        const plan = planFromNode(resources.activeFlow, next, "flow_step");
        if (plan) return plan;
      }
    }

    // 3. Keyword and menu bots.
    for (const flow of activeFlows) {
      if (flow.trigger_type !== "keyword" && flow.trigger_type !== "menu") continue;
      if (!flow.trigger_value || !containsKeyword(text, flow.trigger_value)) continue;

      const node = nodesOf(flow)[0];
      if (!node) continue;
      const plan = planFromNode(flow, node, "chatbot");
      if (plan) return plan;
    }
  }

  // 4. Welcome bot. Runs even for a message with no text — a photo as an
  // opener still deserves a greeting.
  if (resources.isFirstMessage) {
    const welcome = activeFlows.find((flow) => flow.trigger_type === "welcome");
    const node = welcome ? nodesOf(welcome)[0] : null;
    if (welcome && node) {
      const plan = planFromNode(welcome, node, "chatbot");
      if (plan) return plan;
    }
  }

  if (text) {
    // 5. FAQ knowledge base — best scoring entry wins.
    let bestFaq: FaqEntry | null = null;
    let bestScore = 0;
    for (const faq of resources.faqs) {
      if (!faq.is_active) continue;
      const score = scoreFaq(text, faq);
      if (score > bestScore) {
        bestScore = score;
        bestFaq = faq;
      }
    }
    if (bestFaq && bestScore >= FAQ_SCORE_THRESHOLD) {
      return { kind: "faq", id: bestFaq.id, label: bestFaq.question, body: bestFaq.answer };
    }

    // 6. Keyword automations.
    for (const automation of resources.automations) {
      if (!automation.is_active || automation.trigger_type !== "keyword") continue;

      const keyword = automation.trigger_config?.keyword;
      if (typeof keyword !== "string" || !containsKeyword(text, keyword)) continue;

      const body = firstTextAction(automation);
      if (body) {
        return { kind: "automation", id: automation.id, label: automation.name, body };
      }
    }

    // 7. The AI assistant.
    const assistant = resources.assistants.find((candidate) => candidate.is_active);
    if (assistant) {
      return { kind: "assistant", id: assistant.id, label: assistant.name };
    }
  }

  // 8. Fallback bot.
  const fallback = activeFlows.find((flow) => flow.trigger_type === "fallback");
  const fallbackNode = fallback ? nodesOf(fallback)[0] : null;
  if (fallback && fallbackNode) {
    const plan = planFromNode(fallback, fallbackNode, "chatbot");
    if (plan) return plan;
  }

  return { kind: "none" };
}

function firstTextAction(automation: AutomationFlow): string | null {
  for (const action of automation.actions_json) {
    if (!action || typeof action !== "object") continue;
    const record = action as Record<string, unknown>;
    if (record.type === "send_text" && typeof record.body === "string" && record.body.trim()) {
      return record.body;
    }
  }
  return null;
}
