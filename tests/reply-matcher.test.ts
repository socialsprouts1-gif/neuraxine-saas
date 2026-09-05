import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  containsKeyword,
  extractInboundText,
  normalise,
  planReply,
  scoreFaq,
  type AutomationFlow,
  type RunnerResources,
} from "../src/lib/reply-matcher.ts";
import { triggerListensOn } from "../src/lib/trigger-scope.ts";
import type { FlowNode } from "../src/types/flow.ts";
import type { AiAssistant, ChatbotFlow, LegacyChatbotNode, FaqEntry } from "../src/types/portal.ts";

// Run with: npm test
//
// The matcher decides what every customer of every tenant gets replied to
// with. Its priority order and its keyword boundaries are the two things
// most likely to be broken by a later change, so both are pinned here.

// --- fixtures -------------------------------------------------------------

// The matcher only ever sees legacy flat nodes — graph flows are executed
// by flow-runner — so the fixture casts through the stored jsonb shape
// rather than pretending a LegacyChatbotNode is a FlowNode.
function flow(
  overrides: Partial<Omit<ChatbotFlow, "nodes">> & {
    id: string;
    name: string;
    nodes?: LegacyChatbotNode[];
  }
): ChatbotFlow {
  return {
    org_id: "org",
    connection_id: null,
    description: null,
    trigger_type: "keyword",
    trigger_value: null,
    edges: [],
    entry_node_id: null,
    is_active: true,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
    nodes: (overrides.nodes ?? []) as unknown as ChatbotFlow["nodes"],
  };
}

function node(overrides: Partial<LegacyChatbotNode> & { id: string; body: string }): LegacyChatbotNode {
  return { type: "message", ...overrides };
}

