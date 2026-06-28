"use client";

import { motion } from "framer-motion";
import { Plug, Check } from "lucide-react";
import Header from "@/components/dashboard/Header";
import { useApi, mutate } from "@/lib/use-api";

interface Integration {
  id: string; key: string; name: string; description: string; category: string; connected: boolean;
}

const catColor: Record<string, string> = {
  "E-commerce": "#00FF87", Productivity: "#00D4FF", CRM: "#A855F7",
  Payments: "#F59E0B", Automation: "#EC4899", AI: "#00FF87",
};

export default function IntegrationsPage() {
  const { data, refetch } = useApi<{ integrations: Integration[] }>("/api/integrations");
  const integrations = data?.integrations ?? [];

  async function toggle(int: Integration) {
    await mutate("/api/integrations", "PATCH", { id: int.id, connected: !int.connected });
    refetch();
  }

  return (
    <div className="bg-[#050508] min-h-full">
      <Header title="Integrations" subtitle="Connect your stack to WhatsApp automation" />
      <div className="p-6 space-y-6">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00FF87]/12 border border-[#00FF87]/25 flex items-center justify-center">
            <Plug className="w-5 h-5 text-[#00FF87]" />
          </div>
          <div>
            <div className="font-semibold">{integrations.filter((i) => i.connected).length} connected</div>
            <div className="text-xs text-white/45">{integrations.length} integrations available</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {integrations.map((int, i) => {
            const color = catColor[int.category] ?? "#888";
            return (
              <motion.div key={int.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass-card p-5 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg" style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}>
                    {int.name.charAt(0)}
                  </div>
                  {int.connected && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#00FF87]/12 text-[#00FF87] border border-[#00FF87]/25 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Connected
                    </span>
                  )}
                </div>
                <h3 className="font-semibold">{int.name}</h3>
                <span className="text-[11px] mt-0.5" style={{ color }}>{int.category}</span>
                <p className="text-sm text-white/50 mt-2 flex-1 leading-snug">{int.description}</p>
                <button
                  onClick={() => toggle(int)}
                  className={`mt-4 w-full py-2 rounded-xl text-sm font-medium transition-colors ${
                    int.connected
                      ? "bg-white/5 border border-white/12 text-white/60 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                      : "bg-[#00FF87]/10 border border-[#00FF87]/25 text-[#00FF87] hover:bg-[#00FF87]/20"
                  }`}
                >
                  {int.connected ? "Disconnect" : "Connect"}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
