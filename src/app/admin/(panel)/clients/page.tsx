"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { Building2, Ban, CheckCircle2, Wallet, X } from "lucide-react";
import { seedClients } from "@/lib/data";
import type { ClientAccount } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import toast, { Toaster } from "react-hot-toast";

const statusTag: Record<string, string> = {
  active: "tag-green",
  trial: "tag-cyan",
  suspended: "tag-red",
};

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientAccount[]>(seedClients);
  const [selected, setSelected] = useState<ClientAccount | null>(null);
  const [credit, setCredit] = useState(1000);

  const toggleSuspend = (c: ClientAccount) => {
    const next: ClientAccount = { ...c, status: c.status === "suspended" ? "active" : "suspended" };
    setClients(clients.map((x) => (x.id === c.id ? next : x)));
    setSelected(next);
    toast.success(next.status === "suspended" ? `${c.company} suspended` : `${c.company} re-activated`);
  };

  const addCredit = (c: ClientAccount) => {
    const next = { ...c, walletInr: c.walletInr + credit };
    setClients(clients.map((x) => (x.id === c.id ? next : x)));
    setSelected(next);
    toast.success(`${formatINR(credit)} credited to ${c.company}`);
  };

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: "#10101C", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" } }} />
      <AdminHeader title="Clients" subtitle="Every business account on the platform" />
      <main className="flex-1 p-6">
        <div className="flex items-center gap-4 mb-6 text-sm text-white/50 flex-wrap">
          <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-[#FF9D3C]" /> {clients.length} accounts</span>
          <span className="tag-green">{clients.filter((c) => c.status === "active").length} active</span>
          <span className="tag-cyan">{clients.filter((c) => c.status === "trial").length} on trial</span>
          <span className="tag-red">{clients.filter((c) => c.status === "suspended").length} suspended</span>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/40 border-b border-white/8 bg-white/2">
                  <th className="p-4 font-medium">Company</th>
                  <th className="p-4 font-medium">Owner</th>
                  <th className="p-4 font-medium">Plan</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Agents</th>
                  <th className="p-4 font-medium">Minutes (Jul)</th>
                  <th className="p-4 font-medium">Wallet</th>
                  <th className="p-4 font-medium text-right">MRR</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="border-b border-white/5 last:border-0 hover:bg-white/3 cursor-pointer transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-medium">{c.company}</div>
                      <div className="text-xs text-white/35">{c.city} · since {new Date(c.joinedAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-white/70">{c.owner}</div>
                      <div className="text-xs text-white/35">{c.email}</div>
                    </td>
                    <td className="p-4"><span className="tag-violet">{c.plan}</span></td>
                    <td className="p-4"><span className={statusTag[c.status]}>{c.status}</span></td>
                    <td className="p-4 text-white/60">{c.agents}</td>
                    <td className="p-4 text-white/60">{c.minutesThisMonth.toLocaleString("en-IN")}</td>
                    <td className={`p-4 font-medium ${c.walletInr < 0 ? "text-[#F87171]" : "text-white/70"}`}>{formatINR(c.walletInr)}</td>
                    <td className="p-4 text-right font-medium">{formatINR(c.mrrInr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md bg-[#0B0B14] border-l border-white/10 h-full overflow-y-auto p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="font-bold">{selected.company}</h2>
                <p className="text-xs text-white/40">{selected.owner} · {selected.phone}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-white/8">
                <X className="w-4 h-4 text-white/50" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="glass-card p-4">
                <div className="text-lg font-bold">{formatINR(selected.walletInr)}</div>
                <div className="text-[10px] text-white/40 mt-0.5">Wallet balance</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-lg font-bold">{formatINR(selected.mrrInr)}</div>
                <div className="text-[10px] text-white/40 mt-0.5">MRR from client</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-lg font-bold">{selected.agents}</div>
                <div className="text-[10px] text-white/40 mt-0.5">Voice agents</div>
              </div>
              <div className="glass-card p-4">
                <div className="text-lg font-bold">{selected.minutesThisMonth.toLocaleString("en-IN")}</div>
                <div className="text-[10px] text-white/40 mt-0.5">Minutes this month</div>
              </div>
            </div>

            <div className="glass-card p-4 mb-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/60 mb-3">
                <Wallet className="w-3.5 h-3.5 text-[#34D399]" /> Adjust wallet credit
              </div>
              <div className="flex gap-2.5">
                <input
                  type="number"
                  value={credit}
                  onChange={(e) => setCredit(Number(e.target.value))}
                  className="input-dark flex-1"
                />
                <button onClick={() => addCredit(selected)} className="btn-secondary !py-2 text-xs whitespace-nowrap">
                  Add credit
                </button>
              </div>
            </div>

            <button
              onClick={() => toggleSuspend(selected)}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-all ${
                selected.status === "suspended"
                  ? "border-[#34D399]/40 text-[#34D399] hover:bg-[#34D399]/10"
                  : "border-[#F87171]/40 text-[#F87171] hover:bg-[#F87171]/10"
              }`}
            >
              {selected.status === "suspended" ? (
                <><CheckCircle2 className="w-4 h-4" /> Re-activate account</>
              ) : (
                <><Ban className="w-4 h-4" /> Suspend account</>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
