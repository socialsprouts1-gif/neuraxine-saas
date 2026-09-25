import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { listConnections, optionLabel } from "@/lib/connections";
import { renameOrganization } from "../actions";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";

export default async function OrganizationsPage() {
  const { orgId, orgName, role, user } = await requireFeature("organizations");
  const supabase = await createClient();
  const canManage = role === "owner" || role === "admin";

  const [{ data: members }, { data: org }, connections] = await Promise.all([
    supabase.from("org_members").select("user_id, role, created_at").eq("org_id", orgId),
    supabase.from("organizations").select("created_at").eq("id", orgId).maybeSingle(),
    // Through listConnections rather than a raw select, because it is the
    // thing that knows a number's actual phone number and name. This page
    // used to print phone_number_id — a 15-digit internal id that nobody
    // can match to any of their own numbers.
    listConnections(supabase, orgId),
  ]);

  const all = members ?? [];

  // Who these people actually are. The list printed the first eight
  // characters of a UUID, which identifies a teammate to nobody — not
  // even to themselves.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, email, full_name")
    .in("user_id", all.map((member) => member.user_id));

  const nameOf = (userId: string) => {
    const profile = (profiles ?? []).find((row) => row.user_id === userId);
    return profile?.full_name?.trim() || profile?.email?.trim() || "Teammate";
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader title="Organization" subtitle="Your workspace, team and connected numbers." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Members" value={all.length} />
        <StatCard label="Owners" value={all.filter((m) => m.role === "owner").length} />
        <StatCard label="Numbers" value={connections.length} />
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
                  <div className="text-sm text-white/80 truncate">
                    {nameOf(m.user_id)}
                    {m.user_id === user.id && (
                      <span className="text-white/35 font-normal"> (you)</span>
                    )}
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
          {connections.length > 0 ? (
            <div className="space-y-2">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between gap-3 bg-white/3 border border-white/8 rounded-xl px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {optionLabel(connection)}
                    </div>
                    {connection.qualityRating && (
                      <div className="text-[11px] text-white/35 mt-0.5">
                        quality {connection.qualityRating.toLowerCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {connection.isDefault && <Badge tone="blue">default</Badge>}
                    <Badge tone={connection.status === "active" ? "green" : "grey"}>
                      {connection.status}
                    </Badge>
                  </div>
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
