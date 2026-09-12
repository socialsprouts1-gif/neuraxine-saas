import "server-only";

import { MetaApiError, describeMetaError, sendRawMessage } from "@/lib/meta-whatsapp";
import { loadIntegration } from "@/lib/integration-store";
import { createPaymentLink, type PaymentConnection } from "@/lib/payment-links";
import { isPaymentProvider } from "@/lib/provider-meta";
import {
  NO_CHARGES,
  buildOrderDetails,
  buildOrderStatus,
  describeLines,
  formatAmount,
  orderReference,
  orderTotals,
  readInboundCart,
  type CartLine,
  type OrderCharges,
  type OrderStatusValue,
  type OrderTotals,
} from "@/lib/orders";
import { fillTemplate } from "@/lib/booking-dialogue";
import { sendAndLogText, type OrgConnection, type RunnerClient } from "@/lib/whatsapp-send";
import { toE164 } from "@/lib/crm";

// Taking an order on WhatsApp, and getting paid for it.
//
// Two paths to the money, and which one a workspace gets depends on
// something we cannot arrange for them:
//
//   - Meta's native flow (order_details → the customer pays inside WhatsApp
//     via UPI) needs a payment configuration approved in WhatsApp Manager
//     and a gateway wired to it. Nothing here can create that.
//   - A gateway payment link works today with nothing but an API key.
//
// So the link is the default and the native flow is opt-in, rather than the
// other way round. A workspace that switches to WhatsApp payments and has
// no configuration gets told exactly that instead of a Meta error about
// parameters.

export interface CommerceContext {
  supabase: RunnerClient;
  connection: OrgConnection;
  orgId: string;
  conversationId: string;
  contactId: string;
  contactWaId: string;
  contactName: string | null;
}

interface SettingsRow {
  method: "link" | "whatsapp";
  link_provider: string | null;
  wa_payment_configuration: string | null;
  wa_payment_gateway: string | null;
  goods_type: "physical" | "digital";
  payment_expiry_minutes: number;
  tax_percent: number;
  shipping_cents: number;
  free_shipping_above_cents: number;
  order_received_message: string;
  payment_request_message: string;
  payment_received_message: string;
}

const DEFAULT_SETTINGS: SettingsRow = {
  method: "link",
  link_provider: null,
  wa_payment_configuration: null,
  wa_payment_gateway: null,
  goods_type: "physical",
  payment_expiry_minutes: 1440,
  tax_percent: 0,
  shipping_cents: 0,
  free_shipping_above_cents: 0,
  order_received_message:
    "Thanks for your order. Here is what we have: {{items}}. Total {{total}}.",
  payment_request_message: "Your order comes to {{total}}. Tap to pay: {{link}}",
  payment_received_message:
    "Payment received — thank you. Your order {{reference}} is confirmed.",
};

/** The workspace's commerce settings, defaults where there is no row. */
export async function loadPaymentSettings(
  supabase: RunnerClient,
  orgId: string
): Promise<SettingsRow> {
  const { data, error } = await supabase
    .from("payment_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  // An unmigrated database or a workspace that has never opened the screen
  // both mean "the defaults", not "broken".
  if (error || !data) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(data as unknown as Partial<SettingsRow>) };
}

function chargesFrom(settings: SettingsRow): OrderCharges {
  return {
    ...NO_CHARGES,
    taxPercent: Number(settings.tax_percent) || 0,
    shippingCents: Number(settings.shipping_cents) || 0,
    freeShippingAboveCents: Number(settings.free_shipping_above_cents) || 0,
  };
}

// ------------------------------------------------------- inbound orders

export interface CartResult {
  orderId: string;
  reference: string;
  totals: OrderTotals;
  lineCount: number;
  /** What we said back to the customer, for the audit row. */
  reply: string | null;
  error: string | null;
}

/**
 * Records the cart a customer sent, and acknowledges it.
 *
 * Prices come from the customer's cart, which comes from Meta's catalogue —
 * so they are the prices the customer was actually shown. Where we hold the
 * same product locally the name is upgraded from the bare SKU, but the price
 * is not: quoting a different figure from the one on their screen is how a
 * dispute starts.
 */
