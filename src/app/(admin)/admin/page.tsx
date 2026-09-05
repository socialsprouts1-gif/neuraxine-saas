import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { PageHeader, StatCard, Card, Badge, statusTone } from "@/components/ui/primitives";
import { formatMoney, formatDate } from "@/types/admin";

export default async function AdminDashboard() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  // head:true keeps these as count-only queries — the dashboard never pulls
  // whole tables just to show a number.
  const [orgs, contacts, messages, conversations, activeSubs, openTickets, recentOrders, recentOrgs] =
    await Promise.all([
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase.from("contacts").select("id", { count: "exact", head: true }),
      supabase.from("messages").select("id", { count: "exact", head: true }),
      supabase.from("conversations").select("id", { count: "exact", head: true }),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase
        .from("orders")
        .select("id, amount_cents, currency, status, kind, created_at, organizations(name)")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("organizations")
        .select("id, name, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

  const paidRevenue = (recentOrders.data ?? [])
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + o.amount_cents, 0);

  const schemaMissing = orgs.error?.message?.includes("does not exist");

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Platform overview"
        subtitle="Every tenant on this deployment, at a glance."
      />

      {schemaMissing && (
        <div className="glass-card p-5 mb-6 border-l-2 border-l-[#FACC15]">
          <div className="font-semibold text-[#FACC15] text-sm mb-1">Migrations not applied</div>
          <p className="text-sm text-white/60">
            The database is missing these tables. Run the files in{" "}
            <code className="text-white/80">supabase/migrations/</code> in filename order,
            then reload.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard label="Organizations" value={orgs.count ?? 0} />
        <StatCard label="Active plans" value={activeSubs.count ?? 0} />
        <StatCard label="Contacts" value={contacts.count ?? 0} />
        <StatCard label="Conversations" value={conversations.count ?? 0} />
        <StatCard label="Messages" value={messages.count ?? 0} />
        <StatCard label="Open tickets" value={openTickets.count ?? 0} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent orders</h2>
            <Link href="/admin/orders" className="text-xs text-accent2-ink hover:underline">
              View all
            </Link>
          </div>
          {recentOrders.data && recentOrders.data.length > 0 ? (
            <>
              <div className="space-y-3">
                {recentOrders.data.map((o) => {
                  const org = o.organizations as { name: string } | null;
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{org?.name ?? "—"}</div>
                        <div className="text-[11px] text-white/40">
                          {o.kind.replace("_", " ")} · {formatDate(o.created_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm tabular-nums">
                          {formatMoney(o.amount_cents, o.currency)}
                        </span>
                        <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 pt-4 border-t border-white/8 flex justify-between text-sm">
                <span className="text-white/50">Paid in this window</span>
                <span className="font-semibold tabular-nums">{formatMoney(paidRevenue)}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-white/40">No orders recorded yet.</p>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Newest organizations</h2>
            <Link href="/admin/organizations" className="text-xs text-accent2-ink hover:underline">
              View all
            </Link>
          </div>
          {recentOrgs.data && recentOrgs.data.length > 0 ? (
            <div className="space-y-3">
              {recentOrgs.data.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium truncate">{o.name}</span>
                  <span className="text-[11px] text-white/40 flex-shrink-0">
                    {formatDate(o.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/40">No organizations yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
