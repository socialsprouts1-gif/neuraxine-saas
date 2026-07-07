import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaUp,
  accent = "#A78BFA",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  accent?: string;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center border"
          style={{ backgroundColor: `${accent}1f`, borderColor: `${accent}40` }}
        >
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        {delta && (
          <span className={`flex items-center gap-1 text-xs font-medium ${deltaUp ? "text-[#34D399]" : "text-[#F87171]"}`}>
            {deltaUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {delta}
          </span>
        )}
      </div>
      <div className="text-2xl font-extrabold tracking-tight">{value}</div>
      <div className="text-xs text-white/45 mt-1">{label}</div>
    </div>
  );
}
