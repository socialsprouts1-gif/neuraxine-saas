"use client";

import Header from "@/components/dashboard/Header";
import { Upload, ShieldCheck, UserPlus } from "lucide-react";
import { seedContacts } from "@/lib/data";
import { timeAgo } from "@/lib/utils";

export default function ContactsPage() {
  return (
    <>
      <Header title="Contacts" subtitle="Your calling lists, DND-scrubbed automatically" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-white/50">
            <ShieldCheck className="w-4 h-4 text-[#34D399]" />
            {seedContacts.filter((c) => !c.dnd).length} callable · {seedContacts.filter((c) => c.dnd).length} on TRAI DND (auto-excluded)
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary !py-2.5 text-sm">
              <Upload className="w-4 h-4" /> Import CSV
            </button>
            <button className="btn-primary !py-2.5 text-sm">
              <UserPlus className="w-4 h-4" /> Add Contact
            </button>
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/40 border-b border-white/8 bg-white/2">
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium">Phone</th>
                  <th className="p-4 font-medium">City</th>
                  <th className="p-4 font-medium">Tags</th>
                  <th className="p-4 font-medium">DND</th>
                  <th className="p-4 font-medium text-right">Last called</th>
                </tr>
              </thead>
              <tbody>
                {seedContacts.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8B5CF6]/30 to-[#22D3EE]/20 flex items-center justify-center text-xs font-bold">
                          {c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                        </div>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-white/60 font-mono text-xs">{c.phone}</td>
                    <td className="p-4 text-white/60">{c.city}</td>
                    <td className="p-4">
                      <div className="flex gap-1.5 flex-wrap">
                        {c.tags.map((t) => (
                          <span key={t} className="tag-violet !text-[10px] !px-2 !py-0.5">{t}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4">
                      {c.dnd ? <span className="tag-red">DND</span> : <span className="tag-green">Callable</span>}
                    </td>
                    <td className="p-4 text-white/40 text-right">{timeAgo(c.lastCalled)}</td>
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
