import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { renameOrganization } from "../actions";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";

export default async function OrganizationsPage() {
  const { orgId, orgName, role, user } = await requireOrg();
  const supabase = await createClient();
  const canManage = role === "owner" || role === "admin";

  const [{ data: members }, { data: org }, { data: connections }] = await Promise.all([
    supabase.from("org_members").select("user_id, role, created_at").eq("org_id", orgId),
    supabase.from("organizations").select("created_at").eq("id", orgId).maybeSingle(),
    supabase.from("waba_connections").select("phone_number_id, status").eq("org_id", orgId),
  ]);

  const all = members ?? [];

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader title="Organization" subtitle="Your workspace, team and connected numbers." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Members" value={all.length} />
        <StatCard label="Owners" value={all.filter((m) => m.role === "owner").length} />
        <StatCard label="Numbers" value={connections?.length ?? 0} />
        <StatCard label="Created" value={formatDate(org?.created_at ?? null)} />
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="font-semibold mb-1">Organization name</h2>
          <p className="text-sm text-white/50 mb-5">Shown across the workspace and on invoices.</p>
          {canManage ? (
            <ActionForm action={renameOrganization} submitLabel="Save name">
              <Field label="Name" name="name" required defaultValue={orgName} />
            </ActionForm>
          ) : (
            <p className="text-sm">{orgName}</p>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Team</h2>
          <p className="text-sm text-white/50 mb-5">
            Owners and admins can manage connections, billing and integrations. Members can use
            the inbox and campaigns.
          </p>
          <div className="space-y-2">
            {all.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center justify-between gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-white/70 truncate">
                    {m.user_id === user.id ? `${m.user_id.slice(0, 8)}… (you)` : `${m.user_id.slice(0, 8)}…`}
                  </div>
                  <div className="text-[10px] text-white/35">joined {formatDate(m.created_at)}</div>
                </div>
                <Badge tone={m.role === "owner" ? "green" : m.role === "admin" ? "blue" : "grey"}>
                  {m.role}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-white/35 mt-4">
            Inviting teammates by email needs transactional email, which isn&apos;t wired up yet.
            For now, have them sign up and an owner can add their membership row.
          </p>
        </Card>

        <Card>
          <h2 className="font-semibold mb-1">Connected numbers</h2>
          <p className="text-sm text-white/50 mb-5">Manage these from Settings.</p>
          {connections && connections.length > 0 ? (
            <div className="space-y-2">
              {connections.map((c) => (
                <div
                  key={c.phone_number_id}
                  className="flex items-center justify-between bg-white/3 border border-white/8 rounded-xl px-4 py-3"
                >
                  <code className="text-sm">{c.phone_number_id}</code>
                  <Badge tone={c.status === "active" ? "green" : "grey"}>{c.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/40">No numbers connected yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
