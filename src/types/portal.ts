// Types for the portal modules
// (supabase/migrations/20260820180000_portal_modules.sql).
//
// Declared as type aliases rather than interfaces: supabase-js constrains
// table Row/Insert/Update to Record<string, unknown>, and an interface has
// no implicit index signature, which silently degrades every query on the
// table to `never`.

export type AiAssistant = {
  id: string;
  org_id: string;
  /** Pin this to one WhatsApp number; null means any of them. */
  connection_id: string | null;
  name: string;
  role: string;
  /** ProviderId from @/lib/ai-providers. Widened to string because the DB
   *  column is text and a row written by an older build can hold anything. */
  provider: string;
  model: string;
  /** AES-256-GCM envelope. Never leaves the server; the editor sees a mask. */
  api_key_encrypted: string | null;
  api_base_url: string | null;
  system_prompt: string;
  prompt_preset: string;
  temperature: number;
  max_tokens: number;
  handoff_keywords: string[];
  is_active: boolean;

  // Agent rules — memory & knowledge
  memory_turns: number;
  use_knowledge_base: boolean;
  stop_on_human: boolean;

  // Agent rules — working hours. Times are 'HH:MM'; working_days uses
  // JavaScript's getDay() numbering, 0 = Sunday.
  working_hours_enabled: boolean;
  working_hours_timezone: string;
  working_hours_start: string;
  working_hours_end: string;
  working_days: number[];
  off_hours_message: string;

  // Agent rules — follow-up
  followup_enabled: boolean;
  followup_delay_minutes: number;
  followup_message: string;
  max_followups: number;

  created_at: string;
  updated_at: string;
};

export const KNOWLEDGE_SOURCE_TYPES = ["text", "faq", "url", "file"] as const;
export const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "demo",
  "proposal",
  "won",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const AI_MODES = ["ai", "copilot", "human"] as const;
export type AiMode = (typeof AI_MODES)[number];

