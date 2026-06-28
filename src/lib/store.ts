/**
 * In-memory data store for the WhatsApp automation SaaS.
 *
 * This is a pragmatic MVP datastore: a singleton kept on `globalThis` so it
 * survives Next.js hot-reloads in dev and stays warm across requests in a
 * single server instance. It is seeded with realistic demo data so the product
 * is fully explorable immediately.
 *
 * NOTE: this is process-memory only. On serverless (Vercel) writes persist
 * within a warm instance but reset on cold starts. Swap this module for a real
 * database (Postgres/Supabase) for production — the exported functions form the
 * data-access boundary the rest of the app depends on.
 */

import { randomUUID } from "node:crypto";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type ContactStatus = "lead" | "active" | "customer" | "blocked";

export interface Contact {
  id: string;
  name: string;
  phone: string; // wa_id, international digits only
  email?: string;
  tags: string[];
  status: ContactStatus;
  createdAt: string;
  lastActiveAt: string;
  attributes: Record<string, string>;
}

export type MessageDirection = "in" | "out";
export type MessageStatusValue =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface Message {
  id: string;
  conversationId: string;
  contactId: string;
  direction: MessageDirection;
  type: string;
  text: string;
  status: MessageStatusValue;
  timestamp: string;
  wamid?: string;
  templateName?: string;
  /** How an outbound message was produced. */
  via?: "manual" | "automation" | "campaign" | "flow";
  error?: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  status: "open" | "closed";
  unread: number;
  lastMessageAt: string;
  lastMessagePreview: string;
  assignedTo?: string;
}

export type TemplateCategory = "marketing" | "utility" | "authentication";
export type TemplateStatus = "approved" | "pending" | "rejected";

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  status: TemplateStatus;
  body: string;
  variableCount: number;
  createdAt: string;
}

export interface CampaignStats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  clicked: number;
}

export interface Campaign {
  id: string;
  name: string;
  type: "broadcast" | "drip" | "trigger";
  status: "draft" | "scheduled" | "sending" | "sent" | "paused";
  templateName?: string;
  audienceTag?: string;
  recipientCount: number;
  stats: CampaignStats;
  createdAt: string;
  scheduledAt?: string;
}

export type RuleTriggerType = "keyword" | "welcome" | "default";

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: RuleTriggerType;
  keywords: string[];
  matchType: "contains" | "exact" | "starts_with";
  responseType: "text" | "template";
  responseText?: string;
  responseTemplate?: string;
  priority: number;
  triggeredCount: number;
  createdAt: string;
}

export interface FlowStep {
  delayMinutes: number;
  message: string;
}

export interface Flow {
  id: string;
  name: string;
  enabled: boolean;
  trigger: "on_inbound" | "on_new_contact" | "keyword";
  keywords: string[];
  steps: FlowStep[];
  enrolledCount: number;
  completedCount: number;
  createdAt: string;
}

export interface ScheduledJob {
  id: string;
  flowId: string;
  flowName: string;
  contactId: string;
  stepIndex: number;
  message: string;
  runAt: string;
  status: "pending" | "done" | "cancelled";
}

export interface Integration {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  connected: boolean;
  connectedAt?: string;
}

export interface Settings {
  businessName: string;
  businessEmail: string;
  website: string;
  whatsappNumber: string;
  autoReplyEnabled: boolean;
  sandboxMode: boolean;
}

export interface ActivityEvent {
  id: string;
  type: string;
  text: string;
  timestamp: string;
}

