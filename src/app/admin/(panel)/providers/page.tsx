"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import { Server, PhoneCall, Mic, AudioLines, Brain, RefreshCw } from "lucide-react";
import { seedProviders } from "@/lib/data";
import toast, { Toaster } from "react-hot-toast";

const categories = [
  { id: "telephony", label: "Telephony (SIP / PSTN)", icon: PhoneCall, note: "Carries the actual phone calls" },
  { id: "tts", label: "Text-to-Speech", icon: AudioLines, note: "The voices your clients pick" },
  { id: "stt", label: "Speech-to-Text", icon: Mic, note: "Transcribes callers in real time" },
  { id: "llm", label: "Language Models", icon: Brain, note: "The brains behind every conversation" },
] as const;

const statusTag: Record<string, string> = {
  connected: "tag-green",
  degraded: "tag-yellow",
  disconnected: "tag-red",
};

export default function AdminProvidersPage() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: "#10101C", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" } }} />
      <AdminHeader title="Providers" subtitle="Infrastructure vendors powering the platform" />
      <main className="flex-1 p-6 space-y-6">
        {categories.map((cat) => {
          const providers = seedProviders.filter((p) => p.category === cat.id);
          return (
            <div key={cat.id} className="glass-card p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-[#FF9D3C]/12 border border-[#FF9D3C]/25 flex items-center justify-center">
                  <cat.icon className="w-4 h-4 text-[#FF9D3C]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{cat.label}</h3>
                  <p className="text-[11px] text-white/40">{cat.note}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {providers.map((p) => (
                  <div key={p.id} className="p-4 rounded-xl bg-white/3 border border-white/8">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <Server className="w-4 h-4 text-white/30" />
                        <span className="font-medium text-sm">{p.name}</span>
                      </div>
                      <span className={statusTag[p.status]}>{p.status}</span>
                    </div>
                    <div className="flex justify-between text-xs text-white/45 mb-2">
                      <span>Traffic share</span>
                      <span className="font-medium text-white/70">{p.usageShare}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden mb-3">
                      <div
                        className={`h-full rounded-full ${p.status === "degraded" ? "bg-[#FBBF24]" : "bg-gradient-to-r from-[#FF9D3C] to-[#FBBF24]"}`}
                        style={{ width: `${p.usageShare}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/40">{p.costNote}</span>
                      <button
                        onClick={() => toast.success(`${p.name} credentials re-validated`)}
                        className="p-1.5 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-colors"
                        title="Re-validate API keys"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        <p className="text-[11px] text-white/35">
          API keys are stored encrypted (AES-256) and rotated quarterly. Traffic automatically fails over to the next provider when one degrades.
        </p>
      </main>
    </>
  );
}
