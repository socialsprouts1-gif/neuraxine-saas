"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/dashboard/Header";
import {
  ArrowLeft,
  Bot,
  Mic,
  Brain,
  BookOpen,
  Plug,
  PhoneCall,
  Save,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
} from "lucide-react";
import type { VoiceAgent } from "@/lib/types";
import { getAgent, updateAgent } from "@/lib/agent-store";
import { LANGUAGES, VOICES, LLM_MODELS } from "@/lib/constants";

const tabs = [
  { id: "persona", label: "Persona & Script", icon: Bot },
  { id: "voice", label: "Voice & Language", icon: Mic },
  { id: "model", label: "Model & Behaviour", icon: Brain },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "integrations", label: "Actions & Integrations", icon: Plug },
  { id: "test", label: "Test Call", icon: PhoneCall },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-10 h-6 rounded-full relative transition-colors ${on ? "bg-[#8B5CF6]" : "bg-white/15"}`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-5" : "left-1"}`}
      />
    </button>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-[#8B5CF6]"
    />
  );
}

export default function AgentBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [agent, setAgent] = useState<VoiceAgent | null>(null);
  const [tab, setTab] = useState("persona");
  const [saved, setSaved] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testState, setTestState] = useState<"idle" | "calling" | "done">("idle");
  const [newFaq, setNewFaq] = useState({ q: "", a: "" });

  useEffect(() => {
    setAgent(getAgent(id) ?? null);
  }, [id]);

  if (!agent) {
    return (
      <>
        <Header title="Agent not found" />
        <main className="flex-1 p-6">
          <div className="glass-card p-10 text-center max-w-md mx-auto mt-10">
            <Bot className="w-10 h-10 text-white/20 mx-auto mb-4" />
            <p className="text-sm text-white/50 mb-5">This agent doesn&apos;t exist or was deleted.</p>
            <Link href="/dashboard/agents" className="btn-primary text-sm">
              <ArrowLeft className="w-4 h-4" /> Back to agents
            </Link>
          </div>
        </main>
      </>
    );
  }

  const patch = (p: Partial<VoiceAgent>) => setAgent({ ...agent, ...p });

  const save = () => {
    updateAgent(agent.id, agent);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const runTestCall = () => {
    setTestState("calling");
    setTimeout(() => setTestState("done"), 2600);
  };

  const selectedVoice = VOICES.find((v) => v.id === agent.voice);

  return (
    <>
      <Header title={agent.name} subtitle={agent.useCase} />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <Link href="/dashboard/agents" className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> All agents
          </Link>
          <div className="flex items-center gap-3">
            <span className={agent.status === "active" ? "tag-green" : agent.status === "paused" ? "tag-yellow" : "tag-violet"}>
              {agent.status}
            </span>
            <button
              onClick={() => patch({ status: agent.status === "active" ? "paused" : "active" })}
              className="btn-secondary !py-2 text-xs"
            >
              {agent.status === "active" ? "Pause agent" : "Activate agent"}
            </button>
            <button onClick={save} className="btn-primary !py-2 text-xs">
              {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? "Saved!" : "Save changes"}
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                tab === t.id
                  ? "bg-[#8B5CF6]/15 text-[#A78BFA] border border-[#8B5CF6]/30"
                  : "text-white/55 border border-transparent hover:bg-white/5 hover:text-white"
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "persona" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card p-6 space-y-5">
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Agent name</label>
                <input value={agent.name} onChange={(e) => patch({ name: e.target.value })} className="input-dark" />
              </div>
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">What does this agent do?</label>
                <input
                  value={agent.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="One-line description shown on the agents list"
                  className="input-dark"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Greeting (first thing the agent says)</label>
                <textarea
                  value={agent.greeting}
                  onChange={(e) => patch({ greeting: e.target.value })}
                  rows={3}
                  className="input-dark resize-none"
                />
              </div>
            </div>
            <div className="glass-card p-6">
              <label className="text-xs font-medium text-white/60 mb-1.5 block">
                System prompt — the agent&apos;s brain
              </label>
              <p className="text-[11px] text-white/35 mb-3">
                Describe who the agent is, what it should do, what it must never do, and when to hand over to a human.
              </p>
              <textarea
                value={agent.systemPrompt}
                onChange={(e) => patch({ systemPrompt: e.target.value })}
                rows={12}
                className="input-dark resize-none font-mono text-xs leading-relaxed"
              />
            </div>
          </div>
        )}

        {tab === "voice" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-4">Language</h3>
              <div className="grid grid-cols-2 gap-2.5">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => patch({ language: l.code })}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all ${
                      agent.language === l.code
                        ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/10 text-white"
                        : "border-white/10 text-white/60 hover:border-white/25"
                    }`}
                  >
                    <span>{l.label}</span>
                    <span className="text-white/40">{l.native}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-white/35 mt-4">
                The agent auto-detects if the caller switches language and follows them (e.g. Hindi → English).
              </p>
            </div>

            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-4">Voice</h3>
              <div className="space-y-2.5 mb-6">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => patch({ voice: v.id })}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      agent.voice === v.id
                        ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/10"
                        : "border-white/10 bg-white/3 hover:border-white/25"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8B5CF6]/40 to-[#22D3EE]/30 flex items-center justify-center text-xs font-bold shrink-0">
                      {v.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{v.name} <span className="text-white/35 text-xs">· {v.gender}</span></div>
                      <div className="text-[11px] text-white/40">{v.style}</div>
                    </div>
                    <Play className="w-4 h-4 text-white/30 shrink-0" />
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs text-white/60 mb-1.5">
                    <span>Speaking rate</span>
                    <span className="text-[#A78BFA] font-medium">{agent.speakingRate.toFixed(2)}×</span>
                  </div>
                  <Slider value={agent.speakingRate} min={0.7} max={1.3} step={0.05} onChange={(v) => patch({ speakingRate: v })} />
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "model" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-4">Language model</h3>
              <div className="space-y-2.5">
                {LLM_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => patch({ model: m.id })}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                      agent.model === m.id
                        ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/10"
                        : "border-white/10 bg-white/3 hover:border-white/25"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-[11px] text-white/40">{m.note}</div>
                    </div>
                    {agent.model === m.id && <CheckCircle2 className="w-4 h-4 text-[#A78BFA]" />}
                  </button>
                ))}
              </div>

              <div className="mt-6">
                <div className="flex justify-between text-xs text-white/60 mb-1.5">
                  <span>Creativity (temperature)</span>
                  <span className="text-[#A78BFA] font-medium">{agent.temperature.toFixed(1)}</span>
                </div>
                <Slider value={agent.temperature} min={0} max={1} step={0.1} onChange={(v) => patch({ temperature: v })} />
                <p className="text-[11px] text-white/35 mt-1.5">
                  Lower = sticks to the script (collections). Higher = more natural chit-chat (sales).
                </p>
              </div>
            </div>

            <div className="glass-card p-6 space-y-5">
              <h3 className="font-semibold text-sm">Call behaviour</h3>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Allow interruptions</div>
                  <div className="text-[11px] text-white/40">Agent stops talking when the caller speaks</div>
                </div>
                <Toggle on={agent.interruptible} onChange={(v) => patch({ interruptible: v })} />
              </div>

              <div>
                <div className="flex justify-between text-xs text-white/60 mb-1.5">
                  <span>Max call duration</span>
                  <span className="text-[#A78BFA] font-medium">{agent.maxCallMinutes} min</span>
                </div>
                <Slider value={agent.maxCallMinutes} min={1} max={20} step={1} onChange={(v) => patch({ maxCallMinutes: v })} />
              </div>

              <div>
                <div className="flex justify-between text-xs text-white/60 mb-1.5">
                  <span>Hang up after silence of</span>
                  <span className="text-[#A78BFA] font-medium">{agent.silenceTimeoutSec}s</span>
                </div>
                <Slider value={agent.silenceTimeoutSec} min={3} max={20} step={1} onChange={(v) => patch({ silenceTimeoutSec: v })} />
              </div>

              <div className="p-3.5 rounded-xl bg-[#FF9D3C]/8 border border-[#FF9D3C]/25 text-[11px] text-white/60 leading-relaxed">
                🇮🇳 <span className="text-[#FF9D3C] font-medium">Compliance guardrails:</span> outbound calls are
                automatically limited to 8 AM – 9 PM IST, DND numbers are scrubbed, and every call opens with a
                disclosure that it&apos;s an AI assistant.
              </div>
            </div>
          </div>
        )}

        {tab === "knowledge" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-1">FAQs & business facts</h3>
              <p className="text-[11px] text-white/35 mb-4">
                The agent answers from these first, before improvising. Add pricing, timings, addresses, policies.
              </p>
              <div className="space-y-3">
                {agent.knowledgeFaqs.map((f, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-white/3 border border-white/8 relative group">
                    <button
                      onClick={() => patch({ knowledgeFaqs: agent.knowledgeFaqs.filter((_, j) => j !== i) })}
                      className="absolute top-2.5 right-2.5 p-1 rounded text-white/25 hover:text-[#F87171] transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="text-sm font-medium pr-6">{f.q}</div>
                    <div className="text-xs text-white/50 mt-1">{f.a}</div>
                  </div>
                ))}
                {agent.knowledgeFaqs.length === 0 && (
                  <div className="text-xs text-white/35 text-center py-6">No FAQs yet — add your first one →</div>
                )}
              </div>
            </div>

            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-4">Add a FAQ</h3>
              <div className="space-y-3.5">
                <input
                  value={newFaq.q}
                  onChange={(e) => setNewFaq({ ...newFaq, q: e.target.value })}
                  placeholder="Question — e.g. What are your timings?"
                  className="input-dark"
                />
                <textarea
                  value={newFaq.a}
                  onChange={(e) => setNewFaq({ ...newFaq, a: e.target.value })}
                  placeholder="Answer the agent should give"
                  rows={3}
                  className="input-dark resize-none"
                />
                <button
                  onClick={() => {
                    if (!newFaq.q.trim() || !newFaq.a.trim()) return;
                    patch({ knowledgeFaqs: [...agent.knowledgeFaqs, newFaq] });
                    setNewFaq({ q: "", a: "" });
                  }}
                  className="btn-primary w-full !py-2.5 text-sm"
                >
                  <Plus className="w-4 h-4" /> Add to knowledge base
                </button>
              </div>

              <div className="mt-6 p-4 rounded-xl border border-dashed border-white/15 text-center">
                <BookOpen className="w-6 h-6 text-white/25 mx-auto mb-2" />
                <div className="text-xs text-white/45">
                  Coming soon: upload PDFs, price lists & product catalogues
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "integrations" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card p-6 space-y-5">
              <h3 className="font-semibold text-sm">After-call actions</h3>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">WhatsApp follow-up</div>
                  <div className="text-[11px] text-white/40">Send links, brochures & confirmations after the call</div>
                </div>
                <Toggle on={agent.whatsappFollowUp} onChange={(v) => patch({ whatsappFollowUp: v })} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Calendar booking</div>
                  <div className="text-[11px] text-white/40">Let the agent book slots in Google Calendar / Calendly</div>
                </div>
                <Toggle on={agent.calendarBooking} onChange={(v) => patch({ calendarBooking: v })} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm">Push to CRM</div>
                  <div className="text-[11px] text-white/40">Zoho, HubSpot, LeadSquared — outcome + recording link</div>
                </div>
                <Toggle on={agent.crmPush} onChange={(v) => patch({ crmPush: v })} />
              </div>
            </div>

            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-1">Webhook</h3>
              <p className="text-[11px] text-white/35 mb-4">
                We POST the transcript, outcome, sentiment and recording URL here the moment a call ends.
              </p>
              <input
                value={agent.webhookUrl}
                onChange={(e) => patch({ webhookUrl: e.target.value })}
                placeholder="https://your-server.in/webhooks/calls"
                className="input-dark font-mono text-xs"
              />
              <div className="mt-4 p-4 rounded-xl bg-[#10101C] border border-white/8 font-mono text-[11px] text-white/50 leading-relaxed overflow-x-auto">
{`{
  "agent_id": "${agent.id}",
  "call_id": "call_xxxxx",
  "status": "completed",
  "outcome": "Demo booked",
  "sentiment": "positive",
  "duration_sec": 148,
  "recording_url": "https://cdn.neuraxine.in/rec/...",
  "transcript": [ ... ]
}`}
              </div>
            </div>
          </div>
        )}

        {tab === "test" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-1">Call your own number</h3>
              <p className="text-[11px] text-white/35 mb-5">
                Hear exactly what your customers will hear. Test calls are free and don&apos;t count against your minutes.
              </p>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Your mobile number</label>
              <input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+91 98XXX XXXXX"
                className="input-dark mb-4"
              />
              <button
                onClick={runTestCall}
                disabled={testState === "calling"}
                className="btn-primary w-full text-sm"
              >
                <PhoneCall className="w-4 h-4" />
                {testState === "calling" ? "Ringing your phone…" : "Call me now"}
              </button>
              {testState === "done" && (
                <div className="mt-4 p-3.5 rounded-xl bg-[#34D399]/10 border border-[#34D399]/25 text-xs text-[#34D399] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Test call queued! {selectedVoice?.name ?? "Your agent"} will call {testPhone || "your number"} within 30 seconds.
                </div>
              )}
            </div>

            <div className="glass-card p-6">
              <h3 className="font-semibold text-sm mb-4">Preview — how the call opens</h3>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <span className="tag-violet shrink-0">{selectedVoice?.name ?? "Agent"}</span>
                  <p className="text-sm text-white/70 leading-relaxed">&ldquo;{agent.greeting}&rdquo;</p>
                </div>
                <div className="flex gap-3 opacity-60">
                  <span className="tag-cyan shrink-0">Caller</span>
                  <p className="text-sm text-white/50 italic">…the customer replies, and the conversation flows from your system prompt.</p>
                </div>
              </div>
              <div className="mt-6 flex items-end justify-center gap-1.5 h-12">
                {[12, 22, 34, 46, 36, 52, 40, 26, 38, 50, 30, 18].map((h, i) => (
                  <div
                    key={i}
                    className="wave-bar w-1.5 bg-gradient-to-t from-[#8B5CF6] to-[#22D3EE]"
                    style={{ height: `${h * 0.7}px`, animationDelay: `${i * 0.08}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