interface DB {
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  templates: Template[];
  campaigns: Campaign[];
  rules: AutomationRule[];
  flows: Flow[];
  jobs: ScheduledJob[];
  integrations: Integration[];
  settings: Settings;
  activity: ActivityEvent[];
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function isoAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/* -------------------------------------------------------------------------- */
/*  Seed                                                                       */
/* -------------------------------------------------------------------------- */

function seed(): DB {
  const contactsSeed: Array<Omit<Contact, "id">> = [
    { name: "Priya Sharma", phone: "919812345670", email: "priya@example.com", tags: ["lead", "website"], status: "lead", createdAt: isoAgo(2880), lastActiveAt: isoAgo(12), attributes: { city: "Mumbai" } },
    { name: "James Carter", phone: "14155550111", email: "james@example.com", tags: ["customer", "vip"], status: "customer", createdAt: isoAgo(20160), lastActiveAt: isoAgo(95), attributes: { plan: "Pro" } },
    { name: "Aisha Khan", phone: "971501234567", email: "aisha@example.com", tags: ["lead"], status: "active", createdAt: isoAgo(7200), lastActiveAt: isoAgo(4), attributes: { city: "Dubai" } },
    { name: "Carlos Mendez", phone: "5215512345678", tags: ["customer"], status: "customer", createdAt: isoAgo(43200), lastActiveAt: isoAgo(1500), attributes: {} },
    { name: "Sofia Rossi", phone: "393331234567", email: "sofia@example.com", tags: ["lead", "abandoned-cart"], status: "lead", createdAt: isoAgo(180), lastActiveAt: isoAgo(45), attributes: { cart_value: "€129" } },
    { name: "David Okafor", phone: "2348031234567", tags: ["active"], status: "active", createdAt: isoAgo(10080), lastActiveAt: isoAgo(600), attributes: {} },
  ];

  const contacts: Contact[] = contactsSeed.map((c) => ({ ...c, id: newId("ct") }));

  const conversations: Conversation[] = [];
  const messages: Message[] = [];

  // Build a couple of realistic threads.
  const seedThread = (
    contact: Contact,
    items: Array<{ dir: MessageDirection; text: string; minsAgo: number; status?: MessageStatusValue }>,
    unread: number,
  ) => {
    const convId = newId("cv");
    let last = items[items.length - 1];
    for (const m of items) {
      messages.push({
        id: newId("msg"),
        conversationId: convId,
        contactId: contact.id,
        direction: m.dir,
        type: "text",
        text: m.text,
        status: m.dir === "out" ? m.status ?? "delivered" : "delivered",
        timestamp: isoAgo(m.minsAgo),
        via: m.dir === "out" ? "manual" : undefined,
      });
    }
    conversations.push({
      id: convId,
      contactId: contact.id,
      status: "open",
      unread,
      lastMessageAt: isoAgo(last.minsAgo),
      lastMessagePreview: last.text,
    });
  };

  seedThread(contacts[0], [
    { dir: "in", text: "Hi, do you have the summer collection in stock?", minsAgo: 60 },
    { dir: "out", text: "Hi Priya! Yes we do 🎉 Which item are you interested in?", minsAgo: 58, status: "read" },
    { dir: "in", text: "The linen dress in beige", minsAgo: 12 },
  ], 1);

  seedThread(contacts[2], [
    { dir: "in", text: "menu", minsAgo: 10 },
    { dir: "out", text: "Welcome to our store! Reply 1 for Catalog, 2 for Support, 3 to talk to an agent.", minsAgo: 10, status: "read" },
    { dir: "in", text: "1", minsAgo: 4 },
  ], 1);

  seedThread(contacts[4], [
    { dir: "in", text: "I left something in my cart", minsAgo: 50 },
    { dir: "out", text: "No worries Sofia — here's a 10% code to finish your order: SAVE10", minsAgo: 45, status: "delivered" },
  ], 0);

  const templates: Template[] = [
    { id: newId("tpl"), name: "order_confirmation", category: "utility", language: "en_US", status: "approved", body: "Hi {{1}}, your order {{2}} is confirmed and will arrive by {{3}}.", variableCount: 3, createdAt: isoAgo(30000) },
    { id: newId("tpl"), name: "appointment_reminder", category: "utility", language: "en_US", status: "approved", body: "Hi {{1}}, this is a reminder for your appointment on {{2}}.", variableCount: 2, createdAt: isoAgo(28000) },
    { id: newId("tpl"), name: "summer_sale_2026", category: "marketing", language: "en_US", status: "approved", body: "Hi {{1}}! ☀️ Our Summer Sale is live — up to 50% off. Reply SHOP to browse.", variableCount: 1, createdAt: isoAgo(5000) },
    { id: newId("tpl"), name: "welcome_offer", category: "marketing", language: "en_US", status: "pending", body: "Welcome {{1}}! Here's 15% off your first order: {{2}}", variableCount: 2, createdAt: isoAgo(120) },
    { id: newId("tpl"), name: "otp_verification", category: "authentication", language: "en_US", status: "approved", body: "{{1}} is your verification code. It expires in 5 minutes.", variableCount: 1, createdAt: isoAgo(60000) },
  ];

  const campaigns: Campaign[] = [
    { id: newId("cmp"), name: "Summer Sale 2026", type: "broadcast", status: "sent", templateName: "summer_sale_2026", audienceTag: "lead", recipientCount: 12450, stats: { sent: 12450, delivered: 12230, read: 9180, failed: 220, clicked: 3420 }, createdAt: isoAgo(4000) },
    { id: newId("cmp"), name: "Welcome Series", type: "drip", status: "sending", templateName: "welcome_offer", audienceTag: "website", recipientCount: 4820, stats: { sent: 4820, delivered: 4750, read: 3600, failed: 70, clicked: 1240 }, createdAt: isoAgo(8000) },
    { id: newId("cmp"), name: "Abandoned Cart Recovery", type: "trigger", status: "sending", audienceTag: "abandoned-cart", recipientCount: 2310, stats: { sent: 2310, delivered: 2290, read: 1890, failed: 20, clicked: 920 }, createdAt: isoAgo(12000) },
    { id: newId("cmp"), name: "Flash Deal — 24h", type: "broadcast", status: "scheduled", templateName: "summer_sale_2026", audienceTag: "customer", recipientCount: 0, stats: { sent: 0, delivered: 0, read: 0, failed: 0, clicked: 0 }, createdAt: isoAgo(60), scheduledAt: new Date(Date.now() + 86_400_000).toISOString() },
  ];

  const rules: AutomationRule[] = [
    { id: newId("rule"), name: "Welcome greeting", enabled: true, triggerType: "welcome", keywords: ["hi", "hello", "hey"], matchType: "contains", responseType: "text", responseText: "👋 Welcome to Neuraxine! Reply MENU to see what I can help with.", priority: 1, triggeredCount: 842, createdAt: isoAgo(20000) },
    { id: newId("rule"), name: "Menu", enabled: true, triggerType: "keyword", keywords: ["menu"], matchType: "exact", responseType: "text", responseText: "Here's our menu:\n1️⃣ Catalog\n2️⃣ Support\n3️⃣ Talk to an agent", priority: 2, triggeredCount: 503, createdAt: isoAgo(19000) },
    { id: newId("rule"), name: "Pricing inquiry", enabled: true, triggerType: "keyword", keywords: ["price", "pricing", "cost", "how much"], matchType: "contains", responseType: "text", responseText: "Our plans start at $29/mo. Reply PLANS for a full breakdown 💸", priority: 3, triggeredCount: 287, createdAt: isoAgo(15000) },
    { id: newId("rule"), name: "Business hours", enabled: false, triggerType: "keyword", keywords: ["hours", "open"], matchType: "contains", responseType: "text", responseText: "We're open Mon–Sat, 9am–7pm.", priority: 4, triggeredCount: 96, createdAt: isoAgo(9000) },
    { id: newId("rule"), name: "Fallback", enabled: true, triggerType: "default", keywords: [], matchType: "contains", responseType: "text", responseText: "Thanks for your message! A team member will reply shortly. Reply MENU for quick options.", priority: 99, triggeredCount: 1290, createdAt: isoAgo(20000) },
  ];

  const flows: Flow[] = [
    { id: newId("flow"), name: "New lead nurture", enabled: true, trigger: "on_new_contact", keywords: [], steps: [
      { delayMinutes: 1, message: "Thanks for reaching out! 🙌 Here's a quick intro to what we offer." },
      { delayMinutes: 60, message: "Still thinking it over? Here's a 10% welcome code: WELCOME10" },
      { delayMinutes: 1440, message: "Last nudge — your welcome code WELCOME10 expires tonight!" },
    ], enrolledCount: 318, completedCount: 142, createdAt: isoAgo(12000) },
    { id: newId("flow"), name: "Abandoned cart", enabled: true, trigger: "keyword", keywords: ["cart"], steps: [
      { delayMinutes: 30, message: "You left items in your cart 🛒 Complete your order and get free shipping!" },
      { delayMinutes: 1440, message: "Your cart is about to expire — checkout now to keep your items." },
    ], enrolledCount: 96, completedCount: 51, createdAt: isoAgo(8000) },
  ];

  const integrations: Integration[] = [
    { id: newId("int"), key: "shopify", name: "Shopify", description: "Sync orders, customers and abandoned carts.", category: "E-commerce", connected: true, connectedAt: isoAgo(10000) },
    { id: newId("int"), key: "google_sheets", name: "Google Sheets", description: "Export contacts and message logs to a sheet.", category: "Productivity", connected: true, connectedAt: isoAgo(5000) },
    { id: newId("int"), key: "hubspot", name: "HubSpot", description: "Two-way contact sync with your CRM.", category: "CRM", connected: false },
    { id: newId("int"), key: "stripe", name: "Stripe", description: "Trigger messages on payments and subscriptions.", category: "Payments", connected: false },
    { id: newId("int"), key: "zapier", name: "Zapier", description: "Connect to 6000+ apps with no code.", category: "Automation", connected: false },
    { id: newId("int"), key: "openai", name: "OpenAI", description: "Power AI replies with GPT models.", category: "AI", connected: true, connectedAt: isoAgo(3000) },
  ];

  const activity: ActivityEvent[] = [
    { id: newId("act"), type: "message", text: "New message from Priya Sharma", timestamp: isoAgo(12) },
    { id: newId("act"), type: "automation", text: "Rule “Menu” triggered for Aisha Khan", timestamp: isoAgo(4) },
    { id: newId("act"), type: "campaign", text: "Campaign “Summer Sale 2026” finished sending", timestamp: isoAgo(60) },
    { id: newId("act"), type: "contact", text: "New contact added: Sofia Rossi", timestamp: isoAgo(180) },
  ];

  return {
    contacts,
    conversations,
    messages,
    templates,
    campaigns,
    rules,
    flows,
    jobs: [],
    integrations,
    settings: {
      businessName: "Neuraxine",
      businessEmail: "hello@neuraxine.in",
      website: "https://neuraxine.in",
      whatsappNumber: "+1 555 0100",
      autoReplyEnabled: true,
      sandboxMode: !process.env.WHATSAPP_ACCESS_TOKEN,
    },
    activity,
  };
}

/* -------------------------------------------------------------------------- */
/*  Singleton                                                                  */
/* -------------------------------------------------------------------------- */

const globalForDb = globalThis as unknown as { __waDb?: DB };

export function db(): DB {
  if (!globalForDb.__waDb) {
    globalForDb.__waDb = seed();
  }
  return globalForDb.__waDb;
}

/** Test/util: wipe and reseed. */
export function resetDb(): void {
  globalForDb.__waDb = seed();
}

/* -------------------------------------------------------------------------- */
/*  Activity log                                                               */
/* -------------------------------------------------------------------------- */

export function logActivity(type: string, text: string): void {
  db().activity.unshift({ id: newId("act"), type, text, timestamp: new Date().toISOString() });
  db().activity = db().activity.slice(0, 50);
}

/* -------------------------------------------------------------------------- */
/*  Contacts                                                                   */
/* -------------------------------------------------------------------------- */

export function listContacts(): Contact[] {
  return [...db().contacts].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
}

export function getContact(id: string): Contact | undefined {
  return db().contacts.find((c) => c.id === id);
}

export function getContactByPhone(phone: string): Contact | undefined {
  return db().contacts.find((c) => c.phone === phone);
}

export function createContact(input: Partial<Contact> & { phone: string; name: string }): Contact {
  const now = new Date().toISOString();
  const contact: Contact = {
    id: newId("ct"),
    name: input.name,
    phone: input.phone,
    email: input.email,
    tags: input.tags ?? [],
    status: input.status ?? "lead",
    createdAt: now,
    lastActiveAt: now,
    attributes: input.attributes ?? {},
  };
  db().contacts.push(contact);
  logActivity("contact", `New contact added: ${contact.name}`);
  return contact;
}

export function upsertContactByPhone(phone: string, name?: string): Contact {
  const existing = getContactByPhone(phone);
  if (existing) {
    existing.lastActiveAt = new Date().toISOString();
    if (name && existing.name.startsWith("+")) existing.name = name;
    return existing;
  }
  return createContact({ phone, name: name || `+${phone}`, status: "lead" });
}

/* -------------------------------------------------------------------------- */
/*  Conversations & messages                                                   */
/* -------------------------------------------------------------------------- */

export function listConversations(): Array<Conversation & { contact?: Contact }> {
  return [...db().conversations]
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .map((c) => ({ ...c, contact: getContact(c.contactId) }));
}

export function getConversationForContact(contactId: string): Conversation {
  let conv = db().conversations.find((c) => c.contactId === contactId);
  if (!conv) {
    conv = {
      id: newId("cv"),
      contactId,
      status: "open",
      unread: 0,
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: "",
    };
    db().conversations.push(conv);
  }
  return conv;
}

export function getMessages(conversationId: string): Message[] {
  return db()
    .messages.filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function addMessage(input: Omit<Message, "id" | "timestamp"> & { timestamp?: string }): Message {
  const msg: Message = {
    ...input,
    id: newId("msg"),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
  db().messages.push(msg);

  const conv = db().conversations.find((c) => c.id === msg.conversationId);
  if (conv) {
    conv.lastMessageAt = msg.timestamp;
    conv.lastMessagePreview = msg.text;
    if (msg.direction === "in") conv.unread += 1;
  }
  return msg;
}

export function markConversationRead(conversationId: string): void {
  const conv = db().conversations.find((c) => c.id === conversationId);
  if (conv) conv.unread = 0;
}

/* -------------------------------------------------------------------------- */
/*  Templates / campaigns / rules / flows / integrations CRUD                  */
/* -------------------------------------------------------------------------- */

export function listTemplates(): Template[] {
  return [...db().templates].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createTemplate(input: Omit<Template, "id" | "createdAt" | "status">): Template {
  const tpl: Template = { ...input, id: newId("tpl"), status: "pending", createdAt: new Date().toISOString() };
  db().templates.push(tpl);
  return tpl;
}

export function listCampaigns(): Campaign[] {
  return [...db().campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createCampaign(input: Omit<Campaign, "id" | "createdAt" | "stats">): Campaign {
  const cmp: Campaign = {
    ...input,
    id: newId("cmp"),
    stats: { sent: 0, delivered: 0, read: 0, failed: 0, clicked: 0 },
    createdAt: new Date().toISOString(),
  };
  db().campaigns.push(cmp);
  return cmp;
}

export function updateCampaign(id: string, patch: Partial<Campaign>): Campaign | undefined {
  const cmp = db().campaigns.find((c) => c.id === id);
  if (cmp) Object.assign(cmp, patch);
  return cmp;
}

export function listRules(): AutomationRule[] {
  return [...db().rules].sort((a, b) => a.priority - b.priority);
}

export function createRule(input: Omit<AutomationRule, "id" | "createdAt" | "triggeredCount">): AutomationRule {
  const rule: AutomationRule = { ...input, id: newId("rule"), triggeredCount: 0, createdAt: new Date().toISOString() };
  db().rules.push(rule);
  return rule;
}

export function updateRule(id: string, patch: Partial<AutomationRule>): AutomationRule | undefined {
  const rule = db().rules.find((r) => r.id === id);
  if (rule) Object.assign(rule, patch);
  return rule;
}

export function deleteRule(id: string): void {
  db().rules = db().rules.filter((r) => r.id !== id);
}

export function listFlows(): Flow[] {
  return [...db().flows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createFlow(input: Omit<Flow, "id" | "createdAt" | "enrolledCount" | "completedCount">): Flow {
  const flow: Flow = { ...input, id: newId("flow"), enrolledCount: 0, completedCount: 0, createdAt: new Date().toISOString() };
  db().flows.push(flow);
  return flow;
}

export function updateFlow(id: string, patch: Partial<Flow>): Flow | undefined {
  const flow = db().flows.find((f) => f.id === id);
  if (flow) Object.assign(flow, patch);
  return flow;
}

export function listJobs(): ScheduledJob[] {
  return [...db().jobs].sort((a, b) => a.runAt.localeCompare(b.runAt));
}

export function listIntegrations(): Integration[] {
  return db().integrations;
}

export function toggleIntegration(id: string, connected: boolean): Integration | undefined {
  const int = db().integrations.find((i) => i.id === id);
  if (int) {
    int.connected = connected;
    int.connectedAt = connected ? new Date().toISOString() : undefined;
  }
  return int;
}

export function getSettings(): Settings {
  return db().settings;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  Object.assign(db().settings, patch);
  return db().settings;
}

export function getActivity(): ActivityEvent[] {
  return db().activity.slice(0, 20);
}
