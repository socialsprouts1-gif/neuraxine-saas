"use client";

import Header from "@/components/dashboard/Header";
import { Hash, Plus, PhoneCall } from "lucide-react";
import { seedNumbers } from "@/lib/data";
import { formatINR } from "@/lib/utils";

export default function NumbersPage() {
  return (
    <>
      <Header title="Phone Numbers" subtitle="Virtual & toll-free numbers for your agents" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-white/50">
            {seedNumbers.length} numbers · provisioned via Exotel, Plivo & Tata Tele after KYC
          </p>
          <button className="btn-primary !py-2.5 text-sm">
            <Plus className="w-4 h-4" /> Buy Number
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {seedNumbers.map((n) => (
            <div key={n.id} className="glass-card p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FF9D3C]/12 border border-[#FF9D3C]/25 flex items-center justify-center">
                    <Hash className="w-5 h-5 text-[#FF9D3C]" />
                  </div>
                  <div>
                    <div className="font-semibold font-mono">{n.number}</div>
                    <div className="text-xs text-white/40">{n.city} · via {n.provider}</div>
                  </div>
                </div>
                <span className={n.status === "active" ? "tag-green" : "tag-yellow"}>{n.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-white/35 mb-0.5">Type</div>
                  <div className="font-medium capitalize">{n.type}</div>
                </div>
                <div>
                  <div className="text-white/35 mb-0.5">Assigned to</div>
                  <div className="font-medium truncate flex items-center gap-1">
                    {n.assignedAgent !== "—" && <PhoneCall className="w-3 h-3 text-[#A78BFA] shrink-0" />}
                    {n.assignedAgent.split(" — ")[0]}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 mb-0.5">Rent</div>
                  <div className="font-medium">{formatINR(n.monthlyRentInr)}/mo</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-card p-6">
          <h3 className="font-semibold text-sm mb-4">Available cities for new virtual numbers</h3>
          <div className="flex flex-wrap gap-2.5">
            {["Mumbai", "Delhi NCR", "Bengaluru", "Hyderabad", "Chennai", "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Lucknow", "Kochi", "Indore", "Chandigarh", "1800 Toll-free"].map((c) => (
              <span key={c} className="tag-cyan !rounded-full !px-4 !py-1.5">{c}</span>
            ))}
          </div>
          <p className="text-[11px] text-white/35 mt-4">
            KYC documents (GST certificate + authorised signatory PAN) are required by DoT regulations before a number activates.
          </p>
        </div>
      </main>
    </>
  );
}
