"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toggleAiAssistant } from "@/app/(dashboard)/portal-actions";
import { providerById } from "@/lib/ai-providers";
import type { AiAssistant, AssistantKnowledge } from "@/types/portal";
import SettingsTab from "./SettingsTab";
import KnowledgeTab from "./KnowledgeTab";
import RulesTab from "./RulesTab";

const TABS = ["Settings", "Knowledge Base", "Agent Rules"] as const;
type Tab = (typeof TABS)[number];

export default function AssistantEditor({
  assistant,
  knowledge,
  hasKey,
}: {
  assistant: AiAssistant;
  knowledge: AssistantKnowledge[];
  /** Resolved on the server: an own key, or a platform key for this provider. */
  hasKey: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Settings");
  const [pending, startTransition] = useTransition();

  const provider = providerById(assistant.provider);

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
    <div className="p-6 md:p-8 max-w-5xl">
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
            <h1 className="text-2xl font-bold tracking-tight truncate">Edit AI Assistant</h1>
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

      <div className="flex gap-6 border-b border-white/10 mb-6 overflow-x-auto">
        {TABS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`pb-3 -mb-px text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === option
                ? "border-accent text-accent-ink"
                : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            {option}
            {option === "Knowledge Base" && knowledge.length > 0 && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md bg-white/8 text-white/50">
                {knowledge.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* The two states that make an assistant look fine and answer nothing. */}
      {!hasKey && (
        <div className="rounded-xl border border-[#F87171]/25 bg-[#F87171]/8 p-4 mb-5">
          <div className="text-sm font-semibold text-[#F87171] mb-1">
            No API key for {provider?.name ?? assistant.provider}
          </div>
          <p className="text-xs text-white/50 leading-relaxed">
            This assistant is saved but cannot generate a single reply. Paste a key under AI
            Configuration on the Settings tab
            {provider?.envVar ? `, or set ${provider.envVar} in the environment.` : "."}
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

      {tab === "Settings" && <SettingsTab assistant={assistant} />}
      {tab === "Knowledge Base" && (
        <KnowledgeTab
          assistantId={assistant.id}
          entries={knowledge}
          enabled={assistant.use_knowledge_base}
        />
      )}
      {tab === "Agent Rules" && <RulesTab assistant={assistant} />}
    </div>
  );
}
