import type { VoiceProvider, StartCallOptions, StartCallResult, CallStreamEvent, VoiceOption } from "./types";

const MOCK_VOICES: VoiceOption[] = [
  { id: "mock-priya-f", name: "Priya", language: "hi", gender: "female", provider: "mock" },
  { id: "mock-arjun-m", name: "Arjun", language: "hi", gender: "male", provider: "mock" },
  { id: "mock-emma-f", name: "Emma", language: "en", gender: "female", provider: "mock" },
  { id: "mock-james-m", name: "James", language: "en", gender: "male", provider: "mock" },
  { id: "mock-kavya-f", name: "Kavya", language: "hinglish", gender: "female", provider: "mock" },
  { id: "mock-rahul-m", name: "Rahul", language: "hinglish", gender: "male", provider: "mock" },
];

export class MockVoiceProvider implements VoiceProvider {
  name = "mock";

  async startCall(options: StartCallOptions): Promise<StartCallResult> {
    console.log(`[MockVoiceProvider] startCall to ${options.toNumber} from ${options.fromNumber}`);
    const providerCallId = `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return { providerCallId, status: "initiated" };
  }

  async endCall(providerCallId: string): Promise<void> {
    console.log(`[MockVoiceProvider] endCall ${providerCallId}`);
  }

  async getVoices(): Promise<VoiceOption[]> {
    return MOCK_VOICES;
  }

  verifyWebhookSignature(_payload: string, _signature: string): boolean {
    return true;
  }

  parseWebhookEvent(payload: Record<string, unknown>): CallStreamEvent | null {
    const type = payload.type as string;
    if (!type) return null;
    return payload as unknown as CallStreamEvent;
  }
}