function faq(overrides: Partial<FaqEntry> & { id: string; question: string; answer: string }): FaqEntry {
  return {
    org_id: "org",
    keywords: [],
    category: null,
    hit_count: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function assistant(overrides: Partial<AiAssistant> & { id: string; name: string }): AiAssistant {
  return {
    org_id: "org",
    connection_id: null,
    role: "Support agent",
    provider: "anthropic",
    model: "claude-sonnet-5",
    api_key_encrypted: null,
    api_base_url: null,
    system_prompt: "",
    prompt_preset: "custom",
    temperature: 0.7,
    max_tokens: 1024,
    handoff_keywords: [],
    is_active: true,
    memory_turns: 20,
    use_knowledge_base: true,
    stop_on_human: true,
    working_hours_enabled: false,
    working_hours_timezone: "UTC",
    working_hours_start: "09:00",
    working_hours_end: "18:00",
    working_days: [1, 2, 3, 4, 5],
    off_hours_message: "",
    followup_enabled: false,
    followup_delay_minutes: 60,
    followup_message: "",
    max_followups: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function automation(
  overrides: Partial<AutomationFlow> & { id: string; name: string }
): AutomationFlow {
  return {
    org_id: "org",
    connection_id: null,
    trigger_type: "keyword",
    trigger_config: {},
    actions_json: [],
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function resources(overrides: Partial<RunnerResources> = {}): RunnerResources {
  return {
    flows: [],
    faqs: [],
    automations: [],
    assistants: [],
    isFirstMessage: false,
    activeFlow: null,
    activeNodeId: null,
    ...overrides,
  };
}

// --- normalisation --------------------------------------------------------

test("normalise strips case, punctuation and extra whitespace", () => {
  assert.equal(normalise("  PRICE?? "), "price");
  assert.equal(normalise("How much,   exactly!"), "how much exactly");
});

test("normalise keeps non-Latin scripts intact", () => {
  assert.equal(normalise("कीमत क्या है?"), "कीमत क्या है");
});

test("containsKeyword matches whole words only", () => {
  assert.equal(containsKeyword(normalise("hi there"), "hi"), true);
  // The classic false positive: "hi" inside "this".
  assert.equal(containsKeyword(normalise("is this working"), "hi"), false);
  assert.equal(containsKeyword(normalise("what is the price"), "price"), true);
  assert.equal(containsKeyword(normalise("pricing page"), "price"), false);
});

test("a Hindi keyword matches a Hindi message end to end", () => {
  const plan = planReply(
    { text: "कीमत क्या है?" },
    resources({
      flows: [
        flow({
          id: "c1",
          name: "कीमत",
          trigger_value: "कीमत",
          nodes: [node({ id: "n1", body: "हमारे प्लान ₹999 से शुरू होते हैं।" })],
        }),
      ],
    })
  );

  assert.equal(plan.kind, "chatbot");
});

test("containsKeyword handles multi-word keywords", () => {
  assert.equal(containsKeyword(normalise("I want to talk to a human please"), "talk to a human"), true);
  assert.equal(containsKeyword(normalise("human"), "talk to a human"), false);
});

// --- inbound extraction ---------------------------------------------------

test("extractInboundText reads text, buttons and captions", () => {
  assert.deepEqual(extractInboundText("text", { body: "hello" }), {
    text: "hello",
    buttonId: null,
  });

  assert.deepEqual(
    extractInboundText("interactive", { button_reply: { id: "flow:0", title: "See plans" } }),
    { text: "See plans", buttonId: "flow:0" }
  );

  assert.deepEqual(
    extractInboundText("interactive", { list_reply: { id: "row_2", title: "Track order" } }),
    { text: "Track order", buttonId: "row_2" }
  );

  assert.deepEqual(extractInboundText("button", { text: "Yes", payload: "CONFIRM" }), {
    text: "Yes",
    buttonId: "CONFIRM",
  });

  assert.deepEqual(extractInboundText("image", { caption: "is this in stock?" }), {
    text: "is this in stock?",
    buttonId: null,
  });

  // An image with no caption gives the matcher nothing to work with.
  assert.deepEqual(extractInboundText("image", { id: "media-1" }), { text: "", buttonId: null });
});

// --- FAQ scoring ----------------------------------------------------------

test("scoreFaq rewards a configured keyword hit", () => {
  const entry = faq({
    id: "f1",
    question: "How long does delivery take?",
    answer: "3-5 days.",
    keywords: ["delivery"],
  });
  assert.ok(scoreFaq(normalise("when is delivery"), entry) >= 3);
});

test("scoreFaq stays low for an unrelated message", () => {
  const entry = faq({
    id: "f1",
    question: "How long does delivery take?",
    answer: "3-5 days.",
    keywords: ["delivery", "shipping"],
  });
  assert.ok(scoreFaq(normalise("do you have red shoes"), entry) < 3);
});

// --- priority order -------------------------------------------------------

test("a handoff keyword beats every bot", () => {
  const plan = planReply(
    { text: "please connect me to an agent" },
    resources({
      assistants: [assistant({ id: "a1", name: "Nova", handoff_keywords: ["agent", "human"] })],
      faqs: [faq({ id: "f1", question: "Agent hours?", answer: "9-5", keywords: ["agent"] })],
      flows: [
        flow({
          id: "c1",
          name: "Agent bot",
          trigger_value: "agent",
          nodes: [node({ id: "n1", body: "Our agents are great." })],
        }),
      ],
    })
  );

  assert.equal(plan.kind, "handoff");
  assert.equal(plan.kind === "handoff" && plan.id, "a1");
});

test("a keyword chatbot beats the FAQ bot", () => {
  const plan = planReply(
    { text: "what is the price?" },
    resources({
      flows: [
        flow({
          id: "c1",
          name: "Pricing bot",
          trigger_value: "price",
          nodes: [node({ id: "n1", body: "Plans start at ₹999.", buttons: ["See plans"] })],
        }),
      ],
      faqs: [
        faq({ id: "f1", question: "What is the price?", answer: "It varies.", keywords: ["price"] }),
      ],
    })
  );

  assert.equal(plan.kind, "chatbot");
  assert.equal(plan.kind === "chatbot" && plan.body, "Plans start at ₹999.");
  // Offering buttons means the next message can continue this flow.
  assert.equal(plan.kind === "chatbot" && plan.nextNodeId, "n1");
});

test("a chatbot with no buttons and no next does not park the conversation", () => {
  const plan = planReply(
    { text: "price" },
    resources({
      flows: [
        flow({
          id: "c1",
          name: "Pricing bot",
          trigger_value: "price",
          nodes: [node({ id: "n1", body: "Plans start at ₹999." })],
        }),
      ],
    })
  );

  assert.equal(plan.kind === "chatbot" && plan.nextNodeId, null);
});

test("the FAQ bot beats a keyword automation", () => {
  const plan = planReply(
    { text: "how long does delivery take" },
    resources({
      faqs: [
        faq({
          id: "f1",
          question: "How long does delivery take?",
          answer: "3-5 working days.",
          keywords: ["delivery"],
        }),
      ],
      automations: [
        automation({
          id: "au1",
          name: "Delivery automation",
          trigger_config: { keyword: "delivery" },
          actions_json: [{ type: "send_text", body: "We deliver." }],
        }),
      ],
    })
  );

  assert.equal(plan.kind, "faq");
  assert.equal(plan.kind === "faq" && plan.body, "3-5 working days.");
});

test("an automation answers when no chatbot or FAQ matched", () => {
  const plan = planReply(
    { text: "refund please" },
    resources({
      automations: [
        automation({
          id: "au1",
          name: "Refunds",
          trigger_config: { keyword: "refund" },
          actions_json: [{ type: "send_text", body: "Refunds take 5 days." }],
        }),
      ],
    })
  );

  assert.equal(plan.kind, "automation");
  assert.equal(plan.kind === "automation" && plan.body, "Refunds take 5 days.");
});

test("an automation with no send_text action is skipped rather than replying blank", () => {
  const plan = planReply(
    { text: "refund please" },
    resources({
      automations: [
        automation({
          id: "au1",
          name: "Refunds",
          trigger_config: { keyword: "refund" },
          actions_json: [{ type: "add_tag", tag: "refund" }],
        }),
      ],
    })
  );

  assert.equal(plan.kind, "none");
});

test("the assistant catches anything the rules missed", () => {
  const plan = planReply(
    { text: "do you ship to Nagpur on Sundays" },
    resources({ assistants: [assistant({ id: "a1", name: "Nova" })] })
  );

  assert.equal(plan.kind, "assistant");
  assert.equal(plan.kind === "assistant" && plan.id, "a1");
});

test("an inactive assistant is not selected", () => {
  const plan = planReply(
    { text: "anything at all" },
    resources({ assistants: [assistant({ id: "a1", name: "Nova", is_active: false })] })
  );

  assert.equal(plan.kind, "none");
});

test("the fallback bot sits below the assistant", () => {
  const fallback = flow({
    id: "c1",
    name: "Fallback",
    trigger_type: "fallback",
    trigger_value: null,
    nodes: [node({ id: "n1", body: "Sorry, I didn't catch that." })],
  });

  const withAssistant = planReply(
    { text: "something unmatched" },
    resources({ flows: [fallback], assistants: [assistant({ id: "a1", name: "Nova" })] })
  );
  assert.equal(withAssistant.kind, "assistant");

  const withoutAssistant = planReply({ text: "something unmatched" }, resources({ flows: [fallback] }));
  assert.equal(withoutAssistant.kind, "chatbot");
  assert.equal(withoutAssistant.kind === "chatbot" && withoutAssistant.body, "Sorry, I didn't catch that.");
});

// --- welcome --------------------------------------------------------------

test("the welcome bot fires only on a first message", () => {
  const welcome = flow({
    id: "c1",
    name: "Welcome",
    trigger_type: "welcome",
    trigger_value: null,
    nodes: [node({ id: "n1", body: "Hi! Welcome to UMM Clothing." })],
  });

  assert.equal(planReply({ text: "hey" }, resources({ flows: [welcome], isFirstMessage: true })).kind, "chatbot");
  assert.equal(planReply({ text: "hey" }, resources({ flows: [welcome], isFirstMessage: false })).kind, "none");
});

test("a first message with no text still gets the welcome", () => {
  const welcome = flow({
    id: "c1",
    name: "Welcome",
    trigger_type: "welcome",
    trigger_value: null,
    nodes: [node({ id: "n1", body: "Hi there!" })],
  });

  const plan = planReply({ text: "" }, resources({ flows: [welcome], isFirstMessage: true }));
  assert.equal(plan.kind, "chatbot");
});

// --- flow continuation ----------------------------------------------------

test("a tapped button advances a branching flow", () => {
  const branching = flow({
    id: "c1",
    name: "Menu",
    trigger_type: "menu",
    trigger_value: "menu",
    nodes: [
      node({
        id: "n1",
        body: "What do you need?",
        buttons: ["See plans", "Talk to sales"],
        button_next: { "See plans": "n2" },
      }),
      node({ id: "n2", body: "Our plans start at ₹999." }),
    ],
  });

  const plan = planReply(
    { text: "See plans", buttonId: "c1:0" },
    resources({ flows: [branching], activeFlow: branching, activeNodeId: "n1" })
  );

  assert.equal(plan.kind, "flow_step");
  assert.equal(plan.kind === "flow_step" && plan.body, "Our plans start at ₹999.");
  // The destination is a dead end, so the flow ends here.
  assert.equal(plan.kind === "flow_step" && plan.nextNodeId, null);
});

test("a button with no branch target falls through to ordinary matching", () => {
  const menu = flow({
    id: "c1",
    name: "Menu",
    trigger_type: "menu",
    trigger_value: "menu",
    nodes: [node({ id: "n1", body: "What do you need?", buttons: ["Pricing"] })],
  });
  const pricing = flow({
    id: "c2",
    name: "Pricing bot",
    trigger_value: "pricing",
    nodes: [node({ id: "p1", body: "₹999 a month." })],
  });

  const plan = planReply(
    { text: "Pricing", buttonId: "c1:0" },
    resources({ flows: [menu, pricing], activeFlow: menu, activeNodeId: "n1" })
  );

  assert.equal(plan.kind, "chatbot");
  assert.equal(plan.kind === "chatbot" && plan.id, "c2");
});

test("an unconditional next advances a flow with no buttons", () => {
  const linear = flow({
    id: "c1",
    name: "Onboarding",
    trigger_type: "welcome",
    trigger_value: null,
    nodes: [
      node({ id: "n1", body: "Step one.", next: "n2" }),
      node({ id: "n2", body: "Step two." }),
    ],
  });

  const plan = planReply(
    { text: "ok" },
    resources({ flows: [linear], activeFlow: linear, activeNodeId: "n1" })
  );

  assert.equal(plan.kind, "flow_step");
  assert.equal(plan.kind === "flow_step" && plan.body, "Step two.");
});

// --- inactive configuration -----------------------------------------------

test("a paused bot never matches", () => {
  const plan = planReply(
    { text: "price" },
    resources({
      flows: [
        flow({
          id: "c1",
          name: "Pricing bot",
          trigger_value: "price",
          is_active: false,
          nodes: [node({ id: "n1", body: "₹999." })],
        }),
      ],
    })
  );

  assert.equal(plan.kind, "none");
});

test("an inactive FAQ entry never matches", () => {
  const plan = planReply(
    { text: "delivery time" },
    resources({
      faqs: [
        faq({
          id: "f1",
          question: "How long does delivery take?",
          answer: "3-5 days.",
          keywords: ["delivery"],
          is_active: false,
        }),
      ],
    })
  );

  assert.equal(plan.kind, "none");
});

test("nothing configured means nothing is sent", () => {
  assert.equal(planReply({ text: "hello" }, resources()).kind, "none");
});

// A trigger can be limited to some of the workspace's numbers. Getting this
// wrong means a bot answering on a number it was told to stay off.

test("an unrestricted trigger listens on every number", () => {
  const node = { id: "t", kind: "on_message", data: {} } as unknown as FlowNode;
  assert.equal(triggerListensOn(node, "conn-a"), true);
  assert.equal(triggerListensOn(node, null), true);
});

test("a restricted trigger only listens on its own numbers", () => {
  const node = {
    id: "t",
    kind: "on_message",
    data: { phoneNumbers: ["conn-a", "conn-b"] },
  } as unknown as FlowNode;

  assert.equal(triggerListensOn(node, "conn-a"), true);
  assert.equal(triggerListensOn(node, "conn-b"), true);
  assert.equal(triggerListensOn(node, "conn-c"), false);
  // A conversation with no number recorded must not slip past a restriction.
  assert.equal(triggerListensOn(node, null), false);
});

test("an empty list is treated as no restriction, not as nothing", () => {
  const node = { id: "t", kind: "on_message", data: { phoneNumbers: [] } } as unknown as FlowNode;
  assert.equal(triggerListensOn(node, "conn-a"), true);
});
