import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { listActiveConnections, optionLabel } from "@/lib/connections";
import { PageHeader, Card, StatCard, EmptyState } from "@/components/ui/primitives";
import { shipmentStage, describeQueue, type ShipmentRow } from "@/lib/shipment-stage";
import ShipmentList, { type ShipmentOrder } from "./ShipmentList";
import NewShipmentOrder from "./NewShipmentOrder";
import FetchFromShiprocket from "./FetchFromShiprocket";

/**
 * Everything between "they paid" and "it is with the courier".
 *
 * Commerce owns the order; this owns the parcel. They are different jobs
 * done by different people on different days, and a shipping queue mixed
 * into an order list is a list where the thing you came to do is four
 * scrolls down.
 */
export default async function ShipmentsPage() {
  const { orgId } = await requireFeature("shipping");
  const supabase = await createClient();

  const [{ data: rows, error }, { data: courier }, numbers] = await Promise.all([
    supabase
      .from("store_orders")
      .select("*, contacts(name, wa_id)")
      .eq("org_id", orgId)
      .in("status", ["paid", "confirmed", "shipped", "delivered"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("org_integrations")
      .select("provider")
      .eq("org_id", orgId)
      .eq("provider", "shiprocket")
      .maybeSingle(),
    listActiveConnections(supabase, orgId),
  ]);

  if (!courier) {
    return (
      <div className="p-6 md:p-8">
        <PageHeader title="Shipments" subtitle="Labels, pickups and tracking." />
        <EmptyState
          title="No courier connected"
          description="Connect Shiprocket under Integrations and this fills with the orders waiting to go out."
        />
        <Link href="/integrations" className="btn-primary text-sm mt-4 inline-flex">
          Open Integrations
        </Link>
      </div>
    );
  }

  const orders: ShipmentOrder[] = (rows ?? []).map((row) => {
    const contact = row.contacts as { name?: string | null; wa_id?: string | null } | null;
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      currency: row.currency,
      totalCents: Number(row.total_cents ?? 0),
      createdAt: row.created_at,
      customerName: row.ship_name ?? contact?.name ?? null,
      city: row.ship_city,
      pincode: row.ship_pincode,
      awb: row.awb,
      courierName: row.courier_name,
      shiprocketOrderId: row.shiprocket_order_id,
      shipmentId: row.shiprocket_shipment_id,
      labelUrl: row.label_url,
      invoiceUrl: row.invoice_url,
      pickupScheduledAt: row.pickup_scheduled_at,
      connectionId: row.connection_id,
      hasConversation: Boolean(row.conversation_id || contact?.wa_id),
      shippedNotifiedAt: row.shipped_notified_at,
    };
  });

  const asRows: ShipmentRow[] = orders.map((order) => ({
    shiprocketOrderId: order.shiprocketOrderId,
    shipmentId: order.shipmentId,
    awb: order.awb,
    labelUrl: order.labelUrl,
    invoiceUrl: order.invoiceUrl,
    pickupScheduledAt: order.pickupScheduledAt,
    orderStatus: order.status,
  }));

  const numberOptions = numbers.map((c) => ({ id: c.id, label: optionLabel(c) }));
  const stages = asRows.map(shipmentStage);
  const queue = describeQueue(asRows);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="Shipments"
        subtitle="From a paid order to a parcel with the courier — label, invoice, pickup and tracking."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <FetchFromShiprocket />
            <NewShipmentOrder numbers={numberOptions} />
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="To send" value={stages.filter((s) => s === "not_pushed").length} />
        <StatCard label="Awaiting courier" value={stages.filter((s) => s === "awaiting_courier").length} />
        <StatCard label="Ready to ship" value={stages.filter((s) => s === "ready_to_pick").length} />
        <StatCard label="With courier" value={stages.filter((s) => s === "picked_up").length} />
      </div>

      {queue && (
        <Card className="mb-6 border-[#FACC15]/20">
          <p className="text-sm text-[#FACC15] leading-relaxed">{queue}</p>
        </Card>
      )}

      {error ? (
        <EmptyState
          title="Couldn't load shipments"
          description={`${error.message}. If this mentions a missing column, run supabase/updates/run-me-latest.sql.`}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          title="Nothing to ship"
          description="Orders appear here once they are marked paid or confirmed under Commerce."
        />
      ) : (
        <ShipmentList orders={orders} numbers={numberOptions} />
      )}
    </div>
  );
}
