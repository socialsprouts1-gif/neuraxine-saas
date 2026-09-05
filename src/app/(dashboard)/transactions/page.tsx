import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { HeroHeader, EmptyState, StatCard } from "@/components/ui/primitives";
import ActionForm, { Field, SelectField, TextareaField } from "@/components/ui/ActionForm";
import { saveTransaction } from "../leads-actions";
import TransactionRow, { type TransactionItem } from "./TransactionRow";

export default async function TransactionsPage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const [{ data: rows, error }, { data: contacts }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*, contacts(name, wa_id)")
      .eq("org_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(300),
    supabase
      .from("contacts")
      .select("id, name, wa_id")
      .eq("org_id", orgId)
      .order("name")
      .limit(500),
  ]);

  const items: TransactionItem[] = (rows ?? []).map((row) => {
    const contact = row.contacts as { name: string | null; wa_id: string } | null;
    return {
      id: row.id,
      amountCents: row.amount_cents,
      currency: row.currency,
      direction: row.direction,
      status: row.status,
      method: row.method,
      reference: row.reference,
      note: row.note,
      occurredAt: row.occurred_at,
      contactName: contact ? contact.name || contact.wa_id : null,
    };
  });

  // Only settled money counts toward a total. Pending is a hope, not income.
  const paid = items.filter((item) => item.status === "paid");
  const received = paid
    .filter((item) => item.direction === "in")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const refunded = paid
    .filter((item) => item.direction === "out")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const pending = items
    .filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + item.amountCents, 0);

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Transactions"
        subtitle="What your customers have paid you, and what you have paid back."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Received" value={money(received)} hint="Settled payments in" />
        <StatCard label="Refunded" value={money(refunded)} hint="Settled payments out" />
        <StatCard label="Net" value={money(received - refunded)} />
        <StatCard label="Pending" value={money(pending)} hint="Not settled yet" />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState
              title="Couldn't load transactions"
              description={`${error.message}. If this mentions a missing relation, run the latest migration in supabase/setup.sql.`}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              description="Record what a customer paid you and against which contact, so the history sits beside their conversation."
            />
          ) : (
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[46rem]">
                  <thead>
                    <tr className="text-left text-sm font-semibold bg-accent/8 border-b border-accent/15">
                      <th className="px-5 py-4">Date</th>
                      <th className="px-5 py-4">Contact</th>
                      <th className="px-5 py-4">Amount</th>
                      <th className="px-5 py-4">Status</th>
                      <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <TransactionRow key={item.id} transaction={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="order-1 lg:order-2 glass-card p-6">
          <h2 className="font-semibold mb-1">Record a transaction</h2>
          <p className="text-sm text-white/50 mb-5">
            A record of money that has already moved. Nothing here charges a card.
          </p>

          <ActionForm action={saveTransaction} submitLabel="Record" resetOnSuccess>
            <div className="space-y-4">
              <Field
                label="Amount"
                name="amount"
                type="number"
                required
                placeholder="1499"
                hint="In whole currency units — 1499 means ₹1,499."
              />
              <SelectField
                label="Direction"
                name="direction"
                defaultValue="in"
                options={[
                  { value: "in", label: "Received from customer" },
                  { value: "out", label: "Refunded to customer" },
                ]}
              />
              <SelectField
                label="Contact"
                name="contact_id"
                defaultValue=""
                options={[
                  { value: "", label: "No contact" },
                  ...(contacts ?? []).map((contact) => ({
                    value: contact.id,
                    label: contact.name || contact.wa_id,
                  })),
                ]}
              />
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
              <Field label="Date" name="occurred_at" type="datetime-local" />
              <Field label="Method" name="method" placeholder="UPI, card, cash, Razorpay…" />
              <Field label="Reference" name="reference" placeholder="Payment or order id" />
              <TextareaField label="Note" name="note" rows={2} />
            </div>
          </ActionForm>
        </div>
      </div>
    </div>
  );
}

function money(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
