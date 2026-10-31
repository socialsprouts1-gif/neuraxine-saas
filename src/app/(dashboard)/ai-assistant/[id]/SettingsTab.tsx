"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { saveAssistantSettings } from "@/app/(dashboard)/portal-actions";
import { PROVIDERS, defaultModelFor, providerById } from "@/lib/ai-providers";
import type { ProviderId } from "@/lib/ai-providers";
import type { AiAssistant } from "@/types/portal";
import { SaveForm, SectionCard, SliderRow, TextInput } from "./EditorControls";

// Step two: which AI answers, and how freely.
//
// The provider, the model and the key are one decision — saving them apart
// leaves an assistant pointing at a model it has no key for — so they stay
// on one form with one Save. Who the agent is and what it is told moved to
// the Persona step, because two screens writing the same prompt box is how
// one of them silently overwrites the other.
export default function SettingsTab({ assistant }: { assistant: AiAssistant }) {

  const [providerId, setProviderId] = useState<ProviderId>(
    (providerById(assistant.provider)?.id ?? "anthropic") as ProviderId
  );
  const [model, setModel] = useState(assistant.model);
  const [temperature, setTemperature] = useState(assistant.temperature);
  const [maxTokens, setMaxTokens] = useState(assistant.max_tokens);
  const [showKey, setShowKey] = useState(false);
  const [removeKey, setRemoveKey] = useState(false);

  const provider = providerById(providerId)!;
  const hasStoredKey = Boolean(assistant.api_key_encrypted);

  const changeProvider = (next: ProviderId) => {
    setProviderId(next);
    // The old model name means nothing to the new provider, so move to that
    // provider's default rather than leaving a name that will 404 at send.
    setModel(defaultModelFor(next));
    setRemoveKey(false);
  };

  return (
    <SaveForm action={saveAssistantSettings} label="Save Assistant">
      <input type="hidden" name="id" value={assistant.id} />
      <input type="hidden" name="provider" value={providerId} />
      <input type="hidden" name="remove_api_key" value={String(removeKey)} />

      <div className="space-y-5">
        <SectionCard
          title="AI Configuration"
          description="Select your AI provider and model preferences."
        >
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-xs font-medium text-white/70 mb-1.5">AI provider</span>
              <select
                value={providerId}
                onChange={(event) => changeProvider(event.target.value as ProviderId)}
                className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
              >
                {PROVIDERS.map((option) => (
                  <option key={option.id} value={option.id} className="bg-[var(--surface-3)]">
                    {option.name}
                  </option>
                ))}
              </select>
              <span className="block text-[12px] text-white/35 mt-1">{provider.blurb}</span>
            </label>

            {provider.models.length > 0 ? (
              <label className="block">
                <span className="block text-xs font-medium text-white/70 mb-1.5">Model</span>
                <select
                  name="model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all"
                >
                  {provider.models.map((option) => (
                    <option key={option.value} value={option.value} className="bg-[var(--surface-3)]">
                      {option.label} — {option.hint}
                    </option>
                  ))}
                </select>
                <span className="block text-[12px] text-white/35 mt-1">
                  Every reply on this assistant goes to this model.
                </span>
              </label>
            ) : (
              <TextInput
                label="Model"
                name="model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="meta-llama/llama-3.3-70b-instruct"
                hint="Exactly as your endpoint names it."
              />
            )}
          </div>

          {provider.needsBaseUrl && (
            <div className="mt-4">
              <TextInput
                label="Base URL"
                name="api_base_url"
                defaultValue={assistant.api_base_url ?? ""}
                placeholder="https://openrouter.ai/api/v1"
                hint="OpenAI-compatible. We POST to {base}/chat/completions."
              />
            </div>
          )}

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-xs font-medium text-white/70">
                {provider.name} API key {hasStoredKey && !removeKey ? "" : "*"}
              </span>
              {hasStoredKey && !removeKey && (
                <button
                  type="button"
                  onClick={() => setRemoveKey(true)}
                  className="text-[12px] text-red-400 hover:underline"
                >
                  Remove stored key
                </button>
              )}
            </div>

            {removeKey ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/12 bg-white/3 p-3.5">
                <p className="text-xs text-white/50 flex-1 min-w-[16rem]">
                  The stored key will be deleted when you save.
                  {provider.envVar
                    ? ` This assistant will fall back to the platform's ${provider.envVar}.`
                    : " This assistant will stop being able to reply."}
                </p>
                <button
                  type="button"
                  onClick={() => setRemoveKey(false)}
                  className="text-xs text-white/60 hover:text-white underline underline-offset-2"
                >
                  Keep it
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    name="api_key"
                    type={showKey ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={
                      hasStoredKey ? "•••••••••••• (leave blank to keep)" : provider.keyPlaceholder
                    }
                    className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((current) => !current)}
                    className="px-3.5 rounded-xl border border-white/12 text-xs text-white/60 hover:text-white hover:border-white/25 transition-colors flex-shrink-0"
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>

                <p className="text-[12px] text-white/35 mt-2 leading-relaxed">
                  Encrypted before it is stored and never shown again — not to you, not to us. The
                  assistant will not reply until a key is set.
                  {provider.envVar && !hasStoredKey
                    ? ` Leave it blank to use the platform's ${provider.envVar} instead.`
                    : ""}{" "}
                  <a
                    href={provider.consoleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent2-ink hover:underline inline-flex items-center gap-1"
                  >
                    Get a key at {provider.consoleLabel}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <SliderRow
              name="temperature"
              label="Creativity"
              value={temperature}
              onChange={setTemperature}
              min={0}
              max={2}
              step={0.1}
              format={(value) => value.toFixed(1)}
              scale={["precise and repeatable", "varied"]}
            />
            <SliderRow
              name="max_tokens"
              label="Maximum reply length"
              value={maxTokens}
              onChange={setMaxTokens}
              min={128}
              max={4096}
              step={64}
              format={(value) => `${value} tokens`}
              scale={["a few lines", "several paragraphs"]}
            />
          </div>
          <p className="text-[12px] text-white/35 mt-3">
            WhatsApp cuts a text message at 4096 characters, so replies are trimmed to that
            regardless of the limit set here.
          </p>
        </SectionCard>
      </div>

    </SaveForm>
  );
}