export async function recordInboundCart(
  context: CommerceContext,
  order: { catalog_id?: string; text?: string; product_items?: unknown[] }
): Promise<CartResult | null> {
  try {
    const cart = readInboundCart(order as Parameters<typeof readInboundCart>[0]);
    if (cart.lines.length === 0) return null;

    const settings = await loadPaymentSettings(context.supabase, context.orgId);
    const lines = await nameLines(context, cart.lines);
    const totals = orderTotals(lines, chargesFrom(settings));
    const currency = lines[0]?.currency ?? "INR";
    const reference = orderReference();

    const { data: created, error } = await context.supabase
      .from("store_orders")
      .insert({
        org_id: context.orgId,
        contact_id: context.contactId,
        conversation_id: context.conversationId,
        reference,
        status: "pending",
        currency,
        subtotal_cents: totals.subtotalCents,
        tax_cents: totals.taxCents,
        shipping_cents: totals.shippingCents,
        discount_cents: totals.discountCents,
        total_cents: totals.totalCents,
        catalog_id: cart.catalogId,
        notes: cart.note,
      })
      .select("id")
      .single();

    if (error || !created) {
      return {
        orderId: "",
        reference,
        totals,
        lineCount: lines.length,
        reply: null,
        error: error?.message ?? "The order could not be saved",
      };
    }

    const { error: itemsError } = await context.supabase.from("store_order_items").insert(
      lines.map((line) => ({
        order_id: created.id,
        product_id: line.productId ?? null,
        retailer_id: line.retailerId,
        name: line.name,
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        currency: line.currency,
      }))
    );
    if (itemsError) console.error("Could not save the order lines", itemsError);

    const body = fillTemplate(settings.order_received_message, {
      items: describeLines(lines),
      total: formatAmount(totals.totalCents, currency),
      reference,
      name: context.contactName ?? "",
    });

    const sent = await sendAndLogText({
      supabase: context.supabase,
      connection: context.connection,
      conversationId: context.conversationId,
      toWaId: context.contactWaId,
      body,
      // A cart is an inbound message, so the service window is open.
      skipWindowCheck: true,
    });

    return {
      orderId: created.id,
      reference,
      totals,
      lineCount: lines.length,
      reply: body,
      error: sent.ok ? null : sent.error,
    };
  } catch (error) {
    console.error("Recording the cart failed", error);
    return {
      orderId: "",
      reference: "",
      totals: orderTotals([], NO_CHARGES),
      lineCount: 0,
      reply: null,
      error: error instanceof Error ? error.message : "Unknown failure",
    };
  }
}

/**
 * Replaces the bare SKU with the product's real name where we know it.
 *
 * Only the name. The price stays as the customer's cart reported it, because
 * that is what they were shown — a local price that has since changed must
 * not silently rewrite their order.
 */
async function nameLines(context: CommerceContext, lines: CartLine[]): Promise<CartLine[]> {
  const retailerIds = lines.map((line) => line.retailerId);
  if (retailerIds.length === 0) return lines;

  const { data } = await context.supabase
    .from("products")
    .select("id, name, retailer_id, sku")
    .eq("org_id", context.orgId)
    .or(
      `retailer_id.in.(${retailerIds.map(quote).join(",")}),sku.in.(${retailerIds
        .map(quote)
        .join(",")})`
    );

  const byKey = new Map<string, { id: string; name: string }>();
  for (const row of data ?? []) {
    if (row.retailer_id) byKey.set(row.retailer_id, { id: row.id, name: row.name });
    if (row.sku && !byKey.has(row.sku)) byKey.set(row.sku, { id: row.id, name: row.name });
  }

  return lines.map((line) => {
    const match = byKey.get(line.retailerId);
    return match ? { ...line, name: match.name, productId: match.id } : line;
  });
}

/** PostgREST's `in.(…)` list needs each value quoted and its quotes escaped. */
function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

// ----------------------------------------------------------- asking to pay

export interface PaymentRequestResult {
  ok: boolean
  /** How the customer was asked: a link, or Meta's native flow. */
  method?: "link" | "whatsapp";
  url?: string | null;
  error?: string;
}

/**
 * Asks the customer to pay for an order.
 *
 * Whichever way the workspace has configured, this is the one entry point,
 * so the Orders screen, the chat flow and the API all behave identically.
 */
