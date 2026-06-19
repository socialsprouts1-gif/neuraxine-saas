import type { VoiceProvider } from "./types";
import { MockVoiceProvider } from "./mock-provider";
import { BolnaAdapter } from "./bolna-adapter";

let _provider: VoiceProvider | null = null;

export function getVoiceProvider(): VoiceProvider {
  if (_provider) return _provider;
  const name = process.env.VOICE_PROVIDER ?? "mock";
  if (name === "bolna") {
    _provider = new BolnaAdapter();
  } else {
    _provider = new MockVoiceProvider();
  }
  return _provider;
}

export * from "./types";