export const PRIORITIES = ["normal", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** A private note between agents. The customer never sees one. */
export type ConversationNote = {
  id: string;
  org_id: string;
  conversation_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
};

/** One line of the activity timeline. Append-only by design. */
export type ConversationEvent = {
  id: string;
  org_id: string;
  conversation_id: string;
  kind: string;
  label: string;
  actor_id: string | null;
  created_at: string;
};

/** A drip step: which template, and how long after the one before it. */
export type CampaignStep = {
  id: string;
  org_id: string;
  campaign_id: string;
  template_id: string | null;
  step_index: number;
  delay_hours: number;
  variables: string[];
  created_at: string;
};

export const MEETING_STATUSES = ["scheduled", "completed", "cancelled", "no_show"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/** An appointment with a contact — a commitment, not a nudge. */
export type Meeting = {
  id: string;
  org_id: string;
  contact_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  title: string;
  notes: string | null;
  location: string | null;
  starts_at: string;
  duration_minutes: number;
  status: MeetingStatus;
  created_at: string;
  updated_at: string;
};

export const TRANSACTION_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Money between the business and its own customers, not the platform. */
export type Transaction = {
  id: string;
  org_id: string;
  contact_id: string | null;
  created_by: string | null;
  amount_cents: number;
  currency: string;
  direction: "in" | "out";
  status: TransactionStatus;
  method: string | null;
  reference: string | null;
  note: string | null;
  occurred_at: string;
  created_at: string;
};

/** The readable identity behind a user id, for assignment and authorship. */
export type Profile = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

/** One thing the assistant is allowed to know. A null assistant_id means the
 *  entry is shared by every assistant in the org. */
export type AssistantKnowledge = {
  id: string;
  org_id: string;
  assistant_id: string | null;
  title: string;
  content: string;
  source_type: KnowledgeSourceType;
  source_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

import type { FlowEdge, FlowNode } from "./flow";

export type ChatbotTrigger = "keyword" | "welcome" | "fallback" | "menu" | "business_hours";

/**
 * The pre-builder node shape: a single reply with optional button labels,
 * stored flat. Flows created before the visual builder still hold these, and
 * the builder page migrates them on open rather than in a data migration —
 * a graph position is a UI concern and cannot be chosen in SQL.
 */
export type LegacyChatbotNode = {
  id: string;
  type: string;
  body: string;
  buttons?: string[];
  next?: string | null;
  /**
   * Branching: maps a quick-reply button's label to the node it leads to.
   * The simple builder does not author this — a flow without it sends one
   * node and lets the tapped label fall through to ordinary matching.
   */
  button_next?: Record<string, string>;
};

export type ChatbotFlow = {
  id: string;
  org_id: string;
  /** Pin this to one WhatsApp number; null means any of them. */
  connection_id: string | null;
  name: string;
  description: string | null;
  trigger_type: ChatbotTrigger;
  trigger_value: string | null;
  nodes: FlowNode[];
  edges: FlowEdge[];
  entry_node_id: string | null;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type FaqEntry = {
  id: string;
  org_id: string;
  question: string;
  answer: string;
  keywords: string[];
  category: string | null;
  hit_count: number;
  is_active: boolean;
  created_at: string;
};

export type ReminderStatus = "pending" | "sent" | "cancelled" | "failed";

export type Reminder = {
  id: string;
  org_id: string;
  contact_id: string | null;
  /** Set when the reminder was raised from a thread in the inbox. */
  conversation_id: string | null;
  created_by: string | null;
  title: string;
  body: string | null;
  remind_at: string;
  status: ReminderStatus;
  created_at: string;
};

export type IntegrationStatus = "connected" | "disconnected" | "error" | "pending";

export type OrgIntegration = {
  id: string;
  org_id: string;
  provider: string;
  status: IntegrationStatus;
  credentials_encrypted: string | null;
  config: Record<string, string>;
  last_error: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiKey = {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  created_by: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type OutgoingWebhook = {
  id: string;
  org_id: string;
  name: string;
  target_url: string;
  events: string[];
  secret: string;
  is_active: boolean;
  created_at: string;
};

export type WebhookDelivery = {
  id: string;
  webhook_id: string;
  org_id: string;
  event: string;
  status_code: number | null;
  error: string | null;
  created_at: string;
};

export type MediaAsset = {
  id: string;
  org_id: string;
  name: string;
  url: string;
  media_type: "image" | "video" | "document" | "audio";
  mime_type: string | null;
  size_bytes: number | null;
  /**
   * Object key in the media bucket. Null when the asset was added by pasting
   * an external URL — we do not own that file and must not try to delete it.
   */
  storage_path: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  org_id: string;
  name: string;
  sku: string | null;
  description: string | null;
  price_cents: number;
  currency: string;
  image_url: string | null;
  stock: number | null;
  is_active: boolean;
  created_at: string;
};

// Models offered when creating an AI assistant. Kept here so the option list
// and the stored value can never drift apart.
// --- message runner -------------------------------------------------------

export type BotMatchKind =
  | "flow_step"
  | "chatbot"
  | "faq"
  | "automation"
  | "assistant"
  | "handoff"
  | "none";

export type BotRunOutcome = "replied" | "skipped" | "handoff" | "failed";

export type BotRun = {
  id: string;
  org_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  inbound_wa_message_id: string | null;
  inbound_text: string | null;
  matched_kind: BotMatchKind;
  matched_id: string | null;
  matched_label: string | null;
  node_id: string | null;
  node_kind: string | null;
  reply_text: string | null;
  outcome: BotRunOutcome;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
};

// --- manage workspace -----------------------------------------------------

export type CannedMessage = {
  id: string;
  org_id: string;
  shortcut: string;
  title: string;
  body: string;
  use_count: number;
  created_at: string;
};

export type ContactGroup = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  colour: string;
  created_at: string;
};

export type ContactGroupMember = {
  group_id: string;
  contact_id: string;
  org_id: string;
  added_at: string;
};

export type ContactColumnType = "text" | "number" | "date" | "select" | "boolean";

export type ContactColumn = {
  id: string;
  org_id: string;
  key: string;
  label: string;
  field_type: ContactColumnType;
  options: string[];
  created_at: string;
};

export const COLUMN_TYPES: { value: ContactColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Choice" },
  { value: "boolean", label: "Yes / No" },
];

// --- WhatsApp Flows -------------------------------------------------------

export type FlowStatus = "draft" | "published" | "deprecated" | "blocked" | "throttled";

/** A form as this app holds it, before it becomes Flow JSON at Meta. */
export type WhatsappFlow = {
  id: string;
  org_id: string;
  name: string;
  meta_flow_id: string | null;
  categories: string[];
  status: FlowStatus;
  screens: unknown;
  validation_errors: unknown;
  preview_url: string | null;
  preview_expires_at: string | null;
  last_synced_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** One form handed to one person; the token is how the reply finds its way back. */
export type FlowSend = {
  id: string;
  org_id: string;
  flow_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  wa_id: string;
  flow_token: string;
  wa_message_id: string | null;
  created_at: string;
};

export type FlowResponse = {
  id: string;
  org_id: string;
  flow_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  wa_id: string | null;
  flow_token: string | null;
  answers: Record<string, unknown>;
  created_at: string;
};