export async function requestPayment(
  context: CommerceContext,
  orderId: string
): Promise<PaymentRequestResult> {
  const settings = await loadPaymentSettings(context.supabase, context.orgId);

  const { data: order } = await context.supabase
    .from("store_orders")
    .select("*")
    .eq("org_id", context.orgId)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.total_cents <= 0) {
    return { ok: false, error: "This order has no amount to charge." };
  }
  if (order.status === "paid" || order.status === "confirmed") {
    return { ok: false, error: "This order is already paid." };
  }

  const { data: items } = await context.supabase
    .from("store_order_items")
    .select("*")
    .eq("order_id", orderId);

  const lines: CartLine[] = (items ?? []).map((item) => ({
    retailerId: item.retailer_id ?? item.id,
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
    currency: item.currency,
    productId: item.product_id,
  }));

  const expiresAt =
    Math.floor(Date.now() / 1000) + Math.max(600, settings.payment_expiry_minutes * 60);

  return settings.method === "whatsapp"
    ? payInWhatsApp(context, settings, order, lines, expiresAt)
    : payByLink(context, settings, order, expiresAt);
}

type OrderRow = {
  id: string;
  reference: string;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  shipping_cents: number;
  discount_cents: number;
  total_cents: number;
  catalog_id: string | null;
};

