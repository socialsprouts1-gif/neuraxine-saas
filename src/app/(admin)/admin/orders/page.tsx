import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { recordOrder } from "../actions";
import ActionForm, { Field, SelectField } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, Badge, Table, Td, EmptyState, statusTone } from "@/components/ui/primitives";
import { formatMoney, formatDate } from "@/types/admin";

export default async function AdminOrdersPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: orders, error }, { data: orgs }] = await Promise.all([
    supabase
      .from("orders")
      .select("*, organizations(name)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("organizations").select("id, name").order("name"),
  ]);

  const paid = (orders ?? []).filter((o) => o.status === "paid");
  const paidTotal = paid.reduce((s, o) => s + o.amount_cents, 0);
  const pendingTotal = (orders ?? [])
    .filter((o) => o.status === "pending")
    .reduce((s, o) => s + o.amount_cents, 0);
  const onboardingTotal = paid
    .filter((o) => o.kind === "onboarding_fee")
    .reduce((s, o) => s + o.amount_cents, 0);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Orders"
        subtitle="Payment records, including onboarding fees. Entered manually — no payment provider is wired up yet."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Collected" value={formatMoney(paidTotal)} hint={`${paid.length} paid orders`} />
        <StatCard label="Pending" value={formatMoney(pendingTotal)} />
        <StatCard label="Onboarding fees" value={formatMoney(onboardingTotal)} />
        <StatCard label="Total orders" value={orders?.length ?? 0} />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState title="Couldn't load orders" description={error.message} />
          ) : orders && orders.length > 0 ? (
            <Table head={["Organization", "Kind", "Description", "Amount", "Status", "Date"]}>
              {orders.map((o) => {
                const org = o.organizations as { name: string } | null;
                return (
                  <tr key={o.id} className="hover:bg-white/3 transition-colors">
                    <Td className="font-medium">{org?.name ?? "—"}</Td>
                    <Td className="text-xs text-white/60 whitespace-nowrap">
                      {o.kind.replace("_", " ")}
                    </Td>
                    <Td className="text-xs text-white/50 max-w-xs truncate">
                      {o.description ?? "—"}
                    </Td>
                    <Td className="tabular-nums whitespace-nowrap">
                      {formatMoney(o.amount_cents, o.currency)}
                    </Td>
                    <Td>
                      <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                    </Td>
                    <Td className="text-white/40 text-xs whitespace-nowrap">
                      {formatDate(o.created_at)}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <EmptyState
              title="No orders yet"
              description="Record a payment to start tracking revenue per organization."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">Record an order</h2>
          <p className="text-sm text-white/50 mb-5">
            Use this for onboarding fees and manual payments until a provider is integrated.
          </p>
          <ActionForm action={recordOrder} submitLabel="Record order" resetOnSuccess>
            <div className="space-y-4">
              <SelectField
                label="Organization"
                name="org_id"
                options={[
                  { value: "", label: "Select organization…" },
                  ...(orgs ?? []).map((o) => ({ value: o.id, label: o.name })),
                ]}
              />
              <SelectField
                label="Kind"
                name="kind"
                defaultValue="subscription"
                options={[
                  { value: "subscription", label: "Subscription" },
                  { value: "onboarding_fee", label: "Onboarding fee" },
                  { value: "add_on", label: "Add-on" },
                  { value: "other", label: "Other" },
                ]}
              />
              <Field label="Amount (₹)" name="amount" type="number" required placeholder="9999" />
              <Field label="Description" name="description" placeholder="Onboarding & setup" />
              <SelectField
                label="Status"
                name="status"
                defaultValue="paid"
                options={[
                  { value: "paid", label: "Paid" },
                  { value: "pending", label: "Pending" },
                  { value: "failed", label: "Failed" },
                  { value: "refunded", label: "Refunded" },
                ]}
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
