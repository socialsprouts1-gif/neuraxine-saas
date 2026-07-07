"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import StatCard from "@/components/ui/StatCard";
import { IndianRupee, ReceiptText, TrendingUp, AlertCircle, Download } from "lucide-react";
import { formatINR } from "@/lib/utils";

const payments = [
  { id: "pay_881", date: "2026-07-07", client: "FinServe NBFC", description: "Wallet recharge (Netbanking)", method: "Razorpay", amountInr: 50000, status: "success" },
  { id: "pay_880", date: "2026-07-06", client: "SharmaTech Solutions", description: "Wallet recharge (UPI)", method: "Razorpay", amountInr: 10000, status: "success" },
  { id: "pay_879", date: "2026-07-05", client: "UrbanNest Realty", description: "Growth plan renewal", method: "Card (auto)", amountInr: 7999, status: "success" },
  { id: "pay_878", date: "2026-07-05", client: "Ayurveda Wellness Co", description: "Enterprise invoice #INV-2026-441", method: "NEFT", amountInr: 62000, status: "pending" },
  { id: "pay_877", date: "2026-07-04", client: "Dr. Mehta Dental Clinic", description: "Starter plan renewal", method: "UPI (auto)", amountInr: 2499, status: "success" },
  { id: "pay_876", date: "2026-07-03", client: "SwiftCabs", description: "Starter plan renewal", method: "Card (auto)", amountInr: 2499, status: "failed" },
  { id: "pay_875", date: "2026-07-02", client: "Kanchi Silks", description: "Trial → Growth upgrade attempt", method: "UPI", amountInr: 7999, status: "failed" },
];

const statusTag: Record<string, string> = {
  success: "tag-green",
  pending: "tag-yellow",
  failed: "tag-red",
};

export default function AdminPaymentsPage() {
  const collected = payments.filter((p) => p.status === "success").reduce((s, p) => s + p.amountInr, 0);

  return (
    <>
      <AdminHeader title="Payments" subtitle="Recharges, renewals and settlements via Razorpay" />
      <main className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={IndianRupee} label="Collected this week" value={formatINR(collected)} delta="+14%" deltaUp accent="#34D399" />
          <StatCard icon={ReceiptText} label="GST invoices (Jul)" value="203" delta="auto-generated" deltaUp accent="#22D3EE" />
          <StatCard icon={TrendingUp} label="Avg recharge size" value="₹14,280" delta="+₹1,900" deltaUp accent="#A78BFA" />
          <StatCard icon={AlertCircle} label="Failed payments" value="2" delta="needs follow-up" accent="#F87171" />
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold">Recent transactions</h3>
              <p className="text-xs text-white/40">Settlements hit the bank account T+2 working days</p>
            </div>
            <button className="btn-secondary !py-2 text-xs">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/40 border-b border-white/8">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Client</th>
                  <th className="pb-3 font-medium">Description</th>
                  <th className="pb-3 font-medium">Method</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 last:border-0">
                    <td className="py-3.5 text-white/60 whitespace-nowrap">
                      {new Date(p.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </td>
                    <td className="py-3.5 font-medium">{p.client}</td>
                    <td className="py-3.5 text-white/60">{p.description}</td>
                    <td className="py-3.5 text-white/60">{p.method}</td>
                    <td className="py-3.5"><span className={statusTag[p.status]}>{p.status}</span></td>
                    <td className="py-3.5 text-right font-medium">{formatINR(p.amountInr)}</td>
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
