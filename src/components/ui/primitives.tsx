import type { ReactNode } from "react";

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
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-white/50 mt-1">{subtitle}</p>}
      </div>
      {action}
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
  return <div className={`glass-card p-6 ${className}`}>{children}</div>;
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
    <div className="glass-card p-12 text-center">
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
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="glass-card p-5">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
        {label}
      </div>
      <div className="text-2xl font-bold mt-2 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-white/40 mt-1">{hint}</div>}
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
                  className="text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-white/40 whitespace-nowrap"
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
  return <td className={`px-5 py-3.5 align-middle ${className}`}>{children}</td>;
}
