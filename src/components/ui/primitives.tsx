import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Shared shells so every page in the app lands on the same grid, spacing and
// glass treatment rather than each screen inventing its own.

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-start sm:justify-between gap-3 sm:gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-white/50 mt-1">{subtitle}</p>}
      </div>
      {/* Below sm the action drops under the title and fills the width
          rather than being squeezed onto the same line as a long heading. */}
      {action && <div className="flex-shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  );
}

/**
 * The wide gradient banner that opens a section screen. Distinct from
 * PageHeader, which is a plain title row for screens that lead with data.
 */
export function HeroHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-accent/15 via-accent/8 to-accent2/10 border border-accent/20 p-7 md:p-9 mb-6">
      <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-white/60 mt-2">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`glass-card p-4 sm:p-6 ${className}`}>{children}</div>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-card p-8 sm:p-12 text-center">
      <h3 className="font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-white/50 max-w-sm mx-auto">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  meter,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** A glyph for the thing being counted. Anchors a row of these. */
  icon?: LucideIcon;
  /**
   * A part-of-whole bar under the number, when the number is a share of
   * something — "1 of 2 products sendable" says more than "1" does.
   * Left off when the stat is a plain total, where a bar would be
   * decoration pretending to be data.
   */
  meter?: { value: number; of: number; tone?: "accent" | "warn" };
}) {
  const share =
    meter && meter.of > 0 ? Math.max(0, Math.min(1, meter.value / meter.of)) : null;

  return (
    <div className="glass-card p-5 sm:p-6 min-w-0">
      <div className="flex items-start justify-between gap-3">
        {/* Wraps rather than truncating: two of these sit side by side on a
            phone, and half a word is worse than two lines. */}
        <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider sm:tracking-widest text-white/40 leading-tight">
          {label}
        </div>
        {Icon && <Icon className="w-4 h-4 text-white/25 flex-shrink-0" />}
      </div>

      {/* Proportional figures, not tabular: tabular-nums gives every digit
          the width of a zero, which makes a standalone number like 121
          look loose at this size. Tabular is for columns that must line
          up vertically. */}
      <div className="text-2xl sm:text-3xl font-bold mt-2.5 truncate">{value}</div>

      {share !== null && (
        <div
          className="mt-3 h-1.5 rounded-full overflow-hidden"
          // The unfilled track is a lighter step of the fill's own ramp,
          // so the state reads across the whole bar rather than the fill
          // floating on a neutral grey.
          style={{
            // A neutral groove, not a tint of the fill's own hue.
            //
            // The usual advice — track as a lighter step of the fill's
            // ramp — assumes a light surface, where a pale tint reads as
            // empty. On near-black, any tint of a bright hue reads as
            // ink: a meter at zero looked exactly like a meter at full,
            // which is the one thing a meter must never do. Checked by
            // rendering the zero case and looking at it.
            background: "color-mix(in oklab, var(--color-white) 10%, transparent)",
          }}
          role="img"
          aria-label={`${meter!.value} of ${meter!.of}`}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${share * 100}%`,
              background: meter?.tone === "warn" ? "#FACC15" : "var(--accent)",
            }}
          />
        </div>
      )}

      {hint && <div className="text-xs text-white/40 mt-2">{hint}</div>}
    </div>
  );
}

const TONES = {
  green: "bg-accent/10 text-accent-ink border-accent/20",
  blue: "bg-accent2/10 text-accent2-ink border-accent2/20",
  purple: "bg-[#A855F7]/10 text-[#A855F7] border-[#A855F7]/20",
  amber: "bg-[#FACC15]/10 text-[#FACC15] border-[#FACC15]/20",
  red: "bg-[#F87171]/10 text-[#F87171] border-[#F87171]/20",
  grey: "bg-white/5 text-white/50 border-white/10",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "grey" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-medium border ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

// Status vocabularies are shared across screens, so their colour mapping
// lives here rather than being re-picked per page.
export function statusTone(status: string): Tone {
  switch (status) {
    case "active":
    case "paid":
    case "approved":
    case "resolved":
    case "delivered":
    case "read":
      return "green";
    case "trialing":
    case "open":
    case "running":
    case "sent":
      return "blue";
    case "scheduled":
    case "pending":
    case "draft":
      return "amber";
    case "failed":
    case "past_due":
    case "cancelled":
    case "expired":
    case "rejected":
    case "urgent":
      return "red";
    default:
      return "grey";
  }
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-white/8">
              {head.map((h) => (
                <th
                  key={h}
                  className="text-left px-4 sm:px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-white/40 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 sm:px-5 py-3.5 align-middle ${className}`}>{children}</td>;
}
