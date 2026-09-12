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
  /** whatsapp_flows this assistant may offer. Empty means it offers none. */
  form_ids: string[];

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
  /** The service booked, when it came from the appointment menu. */
  appointment_type_id: string | null;
  /** 'whatsapp' means the customer booked it themselves. */
  source: MeetingSource;
  reminder_sent_at: string | null;
  /** The event id in the connected calendar, so a re-push moves it. */
  calendar_event_id: string | null;
  calendar_synced_at: string | null;
  calendar_error: string | null;
  created_at: string;
  updated_at: string;
};

export const MEETING_SOURCES = ["manual", "whatsapp", "api"] as const;
export type MeetingSource = (typeof MEETING_SOURCES)[number];

// --- appointments ---------------------------------------------------------

/** One thing that can be booked: a consultation, a demo, a haircut. */
export type AppointmentType = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  location: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** When the business is open, and what the booking bot says. */
export type AppointmentSettingsRow = {
  org_id: string;
  is_enabled: boolean;
  timezone: string;
  slot_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  horizon_days: number;
  max_per_slot: number;
  /** A weekly pattern keyed by weekday; see lib/appointments.ts. */
  hours: Record<string, Array<{ start: string; end: string }>>;
  trigger_keywords: string[];
  location: string | null;
  greeting: string;
  confirmation: string;
  no_slots_message: string;
  cancelled_message: string;
  /** Hours before the appointment to remind the customer. 0 is off. */
  reminder_hours: number;
  /** An approved template, for reminders outside the 24-hour window. */
  reminder_template: string | null;
  reminder_template_language: string;
  reminder_message: string;
  created_at: string;
  updated_at: string;
};

/** A holiday or an afternoon out — an exception to the weekly pattern. */
export type AppointmentBlackout = {
  id: string;
  org_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
};

/** Where a customer has got to in the booking conversation. */
export type BookingSession = {
  conversation_id: string;
  org_id: string;
  contact_id: string;
  step: "type" | "date" | "time";
  appointment_type_id: string | null;
  chosen_date: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

// --- invoicing -------------------------------------------------------------

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partly_paid",
  "paid",
  "cancelled",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Who is issuing, and how the numbers run. */
export type InvoiceSettings = {
  org_id: string;
  business_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  signature_url: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  upi_id: string | null;
  number_prefix: string;
  /** What the next invoice will take. Claimed and stepped atomically. */
  next_number: number;
  number_padding: number;
  default_terms_days: number;
  default_tax_percent: number;
  round_to_rupee: boolean;
  currency: string;
  timezone: string;
  notes: string | null;
  terms_text: string;
  send_message: string;
  payment_received_message: string;
  reminder_message: string;
  created_at: string;
  updated_at: string;
};

/**
 * An invoice.
 *
 * The customer's details are a snapshot rather than a join: renaming a
 * contact next year must not rewrite what was issued to them last year.
 */
export type Invoice = {
  id: string;
  org_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  recurring_id: string | null;
  /** Null on a draft. Assigned when the invoice is issued. */
  number: string | null;
  status: InvoiceStatus;
  issued_on: string | null;
  due_on: string | null;
  customer_name: string | null;
  customer_gstin: string | null;
  customer_address: string | null;
  customer_state: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  currency: string;
  /** Decides IGST versus CGST+SGST. A property of the sale, so stored. */
  inter_state: boolean;
  subtotal_cents: number;
  discount_cents: number;
  taxable_cents: number;
  cgst_cents: number;
  sgst_cents: number;
  igst_cents: number;
  tax_cents: number;
  round_off_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  paid_at: string | null;
  notes: string | null;
  terms_text: string | null;
  payment_provider: string | null;
  payment_link_url: string | null;
  payment_reference: string | null;
  /** Unguessable, because the page it opens needs no login. */
  public_token: string;
  sent_at: string | null;
  last_reminded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  /** HSN for goods, SAC for services. */
  hsn_code: string | null;
  quantity: number;
  unit_price_cents: number;
  tax_percent: number;
  discount_percent: number;
  taxable_cents: number;
  tax_cents: number;
  total_cents: number;
  sort_order: number;
  created_at: string;
};

/** A schedule that raises the same invoice again. */
export type RecurringInvoice = {
  id: string;
  org_id: string;
  contact_id: string | null;
  title: string;
  interval: "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
  next_run_on: string;
  last_run_on: string | null;
  /** Null runs forever. */
  occurrences_limit: number | null;
  occurrences_done: number;
  is_active: boolean;
  /** Off, a run raises a draft for somebody to look at first. */
  auto_send: boolean;
  terms_days: number;
  notes: string | null;
  items: unknown;
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
  /** The shop's own id, "shopify:12345", for a re-import. */
  external_id: string | null;
  /** The SKU as Meta's commerce catalogue knows it. */
  retailer_id: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
};

// --- commerce --------------------------------------------------------------

export const STORE_ORDER_STATUSES = [
  "pending",
  "awaiting_payment",
  "paid",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export type StoreOrderStatus = (typeof STORE_ORDER_STATUSES)[number];

/** What a customer ordered. Not public.orders, which is what a tenant pays us. */
export type StoreOrder = {
  id: string;
  org_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  /** Ours, short: it goes into Meta's reference_id, capped at 35 characters. */
  reference: string;
  status: StoreOrderStatus;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  payment_provider: string | null;
  payment_link_url: string | null;
  payment_reference: string | null;
  payment_status: string | null;
  paid_at: string | null;
  wa_order_message_id: string | null;
  catalog_id: string | null;
  address: string | null;
  notes: string | null;
  awb: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreOrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  retailer_id: string | null;
  name: string;
  quantity: number;
  unit_price_cents: number;
  currency: string;
  created_at: string;
};

/** How a workspace asks for money, and what it says while doing it. */
export type PaymentSettings = {
  org_id: string;
  method: "link" | "whatsapp";
  link_provider: string | null;
  wa_payment_configuration: string | null;
  wa_payment_gateway: string | null;
  goods_type: "physical" | "digital";
  payment_expiry_minutes: number;
  tax_percent: number;
  shipping_cents: number;
  free_shipping_above_cents: number;
  order_received_message: string;
  payment_request_message: string;
  payment_received_message: string;
  created_at: string;
  updated_at: string;
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
  | "booking"
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
  /** One line on what the form is for. The AI assistant reads it. */
  description: string | null;
  /** The message sent above the form. Null falls back to a generic line. */
  invitation: string | null;
  /** The CTA on the message bubble. 20 characters at most. */
  button_text: string;
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
  /** How it went out: "inbox", "chatbot" or "assistant". */
  source: string;
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

// --- team invitations -----------------------------------------------------

/** One invitation to join a workspace. The token is the capability. */
export type OrgInvite = {
  id: string;
  org_id: string;
  /** Lower-cased on write. */
  email: string;
  role: "admin" | "member";
  token: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  created_at: string;
};
