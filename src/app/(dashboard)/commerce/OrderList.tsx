"use client";

import { useState } from "react";
import { CreditCard, ExternalLink, Package, Truck, User } from "lucide-react";
import ActionForm, { Field } from "@/components/ui/ActionForm";
import { Badge, EmptyState, type Tone } from "@/components/ui/primitives";
import { formatAmount } from "@/lib/orders";
import { askForPayment, saveOrderShipping, setOrderStatus } from "../commerce-actions";

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

export default function OrderList({ orders }: { orders: OrderRow[] }) {
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
        <OrderCard key={order.id} order={order} />
      ))}
    </div>
  );
}

function OrderCard({ order }: { order: OrderRow }) {
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
              <ActionForm action={askForPayment} submitLabel="Ask to pay" compact>
                <input type="hidden" name="order_id" value={order.id} />
              </ActionForm>
            )}
            {(NEXT_STATUSES[order.status] ?? []).map((next) => (
              <ActionForm
                key={next.status}
                action={setOrderStatus}
                submitLabel={next.label}
                compact
              >
                <input type="hidden" name="order_id" value={order.id} />
                <input type="hidden" name="status" value={next.status} />
              </ActionForm>
            ))}
          </div>

          {/* Only worth showing once there is something to ship. */}
          {["paid", "confirmed", "shipped"].includes(order.status) && (
            <ActionForm action={saveOrderShipping} submitLabel="Save shipping" compact>
              <input type="hidden" name="order_id" value={order.id} />
              <div className="grid sm:grid-cols-2 gap-3">
                <Field
                  label="AWB number"
                  name="awb"
                  defaultValue={order.awb ?? ""}
                  hint="From Shiprocket. Lets you look up where the parcel is."
                />
                <Field label="Address" name="address" defaultValue={order.address ?? ""} />
              </div>
            </ActionForm>
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
