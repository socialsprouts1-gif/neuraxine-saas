import { usageRows, type PlanLimits, type UsageSnapshot } from "@/lib/limits";

/**
 * All three limits, whether or not any is close to being hit.
 *
 * Somebody who has to go looking for their usage finds out they were over
 * it from an error message instead.
 */
export default function UsageBars({
  limits,
  usage,
}: {
  limits: PlanLimits;
  usage: UsageSnapshot;
}) {
  const rows = usageRows(limits, usage);

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.kind}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-xs text-white/55">{row.label}</span>
            <span className="text-xs tabular-nums text-white/70">
              {row.used.toLocaleString("en-IN")}
              {row.limit === null ? (
                <span className="text-white/30"> / unlimited</span>
              ) : (
                <span className="text-white/30"> / {row.limit.toLocaleString("en-IN")}</span>
              )}
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                row.fraction !== null && row.fraction >= 1
                  ? "bg-[#F87171]"
                  : row.nearly
                    ? "bg-[#FACC15]"
                    : "bg-accent"
              }`}
              style={{ width: `${Math.round((row.fraction ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
