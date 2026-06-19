/**
 * Bolna voice agent adapter.
 * Bolna manages the STT→LLM→TTS loop natively for Indic languages.
 * Telephony is Plivo or Exotel (configured via TELEPHONY_PROVIDER env).
 *
 * Docs: https://docs.bolna.dev
 */
import type { VoiceProvider, StartCallOptions, StartCallResult, CallStreamEvent, VoiceOption } from "./types";
import crypto from "crypto";

const BOLNA_BASE = process.env.BOLNA_API_URL ?? "https://api.bolna.dev";
const BOLNA_API_KEY = process.env.BOLNA_API_KEY ?? "";
const BOLNA_WEBHOOK_SECRET = process.env.BOLNA_WEBHOOK_SECRET ?? "";

export class BolnaAdapter implements VoiceProvider {
  name = "bolna";

  private async post(path: string, body: unknown) {
    const res = await fetch(`${BOLNA_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${BOLNA_API_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bolna API error ${res.status}: ${text}`);
    }
    return res.json();
  }

  async startCall(options: StartCallOptions): Promise<StartCallResult> {
    const { agentConfig, toNumber, fromNumber, callId, metadata } = options;

    if (!agentConfig.bolnaAgentId) {
      throw new Error("Agent has no Bolna agent ID — create it on the Bolna dashboard first");
    }

    const data = await this.post("/v1/call", {
      agent_id: agentConfig.bolnaAgentId,
      recipient_phone_number: toNumber,
      from_phone_number: fromNumber,
      metadata: { ...metadata, neuraxine_call_id: callId },
    });

    return { providerCallId: data.call_id, status: "initiated" };
  }

  async endCall(providerCallId: string): Promise<void> {
    await this.post(`/v1/call/${providerCallId}/end`, {});
  }

  async getVoices(): Promise<VoiceOption[]> {
    try {
      const data = await fetch(`${BOLNA_BASE}/v1/voices`, {
        headers: { Authorization: `Bearer ${BOLNA_API_KEY}` },
      }).then((r) => r.json());
      return (data.voices ?? []).map((v: Record<string, string>) => ({
        id: v.voice_id,
        name: v.name,
        language: v.language ?? "en",
        gender: (v.gender as "male" | "female") ?? "neutral",
        provider: "bolna",
      }));
    } catch {
      return [];
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!BOLNA_WEBHOOK_SECRET) return true;
    const expected = crypto
      .createHmac("sha256", BOLNA_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  parseWebhookEvent(payload: Record<string, unknown>): CallStreamEvent | null {
    const callId = (payload.metadata as Record<string, string>)?.neuraxine_call_id;
    if (!callId) return null;

    switch (payload.event) {
      case "call.ringing":
        return { type: "ringing", callId };
      case "call.answered":
        return { type: "answered", callId, ts: payload.timestamp as string };
      case "transcript.chunk":
        return {
          type: "transcript_chunk",
          callId,
          role: payload.role as "agent" | "caller",
          text: payload.text as string,
          seq: payload.seq as number,
          ts: payload.timestamp as string,
        };
      case "recording.ready":
        return { type: "recording_ready", callId, url: payload.recording_url as string };
      case "call.ended":
        return {
          type: "ended",
          callId,
          durationSec: payload.duration_sec as number,
          disposition: (payload.disposition as string) ?? "completed",
          ts: payload.timestamp as string,
        };
      default:
        return null;
    }
  }
}
