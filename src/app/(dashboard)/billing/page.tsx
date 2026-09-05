import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { PageHeader, Card, StatCard, Badge, Table, Td, EmptyState, statusTone } from "@/components/ui/primitives";
import { formatMoney, formatDate } from "@/types/admin";

export default async function BillingPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: subscription }, { data: orders }, { data: plans }, { data: usage }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("*, plans(name, price_cents, currency, message_limit, contact_limit, seat_limit)")
        .eq("org_id", orgId)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);

  const plan = subscription?.plans as
    | { name: string; price_cents: number; currency: string; message_limit: number | null; contact_limit: number | null; seat_limit: number | null }
    | null
    | undefined;

  const paidTotal = (orders ?? [])
    .filter((o) => o.status === "paid")
    .reduce((s, o) => s + o.amount_cents, 0);

  const messagesUsed = usage?.length ?? 0;

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="Billing" subtitle="Your plan, usage and payment history." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Plan" value={plan?.name ?? "None"} />
        <StatCard
          label="Monthly"
          value={plan ? formatMoney(plan.price_cents, plan.currency) : "—"}
        />
        <StatCard label="Paid to date" value={formatMoney(paidTotal)} />
        <StatCard
          label="Renews"
          value={subscription ? formatDate(subscription.current_period_end) : "—"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <h2 className="font-semibold mb-4">Current plan</h2>
          {subscription && plan ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl font-bold">{plan.name}</span>
                <Badge tone={statusTone(subscription.status)}>{subscription.status}</Badge>
              </div>
              <dl className="space-y-2.5">
                {[
                  ["Messages", plan.message_limit?.toLocaleString() ?? "Unlimited"],
                  ["Contacts", plan.contact_limit?.toLocaleString() ?? "Unlimited"],
                  ["Team seats", plan.seat_limit?.toString() ?? "Unlimited"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <dt className="text-white/50">{label}</dt>
                    <dd className="tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>

              {plan.message_limit && (
                <div className="mt-5">
                  <div className="flex justify-between text-xs text-white/50 mb-1.5">
                    <span>Messages used</span>
                    <span className="tabular-nums">
                      {messagesUsed.toLocaleString()} / {plan.message_limit.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
                      style={{
                        width: `${Math.min(100, (messagesUsed / plan.message_limit) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-white/40">
              No plan assigned yet. Platform staff assign plans from the admin panel — limits
              below are what each plan includes.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold mb-4">Available plans</h2>
          <div className="space-y-3">
            {(plans ?? []).map((p) => {
              const current = p.id === subscription?.plan_id;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 ${
                    current ? "border-accent/30 bg-accent/5" : "border-white/8 bg-white/3"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{p.name}</span>
                        {current && <Badge tone="green">current</Badge>}
                      </div>
                      <p className="text-[11px] text-white/40 mt-0.5">{p.description}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold tabular-nums">
                        {formatMoney(p.price_cents, p.currency)}
                      </div>
                      <div className="text-[10px] text-white/35">
                        /{p.billing_interval === "yearly" ? "yr" : "mo"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-white/35 mt-4">
            Self-serve upgrades need a payment provider, which isn&apos;t connected yet. Ask
            support to change your plan.
          </p>
        </Card>
      </div>

      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-3">
        Payment history
      </h2>
      {orders && orders.length > 0 ? (
        <Table head={["Description", "Kind", "Amount", "Status", "Date"]}>
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-white/3 transition-colors">
              <Td className="font-medium">{o.description ?? "—"}</Td>
              <Td className="text-xs text-white/60 whitespace-nowrap">{o.kind.replace("_", " ")}</Td>
              <Td className="tabular-nums whitespace-nowrap">
                {formatMoney(o.amount_cents, o.currency)}
              </Td>
              <Td>
                <Badge tone={statusTone(o.status)}>{o.status}</Badge>
              </Td>
              <Td className="text-white/40 text-xs whitespace-nowrap">{formatDate(o.created_at)}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No payments yet" description="Invoices and receipts will appear here." />
      )}
    </div>
  );
}
