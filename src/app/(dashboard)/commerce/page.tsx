import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { listConnections, optionLabel } from "@/lib/connections";
import { loadPaymentSettings } from "@/lib/commerce";
import { IndianRupee, Package, Send, ShoppingCart } from "lucide-react";
import { HeroHeader, StatCard } from "@/components/ui/primitives";
import { formatMoney } from "@/types/admin";
import { INTEGRATIONS } from "@/lib/integrations";
import { PAYMENT_PROVIDERS, STORE_PROVIDERS } from "@/lib/provider-meta";
import type { PaymentSettings, Product } from "@/types/portal";
import { splitByOrigin } from "@/lib/order-origin";
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

  const [
    productsResult,
    ordersResult,
    connections,
    settings,
    integrationsResult,
    conversationsResult,
  ] = await Promise.all([
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
      // Who a product card could go to. A product message is an
      // interactive one, so WhatsApp only allows it inside 24 hours of the
      // customer's own last message — last_inbound_at is what decides
      // whether each of these is still reachable.
      supabase
        .from("conversations")
        .select("id, last_inbound_at, last_message_at, contacts(name, wa_id)")
        .eq("org_id", orgId)
        .not("last_inbound_at", "is", null)
        .order("last_inbound_at", { ascending: false })
        .limit(60),
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
      shipName: row.ship_name,
      shipPhone: row.ship_phone ?? row.contacts?.wa_id ?? null,
      shipAddress: row.ship_address,
      shipCity: row.ship_city,
      shipState: row.ship_state,
      shipPincode: row.ship_pincode,
      weightGrams: row.weight_grams,
      connectionId: row.connection_id,
      shiprocketOrderId: row.shiprocket_order_id,
      courierName: row.courier_name,
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

  // Orders that started here, not every parcel the courier knows about.
  // Pulling a Shiprocket account in put a year of shipments into this
  // list — each with no items on it and a tracking button that belongs
  // on the Shipments screen, which already exists and does it better.
  const { own: ownOrders, courier: courierOrders } = splitByOrigin(
    orders.map((order) => ({ ...order, itemCount: order.items?.length ?? 0 }))
  );

  const connected = new Set((integrationsResult.data ?? []).map((row) => row.provider));

  const inventoryValue = products.reduce(
    (total, product) => total + product.price_cents * (product.stock ?? 0),
    0
  );
  const sendable = products.filter((product) => product.retailer_id).length;
  const paidOrders = ownOrders.filter((order) => order.paidAt);
  const revenue = paidOrders.reduce((total, order) => total + order.totalCents, 0);

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Commerce"
        subtitle="Your catalogue in WhatsApp: customers browse, build a cart, send it as an order, and pay — without leaving the chat."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Products" value={products.length} icon={Package} />
        {/* A share, not a total — "1" alone does not say that the other
            one cannot be sent, which is the thing worth knowing here. */}
        <StatCard
          label="Sendable"
          value={sendable}
          icon={Send}
          meter={
            products.length > 0
              ? {
                  value: sendable,
                  of: products.length,
                  tone: sendable < products.length ? "warn" : "accent",
                }
              : undefined
          }
          hint={
            products.length > 0
              ? `of ${products.length} · the rest have no Meta content ID`
              : "Have a Meta content ID"
          }
        />
        <StatCard
          label="Orders"
          value={ownOrders.length}
          icon={ShoppingCart}
          hint={
            courierOrders.length > 0
              ? `${courierOrders.length} more in Shipments`
              : undefined
          }
        />
        <StatCard
          label="Paid"
          value={formatMoney(revenue)}
          icon={IndianRupee}
          meter={
            ownOrders.length > 0
              ? { value: paidOrders.length, of: ownOrders.length }
              : undefined
          }
          hint={`${paidOrders.length} of ${ownOrders.length} orders paid`}
        />
      </div>

      <CommerceBrowser
        canManage={canManage}
        products={products}
        orders={ownOrders}
        ordersMigrated={ordersMigrated}
        ordersError={ordersResult.error?.message ?? null}
        productsError={productsResult.error?.message ?? null}
        inventoryValue={inventoryValue}
        settings={settings as unknown as PaymentSettings}
        connections={connections.map((connection) => ({
          id: connection.id,
          label: optionLabel(connection),
        }))}
        catalogue={await loadCatalogueState(supabase, orgId)}
        // Recent enough to be worth offering. Whether each one is still
        // inside the 24-hour window is worked out in the browser, so the
        // countdown stays right while the page is open.
        conversations={(conversationsResult.data ?? [])
          .map((row) => {
            const contact = row.contacts as { name: string | null; wa_id: string } | null;
            return {
              id: row.id as string,
              name: contact?.name ?? null,
              waId: contact?.wa_id ?? "",
              lastInboundAt: row.last_inbound_at as string | null,
            };
          })
          .filter((row) => row.waId)}
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
 * The catalogue link, on whichever number actually has one.
 *
 * This used to read the default number and only the default number,
 * while linking wrote to whichever number the operator picked. With four
 * numbers connected, linking a catalogue to the third one and then being
 * told "no Meta catalogue is linked" is not a confusing message — it is
 * the screen reading a different row from the one it just wrote.
 *
 * Read from the connection row rather than Meta on every page load: the
 * catalogue id never changes, and a Graph call in a page render is a
 * hundreds-of-milliseconds tax on every visit.
 */
async function loadCatalogueState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<CatalogueState> {
  const { data: rows, error } = await supabase
    .from("waba_connections")
    .select("id, catalog_id, catalog_name, is_catalog_visible, is_cart_enabled, is_default")
    .eq("org_id", orgId)
    .order("is_default", { ascending: false });

  // A linked catalogue wins over the default number, because a linked
  // one is a decision somebody made and the default is only a fallback.
  const data =
    (rows ?? []).find((row) => row.catalog_id) ?? (rows ?? [])[0] ?? null;

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
