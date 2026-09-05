// The chatbot flow graph: one shared vocabulary for the visual builder and
// the runtime that executes it. Both read this file, so a node type cannot
// exist in the canvas without the engine knowing how to run it.
//
// `runtime` on each definition is the honest status of that node type. The
// builder shows it, because a canvas that lets you wire up a node which
// silently does nothing is worse than one that says so up front.

export type NodeRuntime =
  | "ready" // executes end to end today
  | "needs_scheduler" // parks the conversation; the scheduler that resumes it is not built
  | "needs_catalog"; // requires a Meta product catalogue we do not sync yet

export type FlowNodeKind =
  // triggers
  | "on_message"
  // sending
  | "send_text"
  | "send_buttons"
  | "send_list"
  | "send_media"
  | "send_template"
  | "send_cta"
  | "send_form"
  | "send_product"
  // asking
  | "ask_question"
  | "ask_location"
  // logic
  | "condition"
  | "delay"
  // data
  | "update_tag"
  | "update_field"
  | "fetch_contact"
  | "http"
  // control
  | "ai_agent"
  | "handoff"
  | "stop_bot";

export type FlowNodeGroup = "Trigger" | "Send" | "Ask" | "Logic" | "Data" | "Control";

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** Which outlet of the source node — a button id, "true"/"false", or null. */
  sourceHandle?: string | null;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface ReplyButton {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

// --- field descriptors the builder renders ---------------------------------

export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "toggle"
  | "keywords"
  | "buttons"
  | "sections"
  | "variable"
  | "numbers";

export interface NodeField {
  name: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  max?: number;
  maxLength?: number;
}

export interface NodeDef {
  kind: FlowNodeKind;
  label: string;
  group: FlowNodeGroup;
  description: string;
  runtime: NodeRuntime;
  /** Why this node is not `ready`, shown in the builder. */
  runtimeNote?: string;
  /** Named outlets. Empty means a single default outlet. */
  handles?: { id: string; label: string }[];
  /** Outlets come from the node's own data (one per button / list row). */
  dynamicHandles?: "buttons" | "rows";
  fields: NodeField[];
  accent: string;
  defaults: Record<string, unknown>;
}

const WA_TEXT_LIMIT = 4096;

export const NODE_DEFS: NodeDef[] = [
  {
    kind: "on_message",
    label: "On Message",
    group: "Trigger",
    description: "Starts the flow when an inbound message matches.",
    runtime: "ready",
    fields: [
      {
        name: "keywords",
        label: "Keywords",
        kind: "keywords",
        hint: "Leave empty to match any message. Comma separated.",
      },
      {
        name: "phoneNumbers",
        label: "Phone Numbers",
        kind: "numbers",
        hint: "Which of your WhatsApp numbers this bot listens on. None ticked means all of them.",
      },
      {
        name: "fuzzy",
        label: "Fuzzy matching",
        kind: "toggle",
        hint: "Also match near-misses and typos, not just whole words.",
      },
      {
        name: "sensitivity",
        label: "Match sensitivity",
        kind: "number",
        hint: "0–100. Higher is stricter. Only used with fuzzy matching.",
      },
    ],
    accent: "#00FF87",
    defaults: { keywords: [], fuzzy: false, sensitivity: 80 },
  },

  // ---------------- Send ----------------
  {
    kind: "send_text",
    label: "Send Text Message",
    group: "Send",
    description: "Sends a plain text message.",
    runtime: "ready",
    fields: [
      { name: "body", label: "Message", kind: "textarea", maxLength: WA_TEXT_LIMIT, placeholder: "Type your message…" },
    ],
    accent: "#00D4FF",
    defaults: { body: "" },
  },
  {
    kind: "send_buttons",
    label: "Send Button Message",
    group: "Send",
    description: "A message with up to three quick-reply buttons. Each button is its own path.",
    runtime: "ready",
    dynamicHandles: "buttons",
    fields: [
      { name: "body", label: "Body text", kind: "textarea", maxLength: 1024, placeholder: "What would you like to do?" },
      { name: "footer", label: "Footer (optional)", kind: "text", maxLength: 60 },
      { name: "buttons", label: "Buttons", kind: "buttons", max: 3, hint: "Max 3, 20 characters each — WhatsApp's limit." },
    ],
    accent: "#00D4FF",
    defaults: { body: "", footer: "", buttons: [] },
  },
  {
    kind: "send_list",
    label: "Send List Message",
    group: "Send",
    description: "A tappable menu of up to ten rows. Each row is its own path.",
    runtime: "ready",
    dynamicHandles: "rows",
    fields: [
      { name: "body", label: "Body text", kind: "textarea", maxLength: 1024 },
      { name: "buttonText", label: "Menu button label", kind: "text", maxLength: 20, placeholder: "View options" },
      { name: "footer", label: "Footer (optional)", kind: "text", maxLength: 60 },
      { name: "sections", label: "Sections and rows", kind: "sections", max: 10 },
    ],
    accent: "#00D4FF",
    defaults: { body: "", buttonText: "View options", footer: "", sections: [] },
  },
  {
    kind: "send_media",
    label: "Send Media Message",
    group: "Send",
    description: "Sends an image, video, document or audio file by URL.",
    runtime: "ready",
    fields: [
      {
        name: "mediaType",
        label: "Type",
        kind: "select",
        options: [
          { value: "image", label: "Image" },
          { value: "video", label: "Video" },
          { value: "document", label: "Document" },
          { value: "audio", label: "Audio" },
        ],
      },
      { name: "url", label: "Media URL", kind: "text", placeholder: "https://…" },
      { name: "caption", label: "Caption (optional)", kind: "textarea", maxLength: 1024 },
      { name: "filename", label: "Filename (documents only)", kind: "text", placeholder: "invoice.pdf" },
    ],
    accent: "#00D4FF",
    defaults: { mediaType: "image", url: "", caption: "", filename: "" },
  },
  {
    kind: "send_template",
    label: "Send Template Message",
    group: "Send",
    description: "Sends an approved template — the only thing allowed outside the 24-hour window.",
    runtime: "ready",
    fields: [
      { name: "templateName", label: "Template name", kind: "text", placeholder: "order_update" },
      { name: "language", label: "Language code", kind: "text", placeholder: "en_US" },
    ],
    accent: "#00D4FF",
    defaults: { templateName: "", language: "en_US" },
  },
  {
    kind: "send_cta",
    label: "Send CTA Message",
    group: "Send",
    description: "A message with a button that opens a link.",
    runtime: "ready",
    fields: [
      { name: "body", label: "Body text", kind: "textarea", maxLength: 1024 },
      { name: "buttonText", label: "Button label", kind: "text", maxLength: 20, placeholder: "Visit order details" },
      { name: "url", label: "URL", kind: "text", placeholder: "https://…" },
      { name: "footer", label: "Footer (optional)", kind: "text", maxLength: 60 },
    ],
    accent: "#00D4FF",
    defaults: { body: "", buttonText: "", url: "", footer: "" },
  },
  {
    kind: "send_form",
    label: "Send Form",
    group: "Send",
    description: "Opens a WhatsApp Form inside the chat and records the answers.",
    runtime: "ready",
    fields: [
      { name: "formId", label: "Form name or id", kind: "text", placeholder: "Book an appointment" },
      { name: "body", label: "Body text", kind: "textarea", maxLength: 1024 },
      { name: "buttonText", label: "Button label", kind: "text", maxLength: 20, placeholder: "Open form" },
      { name: "footer", label: "Footer (optional)", kind: "text", maxLength: 60 },
    ],
    accent: "#25D366",
    defaults: { formId: "", body: "", buttonText: "Open form", footer: "" },
  },
  {
    kind: "send_product",
    label: "Send Product Message",
    group: "Send",
    description: "Shares a product from your Meta catalogue.",
    runtime: "needs_catalog",
    runtimeNote:
      "Requires a Meta commerce catalogue linked to your WABA. Products created on the Commerce screen are not yet synced to Meta, so this node will not send.",
    fields: [
      { name: "catalogId", label: "Catalog ID", kind: "text" },
      { name: "retailerId", label: "Product retailer ID", kind: "text" },
      { name: "body", label: "Body text", kind: "textarea", maxLength: 1024 },
    ],
    accent: "#A855F7",
    defaults: { catalogId: "", retailerId: "", body: "" },
  },

  // ---------------- Ask ----------------
  {
    kind: "ask_question",
    label: "Ask Question",
    group: "Ask",
    description: "Sends a question and waits for the reply, saving it to a variable.",
    runtime: "ready",
    fields: [
      { name: "body", label: "Question", kind: "textarea", maxLength: 1024, placeholder: "What's your email address?" },
      { name: "variable", label: "Save answer as", kind: "variable", placeholder: "email" },
      {
        name: "expect",
        label: "Expected answer",
        kind: "select",
        options: [
          { value: "any", label: "Anything" },
          { value: "number", label: "A number" },
          { value: "email", label: "An email address" },
          { value: "phone", label: "A phone number" },
        ],
      },
      { name: "retry", label: "If it doesn't match, say", kind: "text", placeholder: "That doesn't look right — try again?" },
    ],
    accent: "#FACC15",
    defaults: { body: "", variable: "answer", expect: "any", retry: "" },
  },
  {
    kind: "ask_location",
    label: "Ask Location",
    group: "Ask",
    description: "Asks the customer to share their location and waits for it.",
    runtime: "ready",
    fields: [
      { name: "body", label: "Message", kind: "textarea", maxLength: 1024, placeholder: "Please share your delivery location." },
      { name: "variable", label: "Save location as", kind: "variable", placeholder: "location" },
    ],
    accent: "#FACC15",
    defaults: { body: "", variable: "location" },
  },

  // ---------------- Logic ----------------
  {
    kind: "condition",
    label: "Condition",
    group: "Logic",
    description: "Splits the flow on a variable, tag or contact field.",
    runtime: "ready",
    handles: [
      { id: "true", label: "Yes" },
      { id: "false", label: "No" },
    ],
    fields: [
      { name: "left", label: "Check", kind: "variable", placeholder: "email", hint: "A variable name, or contact.name / contact.tags" },
      {
        name: "operator",
        label: "Is",
        kind: "select",
        options: [
          { value: "equals", label: "equal to" },
          { value: "not_equals", label: "not equal to" },
          { value: "contains", label: "containing" },
          { value: "exists", label: "set at all" },
          { value: "gt", label: "greater than" },
          { value: "lt", label: "less than" },
        ],
      },
      { name: "right", label: "Value", kind: "text" },
    ],
    accent: "#A855F7",
    defaults: { left: "", operator: "equals", right: "" },
  },
  {
    kind: "delay",
    label: "Delay",
    group: "Logic",
    description: "Waits before continuing.",
    runtime: "ready",
    runtimeNote:
      "Up to 10 seconds runs inline. Anything longer parks the conversation and a scheduled job resumes it, so the wait is accurate to about a minute rather than to the second.",
    fields: [
      { name: "value", label: "Wait for", kind: "number" },
      {
        name: "unit",
        label: "Unit",
        kind: "select",
        options: [
          { value: "seconds", label: "Seconds" },
          { value: "minutes", label: "Minutes" },
          { value: "hours", label: "Hours" },
        ],
      },
    ],
    accent: "#A855F7",
    defaults: { value: 5, unit: "seconds" },
  },

  // ---------------- Data ----------------
  {
    kind: "update_tag",
    label: "Update Tag",
    group: "Data",
    description: "Adds or removes tags on the contact.",
    runtime: "ready",
    fields: [
      {
        name: "action",
        label: "Action",
        kind: "select",
        options: [
          { value: "add", label: "Add tags" },
          { value: "remove", label: "Remove tags" },
        ],
      },
      { name: "tags", label: "Tags", kind: "keywords", hint: "Comma separated." },
    ],
    accent: "#00FF87",
    defaults: { action: "add", tags: [] },
  },
  {
    kind: "update_field",
    label: "Update Contact",
    group: "Data",
    description: "Writes a value onto the contact record.",
    runtime: "ready",
    fields: [
      {
        name: "field",
        label: "Field",
        kind: "select",
        options: [{ value: "name", label: "Name" }],
      },
      { name: "value", label: "Value", kind: "text", hint: "Use {{variable}} to insert an answer." },
    ],
    accent: "#00FF87",
    defaults: { field: "name", value: "" },
  },
  {
    kind: "fetch_contact",
    label: "Fetch Contact",
    group: "Data",
    description: "Loads the contact's saved details into variables for later nodes.",
    runtime: "ready",
    fields: [
      { name: "prefix", label: "Variable prefix", kind: "variable", placeholder: "contact" },
    ],
    accent: "#00FF87",
    defaults: { prefix: "contact" },
  },
  {
    kind: "http",
    label: "HTTP Request",
    group: "Data",
    description: "Calls an external URL and saves the response — this is how you reach any other system.",
    runtime: "ready",
    fields: [
      {
        name: "method",
        label: "Method",
        kind: "select",
        options: [
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
        ],
      },
      { name: "url", label: "URL", kind: "text", placeholder: "https://…" },
      { name: "body", label: "JSON body", kind: "textarea", hint: "Use {{variable}} to insert answers." },
      { name: "variable", label: "Save response as", kind: "variable", placeholder: "response" },
    ],
    accent: "#00FF87",
    defaults: { method: "POST", url: "", body: "", variable: "response" },
  },

  // ---------------- Control ----------------
  {
    kind: "ai_agent",
    label: "AI Agent",
    group: "Control",
    description: "Hands the reply to your AI assistant for this turn.",
    runtime: "ready",
    fields: [
      { name: "instructions", label: "Extra instructions (optional)", kind: "textarea", hint: "Added on top of the assistant's own system prompt." },
    ],
    accent: "#A855F7",
    defaults: { instructions: "" },
  },
  {
    kind: "handoff",
    label: "Handoff to Human",
    group: "Control",
    description: "Pauses the bot and flags the conversation for an agent.",
    runtime: "ready",
    fields: [
      { name: "body", label: "Message to send (optional)", kind: "textarea", placeholder: "Connecting you to a team member…" },
    ],
    accent: "#F87171",
    defaults: { body: "" },
  },
  {
    kind: "stop_bot",
    label: "Stop Chatbot",
    group: "Control",
    description: "Ends the flow. The next message is matched from scratch.",
    runtime: "ready",
    fields: [],
    accent: "#F87171",
    defaults: {},
  },
];

export function nodeDef(kind: FlowNodeKind): NodeDef | undefined {
  return NODE_DEFS.find((d) => d.kind === kind);
}

export const NODE_GROUPS: FlowNodeGroup[] = ["Trigger", "Send", "Ask", "Logic", "Data", "Control"];

export const RUNTIME_LABEL: Record<NodeRuntime, string> = {
  ready: "Works now",
  needs_scheduler: "Needs the scheduler",
  needs_catalog: "Needs a Meta catalogue",
};
