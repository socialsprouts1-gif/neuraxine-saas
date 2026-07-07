"use client";

import { useState } from "react";
import Header from "@/components/dashboard/Header";
import { Copy, RefreshCw, KeyRound, Building2, Bell } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

export default function SettingsPage() {
  const [profile, setProfile] = useState({
    name: "Nikhil Sharma",
    company: "SharmaTech Solutions",
    email: "nikhil@sharmatech.in",
    phone: "+91 98201 11xxx",
    gstin: "27AABCS1234A1Z5",
  });
  const [notifs, setNotifs] = useState({ lowBalance: true, campaignDone: true, dailySummary: false });

  const apiKey = "nx_live_sk_9f2b8e17d4a6c3f0b5e8a2d7";

  const set = (k: keyof typeof profile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setProfile({ ...profile, [k]: e.target.value });

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: "#10101C", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" } }} />
      <Header title="Settings" subtitle="Profile, API keys and notifications" />
      <main className="flex-1 p-6 space-y-6 max-w-4xl">
        <div className="glass-card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <Building2 className="w-4 h-4 text-[#A78BFA]" />
            <h3 className="font-semibold text-sm">Business profile</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Your name</label>
              <input value={profile.name} onChange={set("name")} className="input-dark" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Company</label>
              <input value={profile.company} onChange={set("company")} className="input-dark" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Email</label>
              <input value={profile.email} onChange={set("email")} className="input-dark" />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Phone</label>
              <input value={profile.phone} onChange={set("phone")} className="input-dark" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-white/60 mb-1.5 block">GSTIN (for invoices)</label>
              <input value={profile.gstin} onChange={set("gstin")} className="input-dark font-mono" />
            </div>
          </div>
          <button onClick={() => toast.success("Profile saved")} className="btn-primary !py-2.5 text-sm mt-5">
            Save profile
          </button>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2.5 mb-2">
            <KeyRound className="w-4 h-4 text-[#22D3EE]" />
            <h3 className="font-semibold text-sm">API key</h3>
          </div>
          <p className="text-[11px] text-white/35 mb-4">
            Trigger calls programmatically — POST to <code className="text-[#22D3EE]">api.neuraxine.in/v1/calls</code> with this key.
          </p>
          <div className="flex gap-2.5">
            <input readOnly value={apiKey} className="input-dark font-mono text-xs flex-1" />
            <button
              onClick={() => {
                navigator.clipboard.writeText(apiKey);
                toast.success("API key copied");
              }}
              className="btn-secondary !px-3.5"
              title="Copy"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={() => toast.success("New key generated (demo)")} className="btn-secondary !px-3.5" title="Rotate key">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <Bell className="w-4 h-4 text-[#FF9D3C]" />
            <h3 className="font-semibold text-sm">Notifications</h3>
          </div>
          <div className="space-y-4">
            {(
              [
                ["lowBalance", "Low wallet balance", "WhatsApp + email when balance goes below ₹2,000"],
                ["campaignDone", "Campaign completed", "Summary with connection & conversion rates"],
                ["dailySummary", "Daily digest", "Yesterday's calls, minutes and outcomes at 9 AM"],
              ] as const
            ).map(([key, title, desc]) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <div className="text-sm">{title}</div>
                  <div className="text-[11px] text-white/40">{desc}</div>
                </div>
                <button
                  onClick={() => setNotifs({ ...notifs, [key]: !notifs[key] })}
                  className={`w-10 h-6 rounded-full relative transition-colors ${notifs[key] ? "bg-[#8B5CF6]" : "bg-white/15"}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${notifs[key] ? "left-5" : "left-1"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
