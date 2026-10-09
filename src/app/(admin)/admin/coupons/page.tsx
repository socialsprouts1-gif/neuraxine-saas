import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/org";
import { saveCoupon, toggleCoupon } from "../actions";
import ActionForm, { Field, SelectField } from "@/components/ui/ActionForm";
import { PageHeader, Card, Badge, Table, Td, EmptyState } from "@/components/ui/primitives";
import { formatMoney, formatDate } from "@/types/admin";

export default async function AdminCouponsPage() {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data: coupons, error } = await supabase
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Coupons"
        subtitle="Discount codes. Only platform staff can read this table — tenants cannot enumerate codes."
      />

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState title="Couldn't load coupons" description={error.message} />
          ) : coupons && coupons.length > 0 ? (
            <Table head={["Code", "Discount", "Redeemed", "Expires", "State", ""]}>
              {coupons.map((c) => {
                const expired = c.expires_at ? new Date(c.expires_at) < new Date() : false;
                const exhausted =
                  c.max_redemptions !== null && c.times_redeemed >= c.max_redemptions;
                return (
                  <tr key={c.id} className="hover:bg-white/3 transition-colors">
                    <Td className="font-mono font-medium">{c.code}</Td>
                    <Td className="whitespace-nowrap">
                      {c.discount_type === "percent"
                        ? `${c.discount_value}%`
                        : formatMoney(c.discount_value)}
                    </Td>
                    <Td className="tabular-nums">
                      {c.times_redeemed}
                      {c.max_redemptions !== null && (
                        <span className="text-white/35"> / {c.max_redemptions}</span>
                      )}
                    </Td>
                    <Td className="text-white/40 text-xs whitespace-nowrap">
                      {formatDate(c.expires_at)}
                    </Td>
                    <Td>
                      {!c.is_active ? (
                        <Badge tone="grey">disabled</Badge>
                      ) : expired ? (
                        <Badge tone="red">expired</Badge>
                      ) : exhausted ? (
                        <Badge tone="amber">exhausted</Badge>
                      ) : (
                        <Badge tone="green">active</Badge>
                      )}
                    </Td>
                    <Td>
                      <ActionForm
                        action={toggleCoupon}
                        submitLabel={c.is_active ? "Disable" : "Enable"}
                        compact
                      >
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="is_active" value={String(c.is_active)} />
                      </ActionForm>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <EmptyState
              title="No coupons yet"
              description="Create a discount code to offer a percentage or fixed reduction."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">New coupon</h2>
          <p className="text-sm text-white/50 mb-5">Codes are stored uppercase.</p>
          <ActionForm action={saveCoupon} submitLabel="Create coupon" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Code" name="code" required placeholder="LAUNCH50" />
              <SelectField
                label="Discount type"
                name="discount_type"
                defaultValue="percent"
                options={[
                  { value: "percent", label: "Percentage" },
                  { value: "fixed", label: "Fixed amount (₹)" },
                ]}
              />
              <Field
                label="Discount value"
                name="discount_value"
                type="number"
                required
                placeholder="50"
                hint="Percent (1–100) or rupees, matching the type above"
              />
              <Field
                label="Max redemptions"
                name="max_redemptions"
                type="number"
                placeholder="100"
                hint="Blank for unlimited"
              />
              <Field label="Expires" name="expires_at" type="date" />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
