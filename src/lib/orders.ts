// Order arithmetic, and the shape of an order_details message.
//
// Two things live here that are worth keeping away from the network. The
// totals, because getting tax or shipping wrong charges somebody the wrong
// amount and nobody notices until they complain. And Meta's order_details
// payload, which is fiddly in a specific way: every amount appears twice —
// once as the line item and once in a total that Meta re-adds and rejects
// the message if it disagrees by a single paisa.
//
// Pure by design: no fetch, no env, no server-only, so it can be tested.

/** Meta's cap on reference_id. Ours has to fit inside it. */
export const MAX_REFERENCE_LENGTH = 35;

/**
 * The multiplier Meta and the gateways use for minor units.
 *
 * Fixed at 100 in every currency any of these support, so it is a constant
 * rather than a lookup — but named, because a bare 100 in this arithmetic
 * reads like a percentage.
 */
export const MINOR_UNIT_OFFSET = 100;

export interface CartLine {
  /** The SKU as Meta's catalogue knows it. */
  retailerId: string;
  name: string;
  quantity: number;
  /** Smallest currency unit. */
  unitPriceCents: number;
  currency: string;
  /** Set when the line matched a product we hold locally. */
  productId?: string | null;
}

export interface OrderCharges {
  /** Percent, 0–100. Applied to the subtotal. */
  taxPercent: number;
  shippingCents: number;
  /** Shipping is waived at or above this subtotal. 0 disables the waiver. */
  freeShippingAboveCents: number;
  discountCents?: number;
}

export interface OrderTotals {
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
}

export const NO_CHARGES: OrderCharges = {
  taxPercent: 0,
  shippingCents: 0,
  freeShippingAboveCents: 0,
};

/**
 * What an order comes to.
 *
 * Order of operations matters and is not obvious: tax is on the goods, not
 * on the shipping or after the discount. Doing it any other way produces a
 * total that looks right and does not match the invoice.
 */
export function orderTotals(lines: CartLine[], charges: OrderCharges): OrderTotals {
  const subtotalCents = lines.reduce(
    (total, line) => total + Math.max(0, line.unitPriceCents) * Math.max(1, line.quantity),
    0
  );

  // Rounded once, here. Rounding per line and summing gives a different
  // answer, and it is the answer nobody can reconcile.
  const taxCents = Math.round((subtotalCents * Math.max(0, charges.taxPercent)) / 100);

  const shippingCents =
    charges.freeShippingAboveCents > 0 && subtotalCents >= charges.freeShippingAboveCents
      ? 0
      : Math.max(0, charges.shippingCents);

  // A discount cannot make an order negative — a gateway would reject it,
  // and a refund is a different thing entirely.
  const discountCents = Math.min(
    Math.max(0, charges.discountCents ?? 0),
    subtotalCents + taxCents + shippingCents
  );

  return {
    subtotalCents,
    taxCents,
    shippingCents,
    discountCents,
    totalCents: subtotalCents + taxCents + shippingCents - discountCents,
  };
}

/**
 * A short, unique-enough reference.
 *
 * Has to fit Meta's 35 characters, be readable over the phone, and not
 * collide within a workspace. Date plus randomness rather than a counter,
 * because a counter needs a round trip and a lock to be safe.
 */
export function orderReference(now: Date = new Date(), random = Math.random): string {
  const stamp =
    `${String(now.getUTCFullYear()).slice(2)}` +
    `${String(now.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(now.getUTCDate()).padStart(2, "0")}`;

  // Base 36 without the ambiguous characters: nobody reads O and 0 apart
  // over a phone line.
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let suffix = "";
  for (let index = 0; index < 5; index += 1) {
    suffix += alphabet[Math.floor(random() * alphabet.length)];
  }

  return `NC-${stamp}-${suffix}`;
}

/** True when a reference could have come from orderReference. */
export function isOrderReference(value: string): boolean {
  return /^NC-\d{6}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/.test(value);
}

// -------------------------------------------------- Meta order_details

export interface OrderDetailsPayload {
  type: "interactive";
  interactive: {
    type: "order_details";
    body: { text: string };
    footer?: { text: string };
    action: {
      name: "review_and_pay";
      parameters: Record<string, unknown>;
    };
  };
}

export interface OrderDetailsInput {
  reference: string;
  currency: string;
  body: string;
  footer?: string;
  lines: CartLine[];
  totals: OrderTotals;
  /** Meta's catalogue, so the items render with their pictures. */
  catalogId?: string | null;
  /** 'physical-goods' gets a shipping stage in the status; digital does not. */
  goodsType: "physical" | "digital";
  /** The payment configuration approved in WhatsApp Manager. */
  paymentConfiguration: string;
  /** 'razorpay' or 'payu' — the gateway behind that configuration. */
  gateway: string;
  /** Unix seconds. Meta shows the order as expired past this. */
  expiresAt: number;
}

/**
 * Meta's "review and pay" message.
 *
 * The part that catches people: `total_amount.value` must equal the sum of
 * the item amounts plus tax and shipping, minus the discount, all in minor
 * units — and Meta re-adds it and refuses the message if it disagrees by
 * one paisa. So the totals are computed once, by orderTotals, and both the
 * lines and the total below come from that same result rather than being
 * added up twice.
 */
