"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { saveAssistantPersona } from "@/app/(dashboard)/portal-actions";
import { SaveForm, SectionCard, TextInput, Toggle } from "./EditorControls";
import InstructionBuilder from "./InstructionBuilder";
import { PROMPT_PRESETS } from "@/lib/ai-providers";
import { LANGUAGES, TONES, styleInstructions } from "@/lib/agent-setup";
import type { AiAssistant } from "@/types/portal";

// Step one: who the agent is and how it speaks.
//
// In front of the model and the knowledge because it is the part a
// non-technical person has a real opinion about, and because two of the
// settings in here did not exist before. The language and the tone were
// things you had to remember to type into a free-text box — nothing on
// screen said they were choices at all.
//
// The preview under the pickers is the actual sentences the model will be
// given. A dropdown whose effect you cannot see is one people change at
// random until something works.

export default function PersonaTab({ assistant }: { assistant: AiAssistant }) {
  const [language, setLanguage] = useState(assistant.primary_language || "en");
  const [multilingual, setMultilingual] = useState(assistant.multilingual_reply);
  const [tone, setTone] = useState(assistant.tone || "professional");

  const [mode, setMode] = useState<"predefined" | "custom">(
    assistant.prompt_preset === "custom" ? "custom" : "predefined"
  );
  const [preset, setPreset] = useState(assistant.prompt_preset);
  const [prompt, setPrompt] = useState(assistant.system_prompt);
  const [role, setRole] = useState(assistant.role);
  const [building, setBuilding] = useState(false);

  const preview = styleInstructions({ language, multilingual, tone });

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

  const select =
    "w-full bg-white/5 border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-accent/50 transition-all";

  return (
    <SaveForm action={saveAssistantPersona} label="Save persona">
      <input type="hidden" name="id" value={assistant.id} />
      <input type="hidden" name="prompt_preset" value={mode === "custom" ? "custom" : preset} />

      <div className="space-y-5">
        <SectionCard
          title="Who it is"
          description="The name and the job. Both are named in the prompt, so both change how it answers."
        >
          <div className="grid md:grid-cols-2 gap-4">
            <TextInput
              label="Agent name"
              name="name"
              defaultValue={assistant.name}
              placeholder="Support Sam"
              required
              hint="How it introduces itself."
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
        </SectionCard>

        <SectionCard
          title="How it speaks"
          description="What your customers are answered in, and in what register."
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">
                Primary language
              </label>
              <select
                name="primary_language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className={select}
              >
                {LANGUAGES.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                    {entry.native !== entry.label ? ` (${entry.native})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
                Hinglish is its own choice rather than a flavour of Hindi. It is what a lot of
                customers actually type, and an agent told &ldquo;Hindi&rdquo; answers those in
                Devanagari, which reads as a different person replying.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">Tone</label>
              <select
                name="tone"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
                className={select}
              >
                {TONES.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
                {TONES.find((entry) => entry.key === tone)?.hint}
              </p>
            </div>
          </div>

          <div className="mt-2 border-t border-white/8 pt-2">
            <Toggle
              name="multilingual_reply"
              checked={multilingual}
              onChange={setMultilingual}
              label="Multilingual auto-reply"
              description="If a customer writes in another language, answer in theirs instead of the one above."
            />
          </div>

          {/* The actual sentences, not a description of them. */}
          {preview && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/4 p-3.5">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-1.5">
                What the model is told
              </span>
              <p className="text-[12.5px] text-white/60 leading-relaxed">{preview}</p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="AI instructions"
          description="Start from a role, write your own, or describe the job and have it written for you. These override the pickers above where they disagree."
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
                    <div className="text-[12px] text-white/45 mt-0.5">{option.description}</div>
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
          <span className="block text-[12px] text-white/35 mt-1">
            {prompt.length} characters. Write what it must <em>not</em> do as well as what it
            must — an agent with only a job description will cheerfully invent a refund policy
            when somebody asks for one.
          </span>
        </SectionCard>
      </div>

      {building && (
        <InstructionBuilder
          role={role}
          onClose={() => setBuilding(false)}
          onBuilt={(text: string) => {
            setPrompt(text);
            setMode("custom");
            setBuilding(false);
          }}
        />
      )}
    </SaveForm>
  );
}
