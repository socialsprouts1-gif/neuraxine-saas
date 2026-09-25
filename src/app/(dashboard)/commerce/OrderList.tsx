"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, ExternalLink, Package, Truck, User } from "lucide-react";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { Badge, EmptyState, type Tone } from "@/components/ui/primitives";
import { formatAmount } from "@/lib/orders";
import { askForPayment, saveOrderShipping, setOrderStatus } from "../commerce-actions";
import { pushOrderToShiprocket } from "../integration-actions";

export interface OrderRow {
  id: string;
  reference: string;
  status: string;
  currency: string;
  totalCents: number;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  paymentProvider: string | null;
  paymentLinkUrl: string | null;
  paidAt: string | null;
  awb: string | null;
  address: string | null;
  shipName: string | null;
  shipPhone: string | null;
  shipAddress: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipPincode: string | null;
  weightGrams: number | null;
  connectionId: string | null;
  shiprocketOrderId: string | null;
  courierName: string | null;
  notes: string | null;
  createdAt: string;
  contactName: string | null;
  hasConversation: boolean;
  items?: Array<{ name: string; quantity: number; unitPriceCents: number; currency: string }>;
}

/** The colour an order's state should read as at a glance. */
const STATUS_TONE: Record<string, Tone> = {
  pending: "amber",
  awaiting_payment: "amber",
  paid: "green",
  confirmed: "green",
  shipped: "blue",
  delivered: "green",
  cancelled: "grey",
  refunded: "red",
};

/** What can sensibly follow each state, so the buttons are never nonsense. */
/**
 * The status moves that lose the sale.
 *
 * Cancelling and refunding used to render in the same solid neon green as
 * confirming, which made the row read as four equally good ideas. These
 * stay findable and stop inviting.
 */
const DESTRUCTIVE_STATUSES = new Set(["cancelled", "refunded"]);

const NEXT_STATUSES: Record<string, Array<{ status: string; label: string }>> = {
  pending: [
    { status: "confirmed", label: "Confirm" },
    { status: "cancelled", label: "Cancel" },
  ],
  awaiting_payment: [
    { status: "paid", label: "Mark paid" },
    { status: "cancelled", label: "Cancel" },
  ],
  paid: [
    { status: "confirmed", label: "Confirm" },
    { status: "refunded", label: "Refund" },
  ],
  confirmed: [
    { status: "shipped", label: "Shipped" },
    { status: "cancelled", label: "Cancel" },
  ],
  shipped: [{ status: "delivered", label: "Delivered" }],
  delivered: [{ status: "refunded", label: "Refund" }],
};

export default function OrderList({
  orders,
  numbers = [],
}: {
  orders: OrderRow[];
  numbers?: Array<{ id: string; label: string; isDefault?: boolean }>;
}) {
  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="When a customer opens your catalogue in WhatsApp, picks items and sends the cart, the order lands here — with the prices they were shown."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} numbers={numbers} />
      ))}
    </div>
  );
}

