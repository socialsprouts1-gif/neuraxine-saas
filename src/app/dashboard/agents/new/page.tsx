"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Bot,
  Mic,
  Globe,
  Settings2,
  BookOpen,
  Phone,
  AlertTriangle,
  Play,
  Save,
  Info,
} from "lucide-react";
import Link from "next/link";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "bn", label: "Bengali" },
];

const VOICES = [
  { id: "mock-priya-f", name: "Priya", gender: "Female", lang: "Hinglish", provider: "Mock" },
  { id: "mock-arjun-m", name: "Arjun", gender: "Male", lang: "Hindi", provider: "Mock" },
  { id: "mock-emma-f", name: "Emma", gender: "Female", lang: "English", provider: "Mock" },
  { id: "mock-james-m", name: "James", gender: "Male", lang: "English", provider: "Mock" },
  { id: "mock-kavya-f", name: "Kavya", gender: "Female", lang: "Hinglish", provider: "Mock" },
  { id: "mock-rahul-m", name: "Rahul", gender: "Male", lang: "Hinglish", provider: "Mock" },
];

const TABS = [
  { id: "config", label: "Configuration", icon: Settings2 },
  { id: "voice", label: "Voice & Language", icon: Mic },
  { id: "prompt", label: "Prompt & Script", icon: BookOpen },
  { id: "compliance", label: "Compliance", icon: AlertTriangle },
];

