"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { Layers, Pencil, X } from "lucide-react";
import { seedPlans } from "@/lib/data";
import type { Plan } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import toast, { Toaster } from "react-hot-toast";

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>(seedPlans);
  const [editing, setEditing] = useState<Plan | null>(null);

  const save = () => {
    if (!editing) return;
    setPlans(plans.map((p) => (p.id === editing.id ? editing : p)));
    toast.success(`${editing.name} plan updated`);
    setEditing(null);
  };

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: "#10101C", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" } }} />
      <AdminHeader title="Plans & Pricing" subtitle="What your clients pay — edits apply from next billing cycle" />
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {plans.map((p) => (
            <div key={p.id} className="glass-card p-6 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#FF9D3C]/12 border border-[#FF9D3C]/25 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-[#FF9D3C]" />
                </div>
                <button
                  onClick={() => setEditing({ ...p })}
                  className="p-2 rounded-lg border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <h3 className="font-bold">{p.name}</h3>
              <div className="text-2xl font-extrabold mt-1">
                {formatINR(p.priceInr)}<span className="text-xs text-white/40 font-normal">/mo</span>
              </div>
              <div className="text-xs text-white/45 mt-2 space-y-1 flex-1">
                <div>{p.includedMinutes.toLocaleString("en-IN")} min included</div>
                <div>₹{p.overagePerMinInr}/min overage</div>
                <div>{p.maxAgents >= 999 ? "Unlimited" : p.maxAgents} agents · {p.concurrency} concurrent</div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/8 flex items-center justify-between">
                <span className="text-xs text-white/40">Active clients</span>
                <span className="tag-green">{p.activeClients}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-white/40">Revenue</span>
                <span className="text-sm font-semibold">{formatINR(p.priceInr * p.activeClients, { compact: true })}/mo</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative glass-card !bg-[#10101C] w-full max-w-md p-7">
            <button onClick={() => setEditing(null)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/8">
              <X className="w-4 h-4 text-white/50" />
            </button>
            <h2 className="text-lg font-bold mb-6">Edit {editing.name} plan</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-white/60 mb-1.5 block">Price (₹/month)</label>
                  <input
                    type="number"
                    value={editing.priceInr}
                    onChange={(e) => setEditing({ ...editing, priceInr: Number(e.target.value) })}
                    className="input-dark"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/60 mb-1.5 block">Included minutes</label>
                  <input
                    type="number"
                    value={editing.includedMinutes}
                    onChange={(e) => setEditing({ ...editing, includedMinutes: Number(e.target.value) })}
                    className="input-dark"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/60 mb-1.5 block">Overage (₹/min)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editing.overagePerMinInr}
                    onChange={(e) => setEditing({ ...editing, overagePerMinInr: Number(e.target.value) })}
                    className="input-dark"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/60 mb-1.5 block">Max agents</label>
                  <input
                    type="number"
                    value={editing.maxAgents}
                    onChange={(e) => setEditing({ ...editing, maxAgents: Number(e.target.value) })}
                    className="input-dark"
                  />
                </div>
              </div>
              <button onClick={save} className="btn-primary w-full text-sm">Save plan</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