function OrderCard({
  order,
  numbers,
}: {
  order: OrderRow;
  numbers: Array<{ id: string; label: string; isDefault?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const unpaid = !order.paidAt && order.status !== "cancelled" && order.status !== "refunded";

  return (
    <div className="glass-card p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <code className="text-sm font-semibold text-accent-ink">{order.reference}</code>
            <Badge tone={STATUS_TONE[order.status] ?? "grey"}>
              {order.status.replace("_", " ")}
            </Badge>
            {order.paymentProvider && (
              <Badge tone="grey">
                {order.paymentProvider === "whatsapp" ? "paid in chat" : order.paymentProvider}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
            {order.contactName && (
              <span className="inline-flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                {order.contactName}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />
              {order.items?.length ?? 0} {order.items?.length === 1 ? "item" : "items"}
            </span>
            <span>
              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </span>
            {order.awb && (
              <span className="inline-flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" />
                {order.awb}
              </span>
            )}
          </div>

          {/* Tracking used to live here as well as on Shipments, which
              meant two screens doing the same job and this one — whose
              question is "what did somebody buy" — carrying a courier's
              vocabulary. Shipments has the whole parcel lifecycle: the
              AWB, the label, the invoice, the pickup. This links there
              rather than reimplementing a corner of it. */}
          {order.awb && (
            <Link
              href="/shipments"
              className="inline-flex items-center gap-1.5 mt-3 text-[11px] text-accent2-ink hover:underline"
            >
              <Truck className="w-3.5 h-3.5" />
              Track and print this in Shipments
            </Link>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold tabular-nums">
            {formatAmount(order.totalCents, order.currency)}
          </div>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="text-[11px] text-white/40 hover:text-white transition-colors"
          >
            {open ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-white/8 space-y-4">
          {(order.items?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              {order.items!.map((item, index) => (
                <div key={index} className="flex items-center justify-between text-xs">
                  <span className="text-white/70">
                    {item.quantity} × {item.name}
                  </span>
                  <span className="text-white/50 tabular-nums">
                    {formatAmount(item.unitPriceCents * item.quantity, item.currency)}
                  </span>
                </div>
              ))}
              <div className="pt-2 mt-2 border-t border-white/8 space-y-1 text-xs">
                <Row label="Subtotal" value={formatAmount(order.subtotalCents, order.currency)} />
                {order.taxCents > 0 && (
                  <Row label="Tax" value={formatAmount(order.taxCents, order.currency)} />
                )}
                {order.shippingCents > 0 && (
                  <Row label="Shipping" value={formatAmount(order.shippingCents, order.currency)} />
                )}
                <Row
                  label="Total"
                  value={formatAmount(order.totalCents, order.currency)}
                  strong
                />
              </div>
            </div>
          )}

          {order.notes && (
            <p className="text-xs text-white/50">
              <span className="text-white/35">Customer said:</span> {order.notes}
            </p>
          )}

          {order.paymentLinkUrl && (
            <a
              href={order.paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-accent2-ink hover:underline break-all"
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              {order.paymentLinkUrl}
            </a>
          )}

          <div className="flex flex-wrap gap-2">
            {unpaid && order.hasConversation && (
              <ActionForm action={askForPayment} submitLabel="Ask to pay" variant="primary" compact>
                <input type="hidden" name="order_id" value={order.id} />
              </ActionForm>
            )}
            {(NEXT_STATUSES[order.status] ?? []).map((next, index) => (
              <ActionForm
                key={next.status}
                action={setOrderStatus}
                submitLabel={next.label}
                // One green button per row. Asking for the money outranks
                // a manual status change, so it takes the green when it is
                // showing and the first status move takes it otherwise.
                variant={
                  DESTRUCTIVE_STATUSES.has(next.status)
                    ? "danger"
                    : index === 0 && !(unpaid && order.hasConversation)
                      ? "primary"
                      : "quiet"
                }
                compact
              >
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="status" value={next.status} />
              </ActionForm>
            ))}
          </div>

          {/* Only worth showing once there is something to ship. */}
          {["paid", "confirmed", "shipped"].includes(order.status) && (
            <>
            <ActionForm action={saveOrderShipping} submitLabel="Save shipping" compact>
              <input type="hidden" name="order_id" value={order.id} />

              {/* Separate fields, not one address box. A courier API
                  refuses a free-text address, and parsing one into city,
                  state and pincode is a guess that is wrong often enough
                  to send parcels to the wrong place. */}
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Name" name="ship_name" defaultValue={order.shipName ?? order.contactName ?? ""} />
                <Field
                  label="Phone"
                  name="ship_phone"
                  defaultValue={order.shipPhone ?? ""}
                  hint="With or without 91 — the country code is stripped before sending."
                />
                <Field label="Street address" name="ship_address" defaultValue={order.shipAddress ?? ""} />
                <Field label="City" name="ship_city" defaultValue={order.shipCity ?? ""} />
                <Field label="State" name="ship_state" defaultValue={order.shipState ?? ""} />
                <Field
                  label="Pincode"
                  name="ship_pincode"
                  defaultValue={order.shipPincode ?? ""}
                  hint="Six digits."
                />
                <Field
                  label="Weight (grams)"
                  name="weight_grams"
                  defaultValue={order.weightGrams ? String(order.weightGrams) : ""}
                  hint="Left blank ships as 500g."
                />
                <Field
                  label="AWB number"
                  name="awb"
                  defaultValue={order.awb ?? ""}
                  hint="Filled in for you once Shiprocket assigns a courier."
                />
              </div>

              {numbers.length > 0 && (
                <label className="block mt-3">
                  <span className="block text-xs font-medium text-white/70 mb-1.5">
                    Send shipping updates from
                  </span>
                  <select
                    name="connection_id"
                    defaultValue={order.connectionId ?? ""}
                    className="w-full bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent/50"
                  >
                    <option value="" className="bg-[var(--surface-3)]">
                      Whichever number the conversation is on
                    </option>
                    {numbers.map((number) => (
                      <option key={number.id} value={number.id} className="bg-[var(--surface-3)]">
                        {number.label}
                        {number.isDefault ? " · default" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </ActionForm>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {order.shiprocketOrderId ? (
                <span className="text-[11px] text-white/45 inline-flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" />
                  On Shiprocket as {order.shiprocketOrderId}
                  {order.courierName ? ` · ${order.courierName}` : ""}
                </span>
              ) : (
                <ActionForm
                  action={pushOrderToShiprocket}
                  submitLabel="Send to Shiprocket"
                  compact
                >
                  <input type="hidden" name="order_id" value={order.id} />
                </ActionForm>
              )}
            </div>
            </>
          )}

          {!order.hasConversation && unpaid && (
            <p className="text-xs text-white/40 flex items-start gap-2">
              <CreditCard className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              No WhatsApp conversation on this order, so there is nowhere to send a payment
              request. Mark it paid by hand once the money arrives.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "text-white/70 font-medium" : "text-white/40"}>{label}</span>
      <span className={`tabular-nums ${strong ? "text-white font-semibold" : "text-white/60"}`}>
        {value}
      </span>
    </div>
  );
}
