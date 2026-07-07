"use client";

import { useState } from "react";
import Header from "@/components/dashboard/Header";
import { Wallet, Zap, Download, IndianRupee } from "lucide-react";
import { seedTransactions } from "@/lib/data";
import { PLANS } from "@/lib/constants";
import { formatINR } from "@/lib/utils";
import toast, { Toaster } from "react-hot-toast";

const rechargeOptions = [1000, 5000, 10000, 25000];

const typeTag: Record<string, string> = {
  recharge: "tag-green",
  usage: "tag-violet",
  rental: "tag-cyan",
  refund: "tag-yellow",
};

export default function BillingPage() {
  const [amount, setAmount] = useState(5000);

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: "#10101C", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" } }} />
      <Header title="Billing & Wallet" subtitle="Recharge, plan and GST invoices" />
      <main className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <div className="text-xs text-white/40 mb-1">Wallet balance</div>
                <div className="text-4xl font-extrabold flex items-center gap-2">
                  ₹31,299 <span className="tag-green !text-[10px]">Auto-recharge ON</span>
                </div>
                <div className="text-xs text-white/40 mt-1.5">≈ 6,950 minutes remaining at current rates</div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-[#34D399]/12 border border-[#34D399]/25 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-[#34D399]" />
              </div>
            </div>

            <div className="text-xs font-medium text-white/60 mb-2.5">Quick recharge (UPI · Netbanking · Cards)</div>
            <div className="flex gap-2.5 flex-wrap mb-4">
              {rechargeOptions.map((r) => (
                <button
                  key={r}
                  onClick={() => setAmount(r)}
                  className={`px-4 py-2 rounded-xl text-sm border transition-all ${
                    amount === r
                      ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/12 text-[#A78BFA] font-semibold"
                      : "border-white/10 text-white/55 hover:border-white/25"
                  }`}
                >
                  {formatINR(r)}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <IndianRupee className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="input-dark !pl-9"
                />
              </div>
              <button
                onClick={() => toast.success(`Redirecting to Razorpay for ${formatINR(amount)}…`)}
                className="btn-primary text-sm"
              >
                <Zap className="w-4 h-4" /> Recharge now
              </button>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="text-xs text-white/40 mb-1">Current plan</div>
            <div className="text-2xl font-extrabold gradient-text">Growth</div>
            <div className="text-xs text-white/40 mt-1 mb-5">₹7,999/month · renews 1 Aug 2026</div>

            <div className="space-y-2.5 mb-5">
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Minutes used</span>
                <span className="font-medium">1,840 / 2,000</span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE]" style={{ width: "92%" }} />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/50">Agents</span>
                <span className="font-medium">3 / 10</span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#22D3EE]" style={{ width: "30%" }} />
              </div>
            </div>

            <button
              onClick={() => toast.success("Our team will call you about Scale plan!")}
              className="btn-secondary w-full !py-2.5 text-sm"
            >
              Upgrade to Scale — {formatINR(PLANS[2].priceInr)}/mo
            </button>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold">Transactions</h3>
              <p className="text-xs text-white/40">GST invoices generated on the 1st of every month</p>
            </div>
            <button className="btn-secondary !py-2 text-xs">
              <Download className="w-3.5 h-3.5" /> Download invoices
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/40 border-b border-white/8">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Description</th>
                  <th className="pb-3 font-medium">Type</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {seedTransactions.map((t) => (
                  <tr key={t.id} className="border-b border-white/5 last:border-0">
                    <td className="py-3.5 text-white/60 whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-3.5">{t.description}</td>
                    <td className="py-3.5"><span className={typeTag[t.type]}>{t.type}</span></td>
                    <td className="py-3.5"><span className="tag-green">{t.status}</span></td>
                    <td className={`py-3.5 text-right font-medium ${t.amountInr > 0 ? "text-[#34D399]" : "text-white/70"}`}>
                      {t.amountInr > 0 ? "+" : ""}{formatINR(t.amountInr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}
