"use client";

import AdminHeader from "@/components/admin/AdminHeader";
import { Bot } from "lucide-react";
import { seedAgents, seedClients } from "@/lib/data";
import { LANGUAGES } from "@/lib/constants";
import { formatDuration } from "@/lib/utils";

const owners = ["SharmaTech Solutions", "FinServe NBFC", "Dr. Mehta Dental Clinic"];

const statusTag: Record<string, string> = {
  active: "tag-green",
  paused: "tag-yellow",
  draft: "tag-violet",
};

export default function AdminAgentsPage() {
  return (
    <>
      <AdminHeader title="All Agents" subtitle="Voice agents across every client account" />
      <main className="flex-1 p-6">
        <div className="flex items-center gap-4 mb-6 text-sm text-white/50">
          <span className="flex items-center gap-1.5">
            <Bot className="w-4 h-4 text-[#A78BFA]" /> {seedClients.reduce((s, c) => s + c.agents, 0)} agents platform-wide
          </span>
          <span className="tag-green">Showing recently active</span>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/40 border-b border-white/8 bg-white/2">
                  <th className="p-4 font-medium">Agent</th>
                  <th className="p-4 font-medium">Client</th>
                  <th className="p-4 font-medium">Use case</th>
                  <th className="p-4 font-medium">Language</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Calls</th>
                  <th className="p-4 font-medium">Avg duration</th>
                  <th className="p-4 font-medium text-right">Success</th>
                </tr>
              </thead>
              <tbody>
                {seedAgents.map((a, i) => (
                  <tr key={a.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#8B5CF6]/15 border border-[#8B5CF6]/25 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-[#A78BFA]" />
                        </div>
                        <span className="font-medium">{a.name}</span>
                      </div>
                    </td>
                    <td className="p-4 text-white/60">{owners[i % owners.length]}</td>
                    <td className="p-4 text-white/60">{a.useCase}</td>
                    <td className="p-4 text-white/60">{LANGUAGES.find((l) => l.code === a.language)?.label ?? a.language}</td>
                    <td className="p-4"><span className={statusTag[a.status]}>{a.status}</span></td>
                    <td className="p-4 text-white/60">{a.totalCalls.toLocaleString("en-IN")}</td>
                    <td className="p-4 text-white/60">{a.avgDurationSec ? formatDuration(a.avgDurationSec) : "—"}</td>
                    <td className="p-4 text-right font-medium text-[#34D399]">{a.successRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-white/35 mt-4">
          Agent prompts and recordings are only accessible with client consent or an active abuse investigation, per the platform privacy policy.
        </p>
      </main>
    </>
  );
}
