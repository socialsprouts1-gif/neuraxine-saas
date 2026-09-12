import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { listConnections } from "@/lib/connections";
import { loadPaymentSettings } from "@/lib/commerce";
import { HeroHeader, StatCard } from "@/components/ui/primitives";
import { formatMoney } from "@/types/admin";
import { INTEGRATIONS } from "@/lib/integrations";
import { PAYMENT_PROVIDERS, STORE_PROVIDERS } from "@/lib/provider-meta";
import type { PaymentSettings, Product } from "@/types/portal";
import CommerceBrowser from "./CommerceBrowser";
import type { OrderRow } from "./OrderList";

// Commerce, in the order it actually works:
//
//   1. Products come from somewhere — a shop, Meta's catalogue, or typed in.
//   2. The Meta catalogue is what makes them sendable, because a product card
//      can only reference an item Meta holds.
//   3. A customer browses it in the chat and sends a cart, which becomes an
//      order.
//   4. The order is paid for, either by a gateway link or inside WhatsApp.
//
// Each of those is a tab, and the notices at the top say which step is not
// set up — because every one of them looks fine from the screen right up
// until a customer tries.

export default async function CommercePage() {
  const { orgId, role } = await requireFeature("commerce");
  const supabase = await createClient();
  const canManage = role === "owner" || role === "admin";

  const [productsResult, ordersResult, connections, settings, integrationsResult] =
    await Promise.all([
      supabase
        .from("products")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("store_orders")
        .select("*, contacts(name, wa_id)")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(100),
      listConnections(supabase, orgId),
      loadPaymentSettings(supabase, orgId),
      supabase
        .from("org_integrations")
        .select("provider, status")
        .eq("org_id", orgId)
        .eq("status", "connected"),
    ]);

  const products = (productsResult.data ?? []) as Product[];
  // Orders are new, so a database that has not run the migration renders
  // everything else rather than the whole page failing.
  const ordersMigrated = !ordersResult.error;

  const orders: OrderRow[] = (ordersResult.data ?? []).map((row) => {
    const contact = row.contacts as { name: string | null; wa_id: string } | null;
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      currency: row.currency,
      totalCents: row.total_cents,
      subtotalCents: row.subtotal_cents,
      taxCents: row.tax_cents,
      shippingCents: row.shipping_cents,
      paymentProvider: row.payment_provider,
      paymentLinkUrl: row.payment_link_url,
      paidAt: row.paid_at,
      awb: row.awb,
      address: row.address,
      notes: row.notes,
      createdAt: row.created_at,
      contactName: contact ? contact.name || contact.wa_id : null,
      hasConversation: !!row.conversation_id,
    };
  });

  // Items for the orders on screen, in one query rather than one per order.
  const { data: itemRows } = ordersMigrated
    ? await supabase
        .from("store_order_items")
        .select("order_id, name, quantity, unit_price_cents, currency")
        .in(
          "order_id",
          orders.slice(0, 100).map((order) => order.id)
        )
    : { data: [] };

  const itemsByOrder = new Map<string, OrderRow["items"]>();
  for (const item of itemRows ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push({
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
      currency: item.currency,
    });
    itemsByOrder.set(item.order_id, list);
  }
  for (const order of orders) order.items = itemsByOrder.get(order.id) ?? [];

  const connected = new Set((integrationsResult.data ?? []).map((row) => row.provider));

  const inventoryValue = products.reduce(
    (total, product) => total + product.price_cents * (product.stock ?? 0),
    0
  );
  const paidOrders = orders.filter((order) => order.paidAt);
  const revenue = paidOrders.reduce((total, order) => total + order.totalCents, 0);

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Commerce"
        subtitle="Your catalogue in WhatsApp: customers browse, build a cart, send it as an order, and pay — without leaving the chat."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Products" value={products.length} />
        <StatCard
          label="Sendable"
          value={products.filter((product) => product.retailer_id).length}
          hint="Have a Meta content ID"
        />
        <StatCard label="Orders" value={orders.length} />
        <StatCard label="Paid" value={formatMoney(revenue)} hint={`${paidOrders.length} orders`} />
      </div>

      <CommerceBrowser
        canManage={canManage}
        products={products}
        orders={orders}
        ordersMigrated={ordersMigrated}
        ordersError={ordersResult.error?.message ?? null}
        productsError={productsResult.error?.message ?? null}
        inventoryValue={inventoryValue}
        settings={settings as unknown as PaymentSettings}
        connections={connections.map((connection) => ({
          id: connection.id,
          label:
            connection.label ||
            connection.displayPhoneNumber ||
            connection.verifiedName ||
            connection.phoneNumberId,
        }))}
        catalogue={await loadCatalogueState(supabase, orgId)}
        // Which gateways and shops are actually connected, so the tabs can
        // point at Integrations rather than offering a dropdown of nothing.
        connectedGateways={PAYMENT_PROVIDERS.filter((slug) => connected.has(slug))}
        connectedShops={STORE_PROVIDERS.filter((slug) => connected.has(slug))}
        shopNames={Object.fromEntries(
          INTEGRATIONS.filter((def) => STORE_PROVIDERS.includes(def.slug as "shopify")).map(
            (def) => [def.slug, def.name]
          )
        )}
      />
    </div>
  );
}

export interface CatalogueState {
  connectionId: string | null;
  catalogId: string | null;
  catalogName: string | null;
  isCatalogVisible: boolean | null;
  isCartEnabled: boolean | null;
  /** Set when the commerce migration has not run. */
  unavailable: boolean;
}

/**
 * The catalogue link on the default number.
 *
 * Read from the connection row rather than Meta on every page load: the
 * catalogue id never changes, and a Graph call in a page render is a
 * hundreds-of-milliseconds tax on every visit.
 */
async function loadCatalogueState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<CatalogueState> {
  const { data, error } = await supabase
    .from("waba_connections")
    .select("id, catalog_id, catalog_name, is_catalog_visible, is_cart_enabled, is_default")
    .eq("org_id", orgId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      connectionId: null,
      catalogId: null,
      catalogName: null,
      isCatalogVisible: null,
      isCartEnabled: null,
      unavailable: true,
    };
  }

  return {
    connectionId: data?.id ?? null,
    catalogId: data?.catalog_id ?? null,
    catalogName: data?.catalog_name ?? null,
    isCatalogVisible: data?.is_catalog_visible ?? null,
    isCartEnabled: data?.is_cart_enabled ?? null,
    unavailable: false,
  };
}
