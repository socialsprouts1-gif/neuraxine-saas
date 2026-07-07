export type AgentStatus = "active" | "paused" | "draft";

export interface VoiceAgent {
  id: string;
  name: string;
  useCase: string;
  description: string;
  status: AgentStatus;
  language: string;
  voice: string;
  model: string;
  greeting: string;
  systemPrompt: string;
  temperature: number;
  speakingRate: number;
  interruptible: boolean;
  maxCallMinutes: number;
  silenceTimeoutSec: number;
  knowledgeFaqs: { q: string; a: string }[];
  webhookUrl: string;
  whatsappFollowUp: boolean;
  calendarBooking: boolean;
  crmPush: boolean;
  totalCalls: number;
  avgDurationSec: number;
  successRate: number;
  createdAt: string;
}

export type CallStatus = "completed" | "failed" | "no-answer" | "busy" | "in-progress";
export type CallDirection = "outbound" | "inbound";

export interface CallLog {
  id: string;
  agentName: string;
  contactName: string;
  phone: string;
  direction: CallDirection;
  status: CallStatus;
  durationSec: number;
  costInr: number;
  sentiment: "positive" | "neutral" | "negative";
  outcome: string;
  startedAt: string;
  transcript: { speaker: "agent" | "user"; text: string }[];
}

export interface Campaign {
  id: string;
  name: string;
  agentName: string;
  status: "running" | "scheduled" | "completed" | "paused" | "draft";
  totalContacts: number;
  called: number;
  connected: number;
  converted: number;
  scheduledFor: string;
  callWindow: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  city: string;
  tags: string[];
  lastCalled: string;
  dnd: boolean;
}

export interface PhoneNumber {
  id: string;
  number: string;
  type: "virtual" | "toll-free" | "mobile";
  provider: string;
  city: string;
  assignedAgent: string;
  monthlyRentInr: number;
  status: "active" | "pending";
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: "recharge" | "usage" | "rental" | "refund";
  amountInr: number;
  status: "success" | "pending" | "failed";
}

// ---- Admin-side types ----

export interface ClientAccount {
  id: string;
  company: string;
  owner: string;
  email: string;
  phone: string;
  city: string;
  plan: "Starter" | "Growth" | "Scale" | "Enterprise";
  status: "active" | "trial" | "suspended";
  walletInr: number;
  agents: number;
  minutesThisMonth: number;
  mrrInr: number;
  joinedAt: string;
}

export interface Plan {
  id: string;
  name: string;
  priceInr: number;
  includedMinutes: number;
  overagePerMinInr: number;
  maxAgents: number;
  concurrency: number;
  features: string[];
  activeClients: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  category: "telephony" | "tts" | "stt" | "llm";
  status: "connected" | "disconnected" | "degraded";
  usageShare: number;
  costNote: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  client: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in-progress" | "resolved";
  createdAt: string;
  lastUpdate: string;
}
