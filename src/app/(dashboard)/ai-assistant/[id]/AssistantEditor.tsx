"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toggleAiAssistant } from "@/app/(dashboard)/portal-actions";
import type { AiAssistant, AssistantKnowledge } from "@/types/portal";
import SettingsTab from "./SettingsTab";
import KnowledgeTab from "./KnowledgeTab";
import RulesTab from "./RulesTab";
import PersonaTab from "./PersonaTab";
import SafetyTab from "./SafetyTab";
import SetupChecklist from "./SetupChecklist";
import { STEPS, checkSummary, checklist, stepsNeedingWork, type StepKey } from "@/lib/agent-setup";

export default function AssistantEditor({
  assistant,
  knowledge,
  forms,
  hasKey,
}: {
  assistant: AiAssistant;
  knowledge: AssistantKnowledge[];
  /** Forms in this workspace that exist at Meta and could be offered. */
  forms: Array<{
    id: string;
    name: string;
    description: string | null;
    status: string;
    numberLabel: string | null;
  }>;
  /** Resolved on the server: an own key, or a platform key for this provider. */
  hasKey: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>("persona");
  const [pending, startTransition] = useTransition();

  const items = checklist({
    name: assistant.name,
    systemPrompt: assistant.system_prompt,
    primaryLanguage: assistant.primary_language,
    handoffKeywords: assistant.handoff_keywords,
    offHoursMessage: assistant.off_hours_message,
    workingHoursEnabled: assistant.working_hours_enabled,
    useKnowledgeBase: assistant.use_knowledge_base,
    knowledgeCount: knowledge.length,
    hasKey,
  });
  const summary = checkSummary(items);
  const outstanding = stepsNeedingWork(items);

  const toggle = () => {
    const data = new FormData();
    data.set("id", assistant.id);
    data.set("is_active", String(assistant.is_active));
    startTransition(async () => {
      await toggleAiAssistant(data);
      router.refresh();
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/ai-assistant"
            aria-label="Back to all assistants"
            className="p-2 rounded-lg border border-white/12 text-white/50 hover:text-white hover:border-white/25 transition-colors flex-shrink-0 mt-1"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <nav className="text-xs text-white/40 mb-1">
              <Link href="/dashboard" className="hover:text-white/70">
                Dashboard
              </Link>
              {" > "}
              <Link href="/ai-assistant" className="hover:text-white/70">
                AI Assistant
              </Link>
              {" > Edit"}
            </nav>
            <h1 className="text-2xl font-bold tracking-tight truncate">Build your AI agent</h1>
          </div>
        </div>

        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
            assistant.is_active
              ? "border border-white/15 text-white/70 hover:text-white hover:border-white/30"
              : "bg-accent text-[#050508] hover:bg-[var(--accent-strong)]"
          }`}
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {assistant.is_active ? "Pause assistant" : "Set live"}
        </button>
      </div>

      {/* Five numbered steps in the order the decisions depend on each
          other. The editor used to be three tabs with no opinion about
          order, and an agent could be saved with no instructions, no key
          and no handoff — none of which announce themselves until a real
          customer is on the other end. */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
        {STEPS.map((entry, index) => {
          const here = step === entry.key;
          const needsWork = outstanding.has(entry.key);

          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setStep(entry.key)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border whitespace-nowrap transition-all ${
                here
                  ? "border-accent/50 bg-accent/10"
                  : "border-white/10 bg-white/3 hover:border-white/20"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${
                  here ? "bg-accent text-[#050508]" : "bg-white/8 text-white/50"
                }`}
              >
                {index + 1}
              </span>
              <span className="text-left">
                <span
                  className={`block text-[13px] font-semibold leading-tight ${
                    here ? "text-white" : "text-white/60"
                  }`}
                >
                  {entry.label}
                  {needsWork && (
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-[#FACC15] ml-1.5 align-middle"
                      aria-label="Something is still missing on this step"
                    />
                  )}
                </span>
                <span className="block text-[10.5px] text-white/35 leading-tight">
                  {entry.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* The two states that make an assistant look fine and answer nothing. */}
      {!hasKey && (
        <div className="rounded-xl border border-[#F87171]/25 bg-[#F87171]/8 p-4 mb-5">
          {/* Deliberately not "No API key for Anthropic". The provider is a
              choice made two steps away and changed in a dropdown; naming
              whichever one happens to be selected reads as though the
              product only works with that one. */}
          <div className="text-sm font-semibold text-[#F87171] mb-1">No API key</div>
          <p className="text-xs text-white/50 leading-relaxed">
            This agent is saved but cannot generate a single reply. Choose your provider and paste
            its key under AI Configuration on the Model step — OpenAI, Anthropic, Google and any
            OpenAI-compatible endpoint all work.
          </p>
        </div>
      )}
      {hasKey && !assistant.is_active && (
        <div className="rounded-xl border border-white/12 bg-white/4 p-4 mb-5">
          <div className="text-sm font-semibold mb-1">Paused</div>
          <p className="text-xs text-white/50 leading-relaxed">
            Ready to go, but not answering anything yet. Press “Set live” when the instructions
            read the way you want them to.
          </p>
        </div>
      )}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <div className="min-w-0">
          {step === "persona" && <PersonaTab assistant={assistant} />}
          {step === "model" && <SettingsTab assistant={assistant} />}
          {step === "knowledge" && (
            <KnowledgeTab
              assistantId={assistant.id}
              entries={knowledge}
              enabled={assistant.use_knowledge_base}
            />
          )}
          {step === "safety" && <SafetyTab assistant={assistant} />}
          {step === "settings" && <RulesTab assistant={assistant} forms={forms} />}
        </div>

        {/* The part that earns its space. A step rail says where you are;
            only this says what to do next. */}
        <SetupChecklist items={items} summary={summary} onGo={setStep} />
      </div>
    </div>
  );
}
