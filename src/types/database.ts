export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrgPlan = "starter" | "growth" | "scale" | "enterprise";
export type UserRole = "owner" | "admin" | "agent";
export type PhoneNumberSeries = "regular" | "140" | "1600";
export type DltStatus = "pending" | "submitted" | "approved" | "rejected";
export type AgentDirection = "inbound" | "outbound" | "both";
export type AgentLanguage = "en" | "hi" | "hinglish" | "ta" | "te" | "bn";
export type AgentStatus = "active" | "inactive" | "draft";
export type KnowledgeSourceType = "url" | "file" | "text";
export type CampaignStatus = "draft" | "running" | "paused" | "done" | "failed";
export type CallCategory = "promotional" | "transactional" | "service";
export type CallDirection = "inbound" | "outbound";
export type CallStatus =
  | "queued"
  | "initiating"
  | "ringing"
  | "answered"
  | "in_progress"
  | "ended"
  | "failed"
  | "no_answer"
  | "busy"
  | "cancelled";
export type CallDisposition =
  | "completed"
  | "interested"
  | "not_interested"
  | "callback"
  | "voicemail"
  | "no_answer"
  | "busy"
  | "failed";
export type TranscriptRole = "agent" | "caller";
export type CallEventType =
  | "initiated"
  | "ringing"
  | "answered"
  | "transcript_chunk"
  | "recording_ready"
  | "ended"
  | "error";
export type WebhookEvent =
  | "call.started"
  | "call.answered"
  | "call.ended"
  | "call.failed"
  | "call.recording_ready"
  | "campaign.started"
  | "campaign.paused"
  | "campaign.completed";
export type NumberCapability = "voice" | "sms";
export type TelephonyProvider = "plivo" | "exotel" | "mock";
export type VoiceProviderType = "bolna" | "mock";

export interface Organization {
  id: string;
  name: string;
  plan: OrgPlan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  is_bfsi: boolean;
  dlt_entity_id: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  role: UserRole;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

export interface PhoneNumber {
  id: string;
  org_id: string;
  e164: string;
  provider: TelephonyProvider;
  capabilities: NumberCapability[];
  status: "active" | "inactive" | "porting";
  series: PhoneNumberSeries;
  dlt_entity_id: string | null;
  dlt_status: DltStatus;
  inbound_agent_id: string | null;
  created_at: string;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  webhook_url?: string;
}

export interface Agent {
  id: string;
  org_id: string;
  name: string;
  direction: AgentDirection;
  voice_id: string;
  language: AgentLanguage;
  system_prompt: string;
  first_message: string;
  llm_model: string;
  temperature: number;
  tools: AgentTool[];
  end_call_phrases: string[];
  max_duration_sec: number;
  status: AgentStatus;
  disclosure_enabled: boolean;
  disclosure_text: string | null;
  bolna_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSource {
  id: string;
  agent_id: string;
  org_id: string;
  type: KnowledgeSourceType;
  name: string;
  content: string | null;
  url: string | null;
  file_path: string | null;
  embedding_status: "pending" | "processing" | "done" | "error";
  created_at: string;
}

export interface Contact {
  id: string;
  org_id: string;
  name: string;
  e164: string;
  email: string | null;
  attributes: Record<string, string | number | boolean>;
  tags: string[];
  consent_given: boolean;
  consent_source: string | null;
  consent_at: string | null;
  dnd: boolean;
  created_at: string;
}

export interface ContactList {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  contact_count: number;
  created_at: string;
}

export interface ContactListMember {
  id: string;
  list_id: string;
  contact_id: string;
  added_at: string;
}

export interface RetryPolicy {
  max_attempts: number;
  delay_minutes: number;
  on_statuses: CallStatus[];
}

export interface Campaign {
  id: string;
  org_id: string;
  agent_id: string;
  name: string;
  contact_list_id: string;
  schedule_start: string | null;
  schedule_end: string | null;
  calling_hours_start: string;
  calling_hours_end: string;
  calling_days: number[];
  concurrency: number;
  retry_policy: RetryPolicy;
  call_category: CallCategory;
  dlt_template_id: string | null;
  from_number_id: string | null;
  status: CampaignStatus;
  calls_total: number;
  calls_completed: number;
  calls_failed: number;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  org_id: string;
  agent_id: string | null;
  campaign_id: string | null;
  contact_id: string | null;
  direction: CallDirection;
  from_e164: string;
  to_e164: string;
  status: CallStatus;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  recording_url: string | null;
  cost: number | null;
  disposition: CallDisposition | null;
  summary: string | null;
  sentiment: "positive" | "negative" | "neutral" | null;
  structured_data: Record<string, unknown>;
  provider_call_id: string | null;
  created_at: string;
}

export interface CallEvent {
  id: string;
  call_id: string;
  type: CallEventType;
  payload: Record<string, unknown>;
  ts: string;
}

export interface Transcript {
  id: string;
  call_id: string;
  role: TranscriptRole;
  text: string;
  ts: string;
  seq: number;
}

export interface Webhook {
  id: string;
  org_id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  created_at: string;
}

export interface UsageLedger {
  id: string;
  org_id: string;
  period: string;
  minutes_used: number;
  calls_count: number;
  cost: number;
}

export interface ApiKey {
  id: string;
  org_id: string;
  hashed_key: string;
  label: string;
  last_used: string | null;
  created_at: string;
}
