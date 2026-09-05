import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { assignPlan } from "../actions";
import ActionForm from "@/components/ui/ActionForm";
import { PageHeader, Badge, Table, Td, EmptyState, statusTone } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";

export default async function AdminOrganizationsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: orgs, error }, { data: plans }, { data: subs }, { data: members }, { data: connections }] =
    await Promise.all([
      supabase.from("organizations").select("id, name, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("plans").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("subscriptions").select("org_id, status, plan_id, plans(name)"),
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
        <Table head={["Organization", "Members", "WhatsApp", "Plan", "Created", "Assign plan"]}>
          {orgs.map((o) => {
            const sub = subByOrg.get(o.id);
            const plan = sub?.plans as { name: string } | null | undefined;
            const conn = connByOrg.get(o.id);
            return (
              <tr key={o.id} className="hover:bg-white/3 transition-colors">
                <Td>
                  <div className="font-medium">{o.name}</div>
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
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{plan?.name ?? "Custom"}</span>
                      <Badge tone={statusTone(sub.status)}>{sub.status}</Badge>
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
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </ActionForm>
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