export function buildOrderDetails(input: OrderDetailsInput): OrderDetailsPayload {
  const { totals } = input;

  const items = input.lines.map((line) => ({
    retailer_id: line.retailerId,
    name: line.name.slice(0, 60),
    amount: { value: line.unitPriceCents, offset: MINOR_UNIT_OFFSET },
    quantity: Math.max(1, line.quantity),
  }));

  const order: Record<string, unknown> = {
    status: "pending",
    ...(input.catalogId ? { catalog_id: input.catalogId } : {}),
    expiration: {
      timestamp: String(input.expiresAt),
      description: "This payment request has expired.",
    },
    items,
    subtotal: { value: totals.subtotalCents, offset: MINOR_UNIT_OFFSET },
  };

  // Each of these is omitted when zero rather than sent as zero: Meta shows
  // a "Tax ₹0.00" line for a tax field that is present, which looks like a
  // mistake to the customer.
  if (totals.taxCents > 0) {
    order.tax = { value: totals.taxCents, offset: MINOR_UNIT_OFFSET };
  }
  if (totals.shippingCents > 0) {
    order.shipping = { value: totals.shippingCents, offset: MINOR_UNIT_OFFSET };
  }
  if (totals.discountCents > 0) {
    order.discount = { value: totals.discountCents, offset: MINOR_UNIT_OFFSET };
  }

  return {
    type: "interactive",
    interactive: {
      type: "order_details",
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        name: "review_and_pay",
        parameters: {
          reference_id: input.reference.slice(0, MAX_REFERENCE_LENGTH),
          type: input.goodsType === "digital" ? "digital-goods" : "physical-goods",
          // India's payment gateway form. The configuration name is the one
          // created in WhatsApp Manager; Meta rejects a name it does not have.
          payment_type: `payment_gateway:${input.gateway}`,
          payment_configuration: input.paymentConfiguration,
          currency: input.currency,
          total_amount: { value: totals.totalCents, offset: MINOR_UNIT_OFFSET },
          order,
        },
      },
    },
  };
}

export type OrderStatusValue = "pending" | "processing" | "partially-shipped" | "shipped" | "completed" | "canceled";

/**
 * The follow-up that tells the customer where their order got to.
 *
 * Meta leaves an order at "pending" forever unless something says otherwise,
 * and a pending order in the customer's chat reads as "they never took my
 * money" — which is the complaint this message exists to prevent.
 */
export function buildOrderStatus(input: {
  reference: string;
  /** The order_details message this refers to. */
  originalMessageId: string;
  status: OrderStatusValue;
  body: string;
  description?: string;
}): Record<string, unknown> {
  return {
    type: "interactive",
    // Meta requires the update to quote the message it updates.
    context: { message_id: input.originalMessageId },
    interactive: {
      type: "order_status",
      body: { text: input.body },
      action: {
        name: "review_order",
        parameters: {
          reference_id: input.reference.slice(0, MAX_REFERENCE_LENGTH),
          order: {
            status: input.status,
            ...(input.description ? { description: input.description.slice(0, 120) } : {}),
          },
        },
      },
    },
  };
}

// ------------------------------------------------------- inbound carts

/** One item as Meta reports it on an inbound order message. */
export interface InboundOrderItem {
  product_retailer_id?: string;
  quantity?: string | number;
  item_price?: string | number;
  currency?: string;
}

/**
 * Reads the cart a customer sent.
 *
 * Quantity and price arrive as strings on this webhook — the only place in
 * the Cloud API where amounts are not minor units — so both are parsed here
 * rather than at three call sites.
 */
export function readInboundCart(order: {
  catalog_id?: string;
  text?: string;
  product_items?: InboundOrderItem[];
}): { catalogId: string | null; note: string | null; lines: CartLine[] } {
  const lines: CartLine[] = [];

  for (const item of order.product_items ?? []) {
    const retailerId = item.product_retailer_id;
    if (!retailerId) continue;

    const quantity = Math.max(1, Math.round(Number(item.quantity ?? 1) || 1));
    // item_price is in major units ("1299.00"), unlike everything else.
    const price = Number(item.item_price ?? 0);
    const unitPriceCents = Number.isFinite(price)
      ? Math.round(price * MINOR_UNIT_OFFSET)
      : 0;

    lines.push({
      retailerId,
      name: retailerId,
      quantity,
      unitPriceCents,
      currency: item.currency ?? "INR",
    });
  }

  return {
    catalogId: order.catalog_id ?? null,
    note: order.text?.trim() || null,
    lines,
  };
}

/** "₹1,299" — how an amount is shown to a customer. */
export function formatAmount(cents: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / MINOR_UNIT_OFFSET);
}

/** "2 × Cotton kurta, 1 × Silk scarf" — an order in one line. */
export function describeLines(lines: CartLine[]): string {
  return lines.map((line) => `${line.quantity} × ${line.name}`).join(", ");
}
