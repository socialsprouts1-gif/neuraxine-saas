import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/types/admin";

export default async function AdminUsersPage() {
  await requirePlatformAdmin();

  const supabase = await createClient();

  // Memberships come through the normal client (RLS lets staff read all of
  // them). Email and last-sign-in live in auth.users, which is only
  // reachable through the Admin API, so that part needs the service role.
  const { data: memberships, error } = await supabase
    .from("org_members")
    .select("user_id, role, created_at, organizations(id, name)")
    .order("created_at", { ascending: false })
    .limit(200);

  let emailById = new Map<string, { email: string; lastSignIn: string | null }>();
  let authError: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listError) {
      authError = listError.message;
    } else {
      emailById = new Map(
        data.users.map((u) => [
          u.id,
          { email: u.email ?? "—", lastSignIn: u.last_sign_in_at ?? null },
        ])
      );
    }
  } catch (e) {
    authError = e instanceof Error ? e.message : "Could not reach the auth admin API";
  }

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Users"
        subtitle={`${memberships?.length ?? 0} membership${memberships?.length === 1 ? "" : "s"} across all organizations.`}
      />

      {authError && (
        <div className="glass-card p-4 mb-4 border-l-2 border-l-[#FACC15]">
          <p className="text-sm text-white/60">
            Showing memberships without email addresses — {authError}. This usually means
            SUPABASE_SERVICE_ROLE_KEY is missing or wrong.
          </p>
        </div>
      )}

      {error ? (
        <EmptyState title="Couldn't load users" description={error.message} />
      ) : memberships && memberships.length > 0 ? (
        <Table head={["User", "Email", "Organization", "Role", "Joined", "Last sign in"]}>
          {memberships.map((m) => {
            const org = m.organizations as { id: string; name: string } | null;
            const auth = emailById.get(m.user_id);
            return (
              <tr key={`${m.user_id}-${org?.id}`} className="hover:bg-white/3 transition-colors">
                <Td className="font-mono text-[11px] text-white/50">{m.user_id.slice(0, 8)}…</Td>
                <Td className="font-medium">{auth?.email ?? <span className="text-white/30">—</span>}</Td>
                <Td>{org?.name ?? <span className="text-white/30">—</span>}</Td>
                <Td>
                  <Badge tone={m.role === "owner" ? "green" : m.role === "admin" ? "blue" : "grey"}>
                    {m.role}
                  </Badge>
                </Td>
                <Td className="text-white/40 text-xs whitespace-nowrap">{formatDate(m.created_at)}</Td>
                <Td className="text-white/40 text-xs whitespace-nowrap">
                  {formatDate(auth?.lastSignIn ?? null)}
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <EmptyState
          title="No users yet"
          description="Users appear here once someone signs up and an organization is provisioned for them."
        />
      )}
    </div>
  );
}
