"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, MapPin, Truck, User } from "lucide-react";
import ActionForm from "@/components/ui/ActionForm";
import type { ActionResult } from "@/app/(dashboard)/actions";
import { Badge, type Tone } from "@/components/ui/primitives";
import { formatAmount } from "@/lib/orders";
import {
  shipmentStage,
  describeStage,
  availableActions,
  documentLabel,
  type Action,
} from "@/lib/shipment-stage";
import {
  pushOrderToShiprocket,
  assignCourier,
  makeShipmentDocument,
  bookPickup,
  trackOrderShipment,
} from "../integration-actions";

export interface ShipmentOrder {
  id: string;
  reference: string;
  status: string;
  currency: string;
  totalCents: number;
  createdAt: string;
  customerName: string | null;
  city: string | null;
  pincode: string | null;
  awb: string | null;
  courierName: string | null;
  shiprocketOrderId: string | null;
  shipmentId: string | null;
  labelUrl: string | null;
  invoiceUrl: string | null;
  pickupScheduledAt: string | null;
  connectionId: string | null;
  hasConversation: boolean;
  shippedNotifiedAt: string | null;
}

const STAGE_TONE: Record<string, Tone> = {
  grey: "grey",
  amber: "amber",
  blue: "blue",
  green: "green",
};

export default function ShipmentList({
  orders,
  numbers,
}: {
  orders: ShipmentOrder[];
  numbers: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <ShipmentCard key={order.id} order={order} numbers={numbers} />
      ))}
    </div>
  );
}

function ShipmentCard({
  order,
  numbers,
}: {
  order: ShipmentOrder;
  numbers: Array<{ id: string; label: string }>;
}) {
  const row = {
    shiprocketOrderId: order.shiprocketOrderId,
    shipmentId: order.shipmentId,
    awb: order.awb,
    labelUrl: order.labelUrl,
    invoiceUrl: order.invoiceUrl,
    pickupScheduledAt: order.pickupScheduledAt,
    orderStatus: order.status,
  };

  const stage = shipmentStage(row);
  const view = describeStage(stage);
  const actions = availableActions(row);

  // The step that moves the parcel on is the primary button; the rest are
  // quiet. A row of five identical buttons makes the reader work out the
  // order, which is exactly what the stage already knows.
  const [first, ...rest] = actions;

  // One outcome line for the whole card. Each button used to print its
  // own, and because a form is as wide as its widest child, a single long
  // sentence stretched that form across the card and pushed the next
  // button half a screen sideways.
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <code className="text-sm font-semibold text-accent-ink">{order.reference}</code>
            <Badge tone={STAGE_TONE[view.tone] ?? "grey"}>{view.label}</Badge>
            {order.courierName && <Badge tone="grey">{order.courierName}</Badge>}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
            {order.customerName && (
              <span className="inline-flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                {order.customerName}
              </span>
            )}
            {(order.city || order.pincode) && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {[order.city, order.pincode].filter(Boolean).join(" ")}
              </span>
            )}
            {order.awb && (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Truck className="w-3.5 h-3.5" />
                {order.awb}
              </span>
            )}
          </div>

          <p className="text-[11px] text-white/40 leading-relaxed mt-2 max-w-2xl">{view.detail}</p>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-base font-bold tabular-nums">
            {formatAmount(order.totalCents, order.currency)}
          </div>
          <div className="text-[11px] text-white/35">
            {new Date(order.createdAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </div>
        </div>
      </div>

      {(order.labelUrl || order.invoiceUrl) && (
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
          {order.labelUrl && (
            <a
              href={order.labelUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-accent2-ink hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Shipping label
            </a>
          )}
          {order.invoiceUrl && (
            <a
              href={order.invoiceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-accent2-ink hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Invoice
            </a>
          )}
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-4 pt-3.5 border-t border-white/6">
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton action={first} order={order} onResult={setResult} primary />
            {rest.map((entry) => (
              <ActionButton key={entry} action={entry} order={order} onResult={setResult} />
            ))}
          </div>

          {result && (
            <p
              className={`flex items-start gap-2 mt-3 text-[11.5px] leading-relaxed ${
                result.ok ? "text-white/60" : "text-red-300/90"
              }`}
              role={result.ok ? "status" : "alert"}
            >
              {result.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 mt-px flex-shrink-0 text-accent-ink" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              )}
              <span>{result.ok ? result.message : result.error}</span>
            </p>
          )}

          {/* Which number the customer hears from. Saved with the order so
              a later update goes out from the same one. */}
          {numbers.length > 1 && actions.includes("notify") && (
            <p className="text-[11px] text-white/30 mt-3">
              Updates go out from{" "}
              <span className="text-white/45">
                {numbers.find((n) => n.id === order.connectionId)?.label ??
                  "the conversation's number"}
              </span>
              {" · change it under Commerce → Shipping"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const LABELS: Record<Action, string> = {
  push: "Send to Shiprocket",
  assign_courier: "Assign courier",
  label: "label",
  invoice: "invoice",
  pickup: "Book pickup",
  track: "Where is it?",
  notify: "Tell the customer",
};

function ActionButton({
  action,
  order,
  onResult,
  primary = false,
}: {
  action: Action;
  order: ShipmentOrder;
  onResult: (result: ActionResult) => void;
  primary?: boolean;
}) {
  // Only the step that moves the parcel on gets the green. It used to be
  // worked out here and then never reach the button, so all five arrived
  // solid green and the hierarchy existed only in the code.
  const variant = primary ? "primary" : "quiet";

  if (action === "label" || action === "invoice") {
    const existing = action === "label" ? order.labelUrl : order.invoiceUrl;
    return (
      <ActionForm
        action={makeShipmentDocument}
        submitLabel={documentLabel(action, existing)}
        variant={variant}
        onResult={onResult}
        compact
      >
        <input type="hidden" name="order_id" value={order.id} />
        <input type="hidden" name="kind" value={action} />
      </ActionForm>
    );
  }

  const serverAction =
    action === "push"
      ? pushOrderToShiprocket
      : action === "assign_courier"
        ? assignCourier
        : action === "pickup"
          ? bookPickup
          : trackOrderShipment;

  return (
    <ActionForm
      action={serverAction}
      submitLabel={LABELS[action]}
      variant={variant}
      onResult={onResult}
      compact
    >
      <input type="hidden" name="order_id" value={order.id} />
      {action === "notify" && <input type="hidden" name="send" value="1" />}
    </ActionForm>
  );
}