async function payInWhatsApp(
  context: CommerceContext,
  settings: SettingsRow,
  order: OrderRow,
  lines: CartLine[],
  expiresAt: number
): Promise<PaymentRequestResult> {
  // The two things Meta requires and we cannot arrange. Said plainly here,
  // because the alternative is Meta's own error, which is a bare code 100
  // about an invalid parameter.
  if (!settings.wa_payment_configuration || !settings.wa_payment_gateway) {
    return {
      ok: false,
      error:
        "WhatsApp payments need a payment configuration created in WhatsApp Manager → Payments, and its name and gateway saved under Commerce → Payments. Until then, switch the method to Payment link.",
    };
  }
  if (lines.length === 0) {
    return { ok: false, error: "An order_details message needs at least one item." };
  }

  const totals: OrderTotals = {
    subtotalCents: order.subtotal_cents,
    taxCents: order.tax_cents,
    shippingCents: order.shipping_cents,
    discountCents: order.discount_cents,
    totalCents: order.total_cents,
  };

  const payload = buildOrderDetails({
    reference: order.reference,
    currency: order.currency,
    body: fillTemplate(settings.payment_request_message, {
      total: formatAmount(order.total_cents, order.currency),
      reference: order.reference,
      items: describeLines(lines),
      // The native flow has no link — the customer pays in the message
      // itself — so the placeholder is removed rather than left showing.
      link: "",
    }).replace(/\s*\{\{\s*link\s*\}\}\s*/g, " ").trim(),
    lines,
    totals,
    catalogId: order.catalog_id,
    goodsType: settings.goods_type,
    paymentConfiguration: settings.wa_payment_configuration,
    gateway: settings.wa_payment_gateway,
    expiresAt,
  });

  try {
    const result = await sendRawMessage(
      context.connection.phoneNumberId,
      context.contactWaId,
      payload as unknown as Record<string, unknown>,
      context.connection.accessToken
    );

    const messageId = result.messages[0]?.id ?? null;

    await context.supabase
      .from("store_orders")
      .update({
        status: "awaiting_payment",
        payment_provider: "whatsapp",
        wa_order_message_id: messageId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await context.supabase.from("messages").insert({
      conversation_id: context.conversationId,
      direction: "outbound",
      type: "interactive",
      content: { order_details: order.reference, total_cents: order.total_cents },
      wa_message_id: messageId,
      status: "sent",
    });

    return { ok: true, method: "whatsapp", url: null };
  } catch (error) {
    const message =
      error instanceof MetaApiError
        ? describeMetaError(error.status, error.body)
        : error instanceof Error
          ? error.message
          : "Unknown send failure";
    return { ok: false, error: message };
  }
}

async function payByLink(
  context: CommerceContext,
  settings: SettingsRow,
  order: OrderRow,
  expiresAt: number
): Promise<PaymentRequestResult> {
  const provider = settings.link_provider ?? "";
  if (!isPaymentProvider(provider)) {
    return {
      ok: false,
      error:
        "No payment gateway chosen. Connect Razorpay, Cashfree or Stripe under Integrations, then pick it under Commerce → Payments.",
    };
  }

  const stored = await loadIntegration(context.supabase, context.orgId, provider);
  if (!stored) {
    return {
      ok: false,
      error: `${provider} is not connected, or its stored credentials could not be decrypted.`,
    };
  }

  const connection: PaymentConnection = {
    provider,
    credentials: stored.credentials,
    config: stored.config,
  };

  const link = await createPaymentLink(connection, {
    amountCents: order.total_cents,
    currency: order.currency,
    description: `Order ${order.reference}`,
    customerName: context.contactName,
    customerPhone: toE164(context.contactWaId),
    // Ours, so the gateway's webhook can be matched back to this order
    // without a lookup table.
    reference: order.reference,
    expiresAt,
  });

  if (!link.ok) return { ok: false, error: link.error };

  await context.supabase
    .from("store_orders")
    .update({
      status: "awaiting_payment",
      payment_provider: provider,
      payment_link_url: link.url,
      payment_reference: link.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  const body = fillTemplate(settings.payment_request_message, {
    total: formatAmount(order.total_cents, order.currency),
    reference: order.reference,
    link: link.url,
    items: "",
  });

  const sent = await sendAndLogText({
    supabase: context.supabase,
    connection: context.connection,
    conversationId: context.conversationId,
    toWaId: context.contactWaId,
    body,
    skipWindowCheck: true,
  });

  return sent.ok
    ? { ok: true, method: "link", url: link.url }
    : { ok: false, error: sent.error ?? "The link was created but the message did not send." };
}

// ------------------------------------------------------- status updates

/**
 * Moves an order along, and tells the customer.
 *
 * The message matters more than it looks for a WhatsApp-paid order: Meta
 * leaves the order card at "pending" forever unless an order_status message
 * says otherwise, and a pending card in the customer's chat reads as "they
 * never took my money".
 */
export async function updateOrderStatus(args: {
  supabase: RunnerClient;
  orgId: string;
  orderId: string;
  status: "pending" | "awaiting_payment" | "paid" | "confirmed" | "shipped" | "delivered" | "cancelled" | "refunded";
  /** Sent to the customer as well, when there is a connection to send on. */
  notify?: { connection: OrgConnection; body?: string } | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, orgId, orderId, status } = args;

  const { data: order } = await supabase
    .from("store_orders")
    .select("id, reference, status, currency, total_cents, conversation_id, wa_order_message_id, payment_provider")
    .eq("org_id", orgId)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "That order no longer exists." };

  const { error } = await supabase
    .from("store_orders")
    .update({
      status,
      ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) return { ok: false, error: error.message };

  if (!args.notify || !order.conversation_id) return { ok: true };

  const { data: contact } = await supabase
    .from("conversations")
    .select("contacts(wa_id)")
    .eq("id", order.conversation_id)
    .maybeSingle();

  const waId = (contact?.contacts as { wa_id?: string } | null)?.wa_id;
  if (!waId) return { ok: true };

  const body =
    args.notify.body ??
    `Order ${order.reference} is now ${status.replace("_", " ")}.`;

  // An order paid inside WhatsApp gets the native card updated as well, so
  // the customer's own record of it stops saying pending.
  if (order.payment_provider === "whatsapp" && order.wa_order_message_id) {
    const metaStatus = META_STATUS[status];
    if (metaStatus) {
      try {
        await sendRawMessage(
          args.notify.connection.phoneNumberId,
          waId,
          buildOrderStatus({
            reference: order.reference,
            originalMessageId: order.wa_order_message_id,
            status: metaStatus,
            body,
          }),
          args.notify.connection.accessToken
        );
        return { ok: true };
      } catch (statusError) {
        // Fall through to a plain message: the customer being told is worth
        // more than the card being pretty.
        console.error("order_status update failed", statusError);
      }
    }
  }

  await sendAndLogText({
    supabase,
    connection: args.notify.connection,
    conversationId: order.conversation_id,
    toWaId: waId,
    body,
    skipWindowCheck: true,
  });

  return { ok: true };
}

/** Our statuses in the words Meta's order card understands. */
const META_STATUS: Partial<Record<string, OrderStatusValue>> = {
  pending: "pending",
  awaiting_payment: "pending",
  paid: "processing",
  confirmed: "processing",
  shipped: "shipped",
  delivered: "completed",
  cancelled: "canceled",
  refunded: "canceled",
};
