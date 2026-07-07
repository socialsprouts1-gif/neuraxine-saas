"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/dashboard/Header";
import { Bot, Plus, PhoneCall, Clock, Target, Trash2, X, ArrowRight, Languages } from "lucide-react";
import type { VoiceAgent } from "@/lib/types";
import { getAgents, createAgent, deleteAgent, updateAgent } from "@/lib/agent-store";
import { AGENT_TEMPLATES, LANGUAGES, VOICES } from "@/lib/constants";
import { formatDuration } from "@/lib/utils";

const statusTag: Record<string, string> = {
  active: "tag-green",
  paused: "tag-yellow",
  draft: "tag-violet",
};

function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState(AGENT_TEMPLATES[0]);
  const [language, setLanguage] = useState("hi-IN");
  const [voice, setVoice] = useState("priya");

  const create = () => {
    const agent = createAgent({
      name: name || `${template.label} Agent`,
      useCase: template.label,
      description: template.description,
      language,
      voice,
      greeting: template.greeting.replace("{{company}}", "your company"),
      systemPrompt: template.prompt,
    });
    router.push(`/dashboard/agents/${agent.id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card !bg-[#10101C] w-full max-w-2xl p-7 max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/8">
          <X className="w-4 h-4 text-white/50" />
        </button>

        <h2 className="text-lg font-bold">Create a voice agent</h2>
        <p className="text-xs text-white/45 mt-1 mb-6">Step {step} of 2 — {step === 1 ? "pick a template" : "name, language & voice"}</p>

        {step === 1 && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              {AGENT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    template.id === t.id
                      ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/10"
                      : "border-white/10 bg-white/3 hover:border-white/25"
                  }`}
                >
                  <div className="text-2xl mb-2">{t.emoji}</div>
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="text-xs text-white/45 mt-1 leading-relaxed">{t.description}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setStep(2)} className="btn-primary w-full mt-6 text-sm">
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <label className="text-xs font-medium text-white/60 mb-1.5 block">Agent name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. Riya — ${template.label}`}
              className="input-dark mb-5"
              autoFocus
            />

            <label className="text-xs font-medium text-white/60 mb-1.5 block">Primary language</label>
            <div className="flex flex-wrap gap-2 mb-5">
              {LANGUAGES.slice(0, 8).map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                    language === l.code
                      ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/15 text-[#A78BFA]"
                      : "border-white/10 text-white/55 hover:border-white/25"
                  }`}
                >
                  {l.native}
                </button>
              ))}
            </div>

            <label className="text-xs font-medium text-white/60 mb-1.5 block">Voice</label>
            <div className="grid sm:grid-cols-2 gap-2.5 mb-6">
              {VOICES.slice(0, 6).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVoice(v.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    voice === v.id
                      ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/10"
                      : "border-white/10 bg-white/3 hover:border-white/25"
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8B5CF6]/40 to-[#22D3EE]/30 flex items-center justify-center text-xs font-bold shrink-0">
                    {v.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{v.name} <span className="text-white/35 text-xs">· {v.gender}</span></div>
                    <div className="text-[11px] text-white/40 truncate">{v.style}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn-secondary flex-1 text-sm">Back</button>
              <button onClick={create} className="btn-primary flex-1 text-sm">
                <Bot className="w-4 h-4" /> Create agent
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AgentsPageInner() {
  const searchParams = useSearchParams();
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    setAgents(getAgents());
    if (searchParams.get("create") === "1") setShowCreate(true);
  }, [searchParams]);

  const remove = (id: string) => {
    deleteAgent(id);
    setAgents(getAgents());
  };

  const toggleStatus = (a: VoiceAgent) => {
    updateAgent(a.id, { status: a.status === "active" ? "paused" : "active" });
    setAgents(getAgents());
  };

  return (
    <>
      <Header title="Voice Agents" subtitle="Create and manage your AI calling agents" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-white/50">{agents.length} agents · Growth plan allows 10</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary !py-2.5 text-sm">
            <Plus className="w-4 h-4" /> Create Agent
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {agents.map((a) => {
            const lang = LANGUAGES.find((l) => l.code === a.language);
            const voice = VOICES.find((v) => v.id === a.voice);
            return (
              <div key={a.id} className="glass-card p-5 flex flex-col hover:border-[#8B5CF6]/40 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8B5CF6]/30 to-[#22D3EE]/20 border border-[#8B5CF6]/25 flex items-center justify-center shrink-0">
                      <Bot className="w-5 h-5 text-[#A78BFA]" />
                    </div>
                    <div className="min-w-0">
                      <Link href={`/dashboard/agents/${a.id}`} className="font-semibold text-sm hover:text-[#A78BFA] transition-colors block truncate">
                        {a.name}
                      </Link>
                      <div className="text-xs text-white/40 truncate">{a.useCase}</div>
                    </div>
                  </div>
                  <span className={statusTag[a.status]}>{a.status}</span>
                </div>

                <p className="text-xs text-white/50 leading-relaxed mb-4 line-clamp-2 flex-1">
                  {a.description || "No description yet — open the agent to configure it."}
                </p>

                <div className="flex items-center gap-2 mb-4 text-xs text-white/45">
                  <span className="tag-cyan !text-[11px]"><Languages className="w-3 h-3 mr-1" />{lang?.label ?? a.language}</span>
                  <span className="tag-violet !text-[11px]">{voice?.name ?? a.voice}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center border-t border-white/8 pt-3.5 mb-4">
                  <div>
                    <div className="flex items-center justify-center gap-1 text-sm font-bold"><PhoneCall className="w-3 h-3 text-white/30" />{a.totalCalls.toLocaleString("en-IN")}</div>
                    <div className="text-[10px] text-white/35 mt-0.5">Calls</div>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-sm font-bold"><Clock className="w-3 h-3 text-white/30" />{a.avgDurationSec ? formatDuration(a.avgDurationSec) : "—"}</div>
                    <div className="text-[10px] text-white/35 mt-0.5">Avg time</div>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1 text-sm font-bold"><Target className="w-3 h-3 text-white/30" />{a.successRate ? `${a.successRate}%` : "—"}</div>
                    <div className="text-[10px] text-white/35 mt-0.5">Success</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link href={`/dashboard/agents/${a.id}`} className="btn-secondary flex-1 !py-2 text-xs">
                    Configure
                  </Link>
                  <button onClick={() => toggleStatus(a)} className="btn-secondary !py-2 !px-3 text-xs">
                    {a.status === "active" ? "Pause" : "Activate"}
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="p-2 rounded-xl border border-white/10 text-white/40 hover:text-[#F87171] hover:border-[#F87171]/40 transition-colors"
                    title="Delete agent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          <button
            onClick={() => setShowCreate(true)}
            className="glass-card p-5 border-dashed !border-[#8B5CF6]/30 flex flex-col items-center justify-center gap-3 min-h-[260px] hover:!border-[#8B5CF6]/60 hover:bg-[#8B5CF6]/5 transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center">
              <Plus className="w-6 h-6 text-[#A78BFA]" />
            </div>
            <div className="text-sm font-semibold">Create a new agent</div>
            <div className="text-xs text-white/40 text-center max-w-[200px]">
              Sales, support, reminders, bookings — live in minutes
            </div>
          </button>
        </div>
      </main>

      {showCreate && <CreateAgentModal onClose={() => setShowCreate(false)} />}
    </>
  );
}

export default function AgentsPage() {
  return (
    <Suspense>
      <AgentsPageInner />
    </Suspense>
  );
}
