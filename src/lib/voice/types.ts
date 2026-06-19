import type { Agent, Call, CallEvent, Transcript } from "@/types/database";

export interface AgentConfig {
  id: string;
  orgId: string;
  name: string;
  direction: Agent["direction"];
  voiceId: string;
  language: Agent["language"];
  systemPrompt: string;
  firstMessage: string;
  llmModel: string;
  temperature: number;
  tools: Agent["tools"];
  endCallPhrases: string[];
  maxDurationSec: number;
  disclosureEnabled: boolean;
  disclosureText: string | null;
  bolnaAgentId: string | null;
}

export interface StartCallOptions {
  agentConfig: AgentConfig;
  toNumber: string;
  fromNumber: string;
  callId: string;
  metadata: Record<string, unknown>;
}

export interface StartCallResult {
  providerCallId: string;
  status: "initiated" | "failed";
  error?: string;
}

export type CallStreamEvent =
  | { type: "ringing"; callId: string }
  | { type: "answered"; callId: string; ts: string }
  | { type: "transcript_chunk"; callId: string; role: "agent" | "caller"; text: string; seq: number; ts: string }
  | { type: "recording_ready"; callId: string; url: string }
  | { type: "ended"; callId: string; durationSec: number; disposition: string; ts: string }
  | { type: "error"; callId: string; message: string };

export interface VoiceProvider {
  name: string;

  startCall(options: StartCallOptions): Promise<StartCallResult>;
  endCall(providerCallId: string): Promise<void>;
  getVoices(): Promise<VoiceOption[]>;

  verifyWebhookSignature(payload: string, signature: string): boolean;
  parseWebhookEvent(payload: Record<string, unknown>): CallStreamEvent | null;
}

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  gender: "male" | "female" | "neutral";
  preview_url?: string;
  provider: string;
}

export interface TelephonyProviderInterface {
  name: string;
  provisionNumber(areaCode?: string, series?: string): Promise<{ e164: string; sid: string }>;
  releaseNumber(sid: string): Promise<void>;
  configureInboundRouting(e164: string, webhookUrl: string): Promise<void>;
  makeCall(from: string, to: string, agentWebhookUrl: string): Promise<{ callSid: string }>;
}
