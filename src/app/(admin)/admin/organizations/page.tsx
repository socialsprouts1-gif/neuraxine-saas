import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { assignPlan } from "../actions";
import ActionForm from "@/components/ui/ActionForm";
import { PageHeader, Badge, Table, Td, EmptyState, statusTone } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";
import type { SubscriptionStatus } from "@/types/admin";

const SUBSCRIPTION_STATUS_OPTIONS: SubscriptionStatus[] = [
  "active",
  "trialing",
  "past_due",
  "cancelled",
  "expired",
];

export default async function AdminOrganizationsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: orgs, error }, { data: plans }, { data: subs }, { data: members }, { data: connections }] =
    await Promise.all([
      supabase.from("organizations").select("id, name, created_at, suspended_at, feature_overrides").order("created_at", { ascending: false }).limit(200),
      supabase
        .from("plans")
        .select("id, name, billing_interval")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("subscriptions")
        .select("org_id, status, plan_id, current_period_end, plans(name)"),
      supabase.from("org_members").select("org_id"),
      supabase.from("waba_connections").select("org_id, status"),
    ]);

  // Index the related rows once so the table render stays O(n) instead of
  // scanning these arrays per organisation.
  const subByOrg = new Map((subs ?? []).map((s) => [s.org_id, s]));
  const memberCount = new Map<string, number>();
  for (const m of members ?? []) memberCount.set(m.org_id, (memberCount.get(m.org_id) ?? 0) + 1);
  const connByOrg = new Map((connections ?? []).map((c) => [c.org_id, c]));

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Organizations"
        subtitle={`${orgs?.length ?? 0} tenant${orgs?.length === 1 ? "" : "s"} on this deployment.`}
      />

      {error ? (
        <EmptyState title="Couldn't load organizations" description={error.message} />
      ) : orgs && orgs.length > 0 ? (
        <Table head={["Organization", "Members", "WhatsApp", "Plan", "Created", "Assign plan", ""]}>
          {orgs.map((o) => {
            const sub = subByOrg.get(o.id);
            const plan = sub?.plans as { name: string } | null | undefined;
            const conn = connByOrg.get(o.id);
            return (
              <tr key={o.id} className="hover:bg-white/3 transition-colors">
                <Td>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/organizations/${o.id}`}
                      className="font-medium hover:text-accent-ink transition-colors"
                    >
                      {o.name}
                    </Link>
                    {o.suspended_at && <Badge tone="red">suspended</Badge>}
                    {Object.keys(o.feature_overrides ?? {}).length > 0 && (
                      <Badge tone="purple">
                        {Object.keys(o.feature_overrides).length} override
                        {Object.keys(o.feature_overrides).length === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-white/30">{o.id.slice(0, 8)}…</div>
                </Td>
                <Td className="tabular-nums">{memberCount.get(o.id) ?? 0}</Td>
                <Td>
                  {conn ? (
                    <Badge tone={statusTone(conn.status)}>{conn.status}</Badge>
                  ) : (
                    <span className="text-white/30 text-xs">Not connected</span>
                  )}
                </Td>
                <Td>
                  {sub ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{plan?.name ?? "Custom"}</span>
                        <Badge tone={statusTone(sub.status)}>{sub.status}</Badge>
                      </div>
                      {sub.current_period_end && (
                        <div className="text-[11px] text-white/35 mt-0.5">
                          {new Date(sub.current_period_end) < new Date() ? "expired" : "renews"}{" "}
                          {formatDate(sub.current_period_end)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-white/30 text-xs">No plan</span>
                  )}
                </Td>
                <Td className="text-white/40 text-xs whitespace-nowrap">{formatDate(o.created_at)}</Td>
                <Td>
                  <ActionForm action={assignPlan} submitLabel="Assign" compact>
                    <input type="hidden" name="org_id" value={o.id} />
                    <select
                      name="plan_id"
                      className="bg-white/5 border border-white/12 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#A855F7]/50 mb-2 w-full"
                      defaultValue={sub?.plan_id ?? ""}
                    >
                      <option value="" className="bg-[var(--surface-3)]">
                        Select plan…
                      </option>
                      {(plans ?? []).map((p) => (
                        <option key={p.id} value={p.id} className="bg-[var(--surface-3)]">
                          {p.name} · {p.billing_interval}
                        </option>
                      ))}
                    </select>

                    {/* Assigning is not only "make this org paid". A trial, a
                        lapsed card and a cancellation are all things support
                        has to set, and without this they were a SQL edit. */}
                    <select
                      name="status"
                      className="bg-white/5 border border-white/12 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#A855F7]/50 mb-2 w-full"
                      defaultValue={sub?.status ?? "active"}
                    >
                      {SUBSCRIPTION_STATUS_OPTIONS.map((value) => (
                        <option key={value} value={value} className="bg-[var(--surface-3)]">
                          {value}
                        </option>
                      ))}
                    </select>
                  </ActionForm>
                </Td>
                <Td className="text-right whitespace-nowrap">
                  <Link
                    href={`/admin/organizations/${o.id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/60 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Access
                  </Link>
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <EmptyState
          title="No organizations yet"
          description="An organization is created automatically the first time someone signs up."
        />
      )}
    </div>
  );
}
