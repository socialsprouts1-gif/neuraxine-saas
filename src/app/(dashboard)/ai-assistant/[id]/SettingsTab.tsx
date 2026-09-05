"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Sparkles, Wand2, X } from "lucide-react";
import {
  generateAssistantInstructions,
  saveAssistantSettings,
} from "@/app/(dashboard)/portal-actions";
import { PROMPT_PRESETS, PROVIDERS, defaultModelFor, providerById } from "@/lib/ai-providers";
import type { ProviderId } from "@/lib/ai-providers";
import type { AiAssistant } from "@/types/portal";
import { SaveForm, SectionCard, SliderRow, TextInput, Toggle } from "./EditorControls";

// One form across all three cards, one Save Assistant at the bottom. The
// prompt, the provider and the key are a single decision — saving them apart
// leaves an assistant pointing at a model it has no key for.
export default function SettingsTab({ assistant }: { assistant: AiAssistant }) {
  const [isActive, setIsActive] = useState(assistant.is_active);
  const [mode, setMode] = useState<"predefined" | "custom">(
    assistant.prompt_preset === "custom" ? "custom" : "predefined"
  );
  const [preset, setPreset] = useState(assistant.prompt_preset);
  const [prompt, setPrompt] = useState(assistant.system_prompt);
  const [role, setRole] = useState(assistant.role);
  const [building, setBuilding] = useState(false);

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

  // Picking a role card replaces the prompt. Editing the text afterwards
  // makes it custom — leaving a card highlighted next to a prompt it no
  // longer matches is the kind of small lie that costs trust.
  const choosePreset = (id: string) => {
    const chosen = PROMPT_PRESETS.find((option) => option.id === id);
    if (!chosen) return;
    setPreset(id);
    setPrompt(chosen.prompt);
    setRole(chosen.role);
  };

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
      <input type="hidden" name="prompt_preset" value={mode === "custom" ? "custom" : preset} />
      <input type="hidden" name="provider" value={providerId} />
      <input type="hidden" name="remove_api_key" value={String(removeKey)} />

      <div className="space-y-5">
        <SectionCard
          title="Basic Information"
          description="Who this assistant is, and whether it is answering customers right now."
        >
          <div className="grid md:grid-cols-2 gap-4">
            <TextInput
              label="Assistant name"
              name="name"
              defaultValue={assistant.name}
              placeholder="Support Sam"
              required
              hint="Choose a descriptive name for your AI assistant"
            />
            <TextInput
              label="Role"
              name="role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Support agent"
              hint="Named in the prompt: “You are the … for this business.”"
            />
          </div>

          <div className="mt-4">
            <TextInput
              label="Handoff keywords"
              name="handoff_keywords"
              defaultValue={assistant.handoff_keywords.join(", ")}
              placeholder="human, agent, talk to someone"
              hint="Comma separated. Any of these in a message stops the bot on that chat and flags it for a human."
            />
          </div>

          <div className="mt-2 border-t border-white/8 pt-2">
            <Toggle
              name="is_active"
              checked={isActive}
              onChange={setIsActive}
              label="Assistant is live"
              description="When off it is saved but never replies. Chatbots, FAQ and automations keep working."
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Prompt Configuration"
          description="Choose between predefined prompts, write your own, or describe the job and have it written for you."
        >
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-white/10 mb-5">
            {(["predefined", "custom"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === option ? "bg-accent text-[#050508]" : "text-white/55 hover:text-white/85"
                }`}
              >
                {option === "predefined" ? "Predefined Prompts" : "Custom Prompt"}
              </button>
            ))}
          </div>

          {mode === "predefined" && (
            <div className="mb-5">
              <span className="block text-xs font-medium text-white/70 mb-2">
                Select agent role
              </span>
              <div className="space-y-2">
                {PROMPT_PRESETS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => choosePreset(option.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                      preset === option.id
                        ? "border-accent/50 bg-accent/8"
                        : "border-white/10 bg-white/3 hover:border-white/20"
                    }`}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-[11px] text-white/45 mt-0.5">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-xs font-medium text-white/70">Customize prompt</span>
            <button
              type="button"
              onClick={() => setBuilding(true)}
              className="inline-flex items-center gap-1.5 text-xs text-accent-ink hover:underline"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Build with AI
            </button>
          </div>
          <textarea
            name="system_prompt"
            rows={12}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (mode === "predefined") setMode("custom");
            }}
            placeholder="You are the support agent for a fashion brand. Be warm and concise. Never promise delivery dates. If asked about refunds, hand off to a human."
            className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all resize-y leading-relaxed font-mono"
          />
          <span className="block text-[11px] text-white/35 mt-1">
            {prompt.length} characters. Start with a predefined prompt and customize it to fit
            your specific needs — editing makes it custom.
          </span>
        </SectionCard>

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
              <span className="block text-[11px] text-white/35 mt-1">{provider.blurb}</span>
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
                <span className="block text-[11px] text-white/35 mt-1">
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
                  className="text-[11px] text-red-400 hover:underline"
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

                <p className="text-[11px] text-white/35 mt-2 leading-relaxed">
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
          <p className="text-[11px] text-white/35 mt-3">
            WhatsApp cuts a text message at 4096 characters, so replies are trimmed to that
            regardless of the limit set here.
          </p>
        </SectionCard>
      </div>

      {building && (
        <InstructionBuilder
          role={role}
          onClose={() => setBuilding(false)}
          onBuilt={(text) => {
            setPrompt(text);
            setMode("custom");
            setBuilding(false);
          }}
        />
      )}
    </SaveForm>
  );
}

/**
 * Describe the job, get the system prompt. The empty prompt box is where
 * people stall, and what goes in it decides every reply the assistant sends.
 */
function InstructionBuilder({
  role,
  onClose,
  onBuilt,
}: {
  role: string;
  onClose: () => void;
  onBuilt: (prompt: string) => void;
}) {
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const build = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateAssistantInstructions(brief, role);
      if (!result.ok || !result.prompt) {
        setError(result.error ?? "Could not write the instructions.");
        return;
      }
      onBuilt(result.prompt);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 md:p-8 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Build instructions with AI"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div className="glass-card w-full max-w-2xl p-6 my-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-4.5 h-4.5 text-accent-ink" />
              Build the instructions
            </h3>
            <p className="text-xs text-white/45 mt-1.5 leading-relaxed">
              Describe the business and what this assistant should handle. You get a full prompt
              in the box, which you can then edit before saving.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-white/70 mb-1.5">
            What should this assistant do?
          </span>
          <textarea
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            rows={6}
            autoFocus
            disabled={pending}
            placeholder="We're a women's clothing boutique in Pune. Answer questions about sizing, fabric and what's in stock, help people find something for an occasion, and explain the 7-day exchange policy. Anything about a specific order or a refund goes to a human."
            className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent/50 transition-all resize-y leading-relaxed disabled:opacity-60"
          />
        </label>

        <p className="text-[11px] text-white/35 mt-2 leading-relaxed">
          Say what the business is, what the assistant should answer, and what it must never
          decide on its own. Facts it will need but you don&apos;t give are written as
          placeholders for you to fill in.
        </p>

        {error && (
          <p className="text-sm text-red-400 mt-4" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-white/8">
          <span className="text-[11px] text-white/35 mr-auto">
            Runs on your own AI key if you have one saved, otherwise the platform&apos;s.
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/55 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={build}
            disabled={pending || brief.trim().length < 10}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {pending ? "Writing…" : "Write it"}
          </button>
        </div>
      </div>
    </div>
  );
}
