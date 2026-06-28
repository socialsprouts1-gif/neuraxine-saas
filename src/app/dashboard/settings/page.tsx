"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, Smartphone, Save, Globe, CheckCircle, AlertCircle, Bot, FlaskConical } from "lucide-react";
import Header from "@/components/dashboard/Header";
import { useApi, mutate } from "@/lib/use-api";

interface Settings {
  businessName: string; businessEmail: string; website: string; whatsappNumber: string;
  autoReplyEnabled: boolean; sandboxMode: boolean;
}
interface SettingsResponse { settings: Settings; whatsappConfigured: boolean; webhookPath: string }

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`relative w-11 rounded-full transition-colors ${on ? "bg-[#00FF87]" : "bg-white/15"}`} style={{ height: 24 }}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const { data, refetch } = useApi<SettingsResponse>("/api/settings");
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (data?.settings) setForm(data.settings); }, [data]);

  async function patch(partial: Partial<Settings>) {
    if (!form) return;
    const next = { ...form, ...partial };
    setForm(next);
    await mutate("/api/settings", "PATCH", partial);
    refetch();
  }
  async function save() {
    if (!form) return;
    await mutate("/api/settings", "PATCH", form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!form || !data) return <div className="bg-[#050508] min-h-full"><Header title="Settings" /></div>;

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Settings" subtitle="Account, WhatsApp connection and automation behaviour" />
      <div className="p-6 max-w-3xl space-y-5">
        {/* WhatsApp connection */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Smartphone className="w-4 h-4 text-[#00FF87]" /> WhatsApp Cloud API</h3>
          <div className={`flex items-center gap-3 p-3 rounded-xl border mb-4 ${data.whatsappConfigured ? "bg-[#00FF87]/8 border-[#00FF87]/20" : "bg-[#F59E0B]/8 border-[#F59E0B]/20"}`}>
            {data.whatsappConfigured ? <CheckCircle className="w-5 h-5 text-[#00FF87]" /> : <AlertCircle className="w-5 h-5 text-[#F59E0B]" />}
            <div className="text-sm">
              <div className="font-medium">{data.whatsappConfigured ? "Credentials detected" : "No credentials set"}</div>
              <div className="text-xs text-white/45">
                {data.whatsappConfigured
                  ? "Live sending is available. Turn off sandbox to send real messages."
                  : "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in your environment."}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5">Webhook URL</label>
            <div className="flex items-center gap-2 bg-white/5 border border-white/12 rounded-xl px-4 py-3">
              <Globe className="w-4 h-4 text-white/40" />
              <code className="text-sm text-[#00D4FF] font-mono">{`https://<your-domain>${data.webhookPath}`}</code>
            </div>
            <p className="text-[11px] text-white/35 mt-1.5">Register this in Meta → WhatsApp → Configuration, subscribed to the “messages” field.</p>
          </div>
        </motion.div>

        {/* Automation behaviour */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-6 space-y-4">
          <h3 className="font-semibold flex items-center gap-2"><Bot className="w-4 h-4 text-[#00D4FF]" /> Automation</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Auto-reply rules</div>
              <div className="text-xs text-white/45">Run keyword chatbot rules on incoming messages.</div>
            </div>
            <Toggle on={form.autoReplyEnabled} onClick={() => patch({ autoReplyEnabled: !form.autoReplyEnabled })} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 text-[#A855F7]" /> Sandbox mode</div>
              <div className="text-xs text-white/45">Simulate sends instead of calling the real Cloud API. Great for testing.</div>
            </div>
            <Toggle on={form.sandboxMode} onClick={() => patch({ sandboxMode: !form.sandboxMode })} />
          </div>
        </motion.div>

        {/* Business profile */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><SettingsIcon className="w-4 h-4 text-white/60" /> Business profile</h3>
          <div className="space-y-4">
            {([
              ["Business Name", "businessName"], ["Business Email", "businessEmail"],
              ["Website", "website"], ["WhatsApp Number", "whatsappNumber"],
            ] as const).map(([label, key]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-white/60 mb-1.5">{label}</label>
                <input value={form[key] as string} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full bg-white/5 border border-white/12 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00FF87]/50" />
              </div>
            ))}
          </div>
          <button onClick={save} className="btn-primary text-sm py-2.5 px-6 mt-5">
            <Save className="w-4 h-4" /> {saved ? "Saved!" : "Save Changes"}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