export default function NewAgentPage() {
  const [tab, setTab] = useState("config");
  const [form, setForm] = useState({
    name: "",
    direction: "outbound",
    language: "hinglish",
    voiceId: "mock-priya-f",
    systemPrompt: "",
    firstMessage: "",
    llmModel: "gemini-2.0-flash",
    temperature: 0.7,
    maxDuration: 300,
    endCallPhrases: "goodbye, bye, dhanyawad, shukriya",
    disclosureEnabled: true,
    disclosureText: "This call is from an automated AI assistant. You may say goodbye at any time to end the call.",
  });

  const update = (key: string, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/agents" className="p-2 rounded-xl bg-white/5 hover:bg-white/8 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Create Agent</h1>
          <p className="text-white/40 text-sm">Build a new AI voice agent</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/5 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.id ? "bg-[#00FF87]/15 text-[#00FF87] border border-[#00FF87]/20" : "text-white/50 hover:text-white"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        {tab === "config" && (
          <>
            <div className="glass-card p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2"><Bot className="w-4 h-4 text-[#00FF87]" /> Basic Info</h2>
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Agent Name</label>
                <input
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Priya - Sales Agent"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-[#00FF87]/40 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Direction</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: "outbound", label: "Outbound", desc: "Makes calls" },
                    { v: "inbound", label: "Inbound", desc: "Receives calls" },
                    { v: "both", label: "Both", desc: "In + out" },
                  ].map((d) => (
                    <button
                      key={d.v}
                      onClick={() => update("direction", d.v)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        form.direction === d.v
                          ? "border-[#00FF87]/40 bg-[#00FF87]/8"
                          : "border-white/8 bg-white/3 hover:border-white/15"
                      }`}
                    >
                      <div className="text-sm font-medium">{d.label}</div>
                      <div className="text-[11px] text-white/40">{d.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">LLM Model</label>
                  <select
                    value={form.llmModel}
                    onChange={(e) => update("llmModel", e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-[#00FF87]/40 focus:outline-none"
                  >
                    <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Temperature: {form.temperature}</label>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={form.temperature}
                    onChange={(e) => update("temperature", parseFloat(e.target.value))}
                    className="w-full accent-[#00FF87]"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Max Call Duration (seconds)</label>
                <input
                  type="number" value={form.maxDuration}
                  onChange={(e) => update("maxDuration", parseInt(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-[#00FF87]/40 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">End-Call Phrases (comma separated)</label>
                <input
                  value={form.endCallPhrases}
                  onChange={(e) => update("endCallPhrases", e.target.value)}
                  placeholder="goodbye, bye, dhanyawad"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-[#00FF87]/40 focus:outline-none"
                />
              </div>
            </div>
          </>
        )}

        {tab === "voice" && (
          <div className="glass-card p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><Mic className="w-4 h-4 text-[#00D4FF]" /> Voice & Language</h2>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Language</label>
              <div className="grid grid-cols-3 gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => update("language", l.value)}
                    className={`p-2.5 rounded-xl border text-sm font-medium transition-all ${
                      form.language === l.value
                        ? "border-[#00D4FF]/40 bg-[#00D4FF]/8 text-[#00D4FF]"
                        : "border-white/8 bg-white/3 text-white/60 hover:border-white/15"
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 mx-auto mb-1" />
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Voice</label>
              <div className="grid grid-cols-2 gap-2">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => update("voiceId", v.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      form.voiceId === v.id
                        ? "border-[#00D4FF]/40 bg-[#00D4FF]/8"
                        : "border-white/8 bg-white/3 hover:border-white/15"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{v.name}</span>
                      <span className="text-[10px] text-white/40">{v.provider}</span>
                    </div>
                    <div className="text-[11px] text-white/40 mt-0.5">{v.gender} · {v.lang}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "prompt" && (
          <div className="glass-card p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-[#7B2FFF]" /> Prompt & Script</h2>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Opening Message</label>
              <p className="text-[11px] text-white/30 mb-2">The first thing your agent says when a call connects.</p>
              <textarea
                value={form.firstMessage}
                onChange={(e) => update("firstMessage", e.target.value)}
                rows={3}
                placeholder="Namaste! Main Priya bol rahi hoon Acme Corp se..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#7B2FFF]/40 focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">System Prompt</label>
              <p className="text-[11px] text-white/30 mb-2">Instructions for the agent&apos;s behavior, persona, and goals.</p>
              <textarea
                value={form.systemPrompt}
                onChange={(e) => update("systemPrompt", e.target.value)}
                rows={8}
                placeholder="You are Priya, a friendly and professional sales representative for Acme Corp. Your goal is to qualify leads and schedule product demos..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#7B2FFF]/40 focus:outline-none resize-none font-mono text-xs"
              />
            </div>
          </div>
        )}

        {tab === "compliance" && (
          <div className="space-y-4">
            <div className="glass-card p-5 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#FF6B35]" /> India Compliance
              </h2>
              <div className="p-3 rounded-xl bg-[#FF6B35]/8 border border-[#FF6B35]/20 text-xs text-[#FF6B35] flex gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  Outbound promotional calls require a 140-series number with DLT approval. Transactional/service calls use 160/1600-series. The campaign engine enforces this automatically.
                </div>
              </div>
              <div className="flex items-start gap-3">
                <button
                  onClick={() => update("disclosureEnabled", !form.disclosureEnabled)}
                  className={`mt-0.5 w-10 h-5 rounded-full transition-colors ${form.disclosureEnabled ? "bg-[#00FF87]" : "bg-white/15"}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.disclosureEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
                <div>
                  <div className="text-sm font-medium">AI Disclosure (TRAI Required)</div>
                  <div className="text-xs text-white/40 mt-0.5">Agent opens with a disclosure that this is an automated AI call.</div>
                </div>
              </div>
              {form.disclosureEnabled && (
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block">Disclosure Text</label>
                  <textarea
                    value={form.disclosureText}
                    onChange={(e) => update("disclosureText", e.target.value)}
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#FF6B35]/40 focus:outline-none resize-none"
                  />
                </div>
              )}
            </div>

            <div className="glass-card p-5 space-y-3">
              <h2 className="font-semibold flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#00D4FF]" /> Number Series Guide
              </h2>
              {[
                { series: "140-series", use: "Promotional / marketing calls", color: "text-[#FF6B35]", border: "border-[#FF6B35]/20", bg: "bg-[#FF6B35]/5" },
                { series: "160-series", use: "Transactional / OTP / alerts", color: "text-[#00D4FF]", border: "border-[#00D4FF]/20", bg: "bg-[#00D4FF]/5" },
                { series: "1600-series", use: "BFSI / govt / regulated entities only", color: "text-[#7B2FFF]", border: "border-[#7B2FFF]/20", bg: "bg-[#7B2FFF]/5" },
              ].map((s) => (
                <div key={s.series} className={`p-3 rounded-xl border ${s.border} ${s.bg} flex justify-between items-center`}>
                  <span className={`font-mono text-sm font-semibold ${s.color}`}>{s.series}</span>
                  <span className="text-xs text-white/50">{s.use}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 text-sm font-medium transition-colors">
          <Play className="w-4 h-4 text-[#00FF87]" />
          Test Call to My Number
        </button>
        <div className="flex gap-3">
          <button className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/8 text-sm font-medium transition-colors">
            Save as Draft
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00FF87] text-[#050508] text-sm font-semibold hover:bg-[#00FF87]/90 transition-colors">
            <Save className="w-4 h-4" />
            Activate Agent
          </button>
        </div>
      </div>
    </div>
  );
}
