"use client";

import { useState } from "react";
import AdminHeader from "@/components/admin/AdminHeader";
import { LifeBuoy, CheckCircle2 } from "lucide-react";
import { seedTickets } from "@/lib/data";
import type { SupportTicket } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import toast, { Toaster } from "react-hot-toast";

const priorityTag: Record<string, string> = {
  urgent: "tag-red",
  high: "tag-saffron",
  medium: "tag-yellow",
  low: "tag-cyan",
};

const statusTag: Record<string, string> = {
  open: "tag-red",
  "in-progress": "tag-yellow",
  resolved: "tag-green",
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>(seedTickets);

  const resolve = (t: SupportTicket) => {
    setTickets(tickets.map((x) => (x.id === t.id ? { ...x, status: "resolved" as const } : x)));
    toast.success(`Ticket ${t.id} marked resolved`);
  };

  return (
    <>
      <Toaster position="top-right" toastOptions={{ style: { background: "#10101C", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" } }} />
      <AdminHeader title="Support Desk" subtitle="Client tickets — urgent ones first" />
      <main className="flex-1 p-6">
        <div className="flex items-center gap-4 mb-6 text-sm text-white/50">
          <span className="flex items-center gap-1.5">
            <LifeBuoy className="w-4 h-4 text-[#FF9D3C]" /> {tickets.filter((t) => t.status !== "resolved").length} open
          </span>
          <span className="tag-green">{tickets.filter((t) => t.status === "resolved").length} resolved this week</span>
        </div>

        <div className="space-y-4 max-w-4xl">
          {[...tickets]
            .sort((a, b) => (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0))
            .map((t) => (
              <div key={t.id} className={`glass-card p-5 ${t.status === "resolved" ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                      <span className="font-semibold text-sm">{t.subject}</span>
                      <span className={priorityTag[t.priority]}>{t.priority}</span>
                      <span className={statusTag[t.status]}>{t.status}</span>
                    </div>
                    <div className="text-xs text-white/40">
                      {t.client} · #{t.id} · opened {timeAgo(t.createdAt)} · last update {timeAgo(t.lastUpdate)}
                    </div>
                  </div>
                  {t.status !== "resolved" && (
                    <button onClick={() => resolve(t)} className="btn-secondary !py-2 text-xs whitespace-nowrap">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark resolved
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      </main>
    </>
  );
}
