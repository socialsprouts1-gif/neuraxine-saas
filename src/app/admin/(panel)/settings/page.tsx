"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { ShieldCheck, Percent, Bell, Globe } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

export default function AdminSettingsPage() {
  const [platform, setPlatform] = useState({
    trialMinutes: 50,
    trialDays: 7,
    gstPercent: 18,
    lowBalanceAlertInr: 2000,
  });
  const [toggles, setToggles] = useState({
    newSignups: true,
    autoSuspendNegative: true,
    weeklyReport: true,
    maintenanceMode: false,
  });

  const set = (k: keyof typeof platform) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPlatform({ ...platform, [k]: Number(e.target.value) });

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: "#10101C", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" } }} />
      <AdminHeader title="Platform Settings" subtitle="Global configuration — affects all clients" />
      <main className="flex-1 p-6 space-y-6 max-w-4xl">
        <div className="glass-card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <Percent className="w-4 h-4 text-[#FF9D3C]" />
            <h3 className="font-semibold text-sm">Trials, tax & thresholds</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Free trial minutes</label>
              <input type="number" value={platform.trialMinutes} onChange={set("trialMinutes")} className="input-dark" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Trial duration (days)</label>
              <input type="number" value={platform.trialDays} onChange={set("trialDays")} className="input-dark" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">GST on invoices (%)</label>
              <input type="number" value={platform.gstPercent} onChange={set("gstPercent")} className="input-dark" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Low-balance alert (₹)</label>
              <input type="number" value={platform.lowBalanceAlertInr} onChange={set("lowBalanceAlertInr")} className="input-dark" />
            </div>
          </div>
          <button onClick={() => toast.success("Platform settings saved")} className="btn-primary !py-2.5 text-sm mt-5">
            Save settings
          </button>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <ShieldCheck className="w-4 h-4 text-[#34D399]" />
            <h3 className="font-semibold text-sm">Platform controls</h3>
          </div>
          <div className="space-y-4">
            {(
              [
                ["newSignups", "Accept new signups", "Turn off during capacity crunches"],
                ["autoSuspendNegative", "Auto-suspend negative wallets", "Suspend accounts whose balance stays below ₹0 for 3 days"],
                ["weeklyReport", "Weekly owner report", "Revenue, churn and usage summary every Monday 9 AM"],
                ["maintenanceMode", "Maintenance mode", "Pauses all outbound campaigns platform-wide — use carefully"],
              ] as const
            ).map(([key, title, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="text-sm">{title}</div>
                  <div className="text-[11px] text-white/40">{desc}</div>
                </div>
                <button
                  onClick={() => {
                    const next = { ...toggles, [key]: !toggles[key] };
                    setToggles(next);
                    if (key === "maintenanceMode" && next.maintenanceMode) {
                      toast("⚠️ Maintenance mode ON — campaigns paused (demo)");
                    }
                  }}
                  className={`w-10 h-6 rounded-full relative transition-colors ${toggles[key] ? "bg-[#FF9D3C]" : "bg-white/15"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${toggles[key] ? "left-5" : "left-1"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2.5 mb-2">
            <Globe className="w-4 h-4 text-[#22D3EE]" />
            <h3 className="font-semibold text-sm">Compliance registrations</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-4 text-xs">
            <div className="p-3.5 rounded-xl bg-white/3 border border-white/8">
              <div className="text-white/40 mb-1">TRAI Principal Entity ID (DLT)</div>
              <div className="font-mono">110200004512</div>
            </div>
            <div className="p-3.5 rounded-xl bg-white/3 border border-white/8">
              <div className="text-white/40 mb-1">DoT OSP Registration</div>
              <div className="font-mono">OSP/MH/2025/8841</div>
            </div>
            <div className="p-3.5 rounded-xl bg-white/3 border border-white/8">
              <div className="text-white/40 mb-1">GSTIN</div>
              <div className="font-mono">27AABCN1234F1Z5</div>
            </div>
            <div className="p-3.5 rounded-xl bg-white/3 border border-white/8">
              <div className="text-white/40 mb-1">Data residency</div>
              <div>All recordings stored in Mumbai region 🇮🇳</div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
