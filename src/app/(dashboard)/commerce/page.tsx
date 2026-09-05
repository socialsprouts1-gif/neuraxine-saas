import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { saveProduct, deleteProduct } from "../portal-actions";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { PageHeader, Card, StatCard, Badge, EmptyState } from "@/components/ui/primitives";
import { formatMoney } from "@/types/admin";

export default async function CommercePage() {
  const { orgId } = await requireOrg();
  const supabase = await createClient();

  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const all = products ?? [];
  const inventoryValue = all.reduce((s, p) => s + p.price_cents * (p.stock ?? 0), 0);
  const outOfStock = all.filter((p) => p.stock !== null && p.stock <= 0).length;

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Commerce"
        subtitle="Your product catalogue — share items directly in a WhatsApp conversation."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Products" value={all.length} />
        <StatCard label="Active" value={all.filter((p) => p.is_active).length} />
        <StatCard label="Out of stock" value={outOfStock} />
        <StatCard label="Inventory value" value={formatMoney(inventoryValue)} />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="order-2 lg:order-1">
          {error ? (
            <EmptyState
              title="Couldn't load products"
              description={`${error.message}. If this mentions a missing relation, the portal migration hasn't been applied yet.`}
            />
          ) : all.length > 0 ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {all.map((p) => (
                <div key={p.id} className="glass-card overflow-hidden flex flex-col">
                  <div className="aspect-[4/3] bg-[var(--surface-1)] flex items-center justify-center overflow-hidden">
                    {p.image_url ? (
                      // Remote catalogue images: plain img avoids needing a
                      // remotePatterns entry per merchant domain.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white/20 text-xs">No image</span>
                    )}
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-sm">{p.name}</h3>
                      {p.stock !== null && (
                        <Badge tone={p.stock > 0 ? "green" : "red"}>
                          {p.stock > 0 ? `${p.stock} left` : "out"}
                        </Badge>
                      )}
                    </div>
                    {p.sku && (
                      <code className="text-[10px] text-white/35 mb-2">{p.sku}</code>
                    )}
                    <div className="text-lg font-bold tabular-nums mt-auto">
                      {formatMoney(p.price_cents, p.currency)}
                    </div>
                    <div className="mt-3">
                      <ActionForm action={deleteProduct} submitLabel="Delete" compact>
                        <input type="hidden" name="id" value={p.id} />
                      </ActionForm>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No products yet"
              description="Add your first product so you can share it in a chat without retyping the details."
            />
          )}
        </div>

        <Card className="order-1 lg:order-2">
          <h2 className="font-semibold mb-1">Add product</h2>
          <p className="text-sm text-white/50 mb-5">Prices are entered in rupees.</p>
          <ActionForm action={saveProduct} submitLabel="Add product" resetOnSuccess>
            <div className="space-y-4">
              <Field label="Product name" name="name" required placeholder="Cotton kurta" />
              <Field label="SKU" name="sku" placeholder="KRT-001" hint="Optional, must be unique" />
              <Field label="Price (₹)" name="price" type="number" required placeholder="1299" />
              <Field label="Stock" name="stock" type="number" placeholder="25" hint="Blank if untracked" />
              <Field
                label="Image URL"
                name="image_url"
                type="url"
                placeholder="https://…/kurta.jpg"
              />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
