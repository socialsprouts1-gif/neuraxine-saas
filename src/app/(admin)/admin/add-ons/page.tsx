import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { saveAddOn } from "../actions";
import ActionForm, { Field, TextareaField } from "@/components/ui/ActionForm";
import { PageHeader, Card, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { formatMoney } from "@/types/admin";

export default async function AdminAddOnsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: addOns, error }, { data: attached }] = await Promise.all([
    supabase.from("add_ons").select("*").order("price_cents"),
    supabase.from("org_add_ons").select("add_on_id, quantity"),
  ]);

  const usage = new Map<string, number>();
  for (const a of attached ?? []) {
    usage.set(a.add_on_id, (usage.get(a.add_on_id) ?? 0) + a.quantity);
  }

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Add-ons"
        subtitle="Optional extras tenants can buy alongside a plan, including onboarding fees."
      />

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState title="Couldn't load add-ons" description={error.message} />
          ) : addOns && addOns.length > 0 ? (
            <Table head={["Add-on", "Price", "Attached", "State"]}>
              {addOns.map((a) => (
                <tr key={a.id} className="hover:bg-white/3 transition-colors">
                  <Td>
                    <div className="font-medium">{a.name}</div>
                    {a.description && (
                      <div className="text-xs text-white/40 mt-0.5">{a.description}</div>
                    )}
                  </Td>
                  <Td className="tabular-nums whitespace-nowrap">
                    {formatMoney(a.price_cents, a.currency)}
                  </Td>
                  <Td className="tabular-nums">{usage.get(a.id) ?? 0}</Td>
                  <Td>
                    <Badge tone={a.is_active ? "green" : "grey"}>
                      {a.is_active ? "active" : "hidden"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState
              title="No add-ons yet"
              description="The migration seeds an extra number, onboarding and priority support."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">Add or update an add-on</h2>
          <p className="text-sm text-white/50 mb-5">Matching an existing name updates it.</p>
          <ActionForm action={saveAddOn} submitLabel="Save add-on" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Name" name="name" required placeholder="Onboarding & setup" />
              <Field label="Price (₹)" name="price" type="number" required placeholder="9999" />
              <TextareaField
                label="Description"
                name="description"
                rows={2}
                placeholder="Guided Meta Cloud API setup"
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
