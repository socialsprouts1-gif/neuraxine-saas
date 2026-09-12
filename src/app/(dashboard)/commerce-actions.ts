"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { listConnections } from "@/lib/connections";
import {
  MetaApiError,
  describeMetaError,
  getCommerceSettings,
  listCatalogProducts,
  listWabaCatalogs,
  sendCatalogMessage,
  sendProductListMessage,
  sendProductMessage,
  setCommerceSettings,
} from "@/lib/meta-whatsapp";
import { loadOrgConnection } from "@/lib/whatsapp-send";
import { findContactConversation } from "@/lib/contact-conversation";
import { loadPaymentSettings, requestPayment, updateOrderStatus } from "@/lib/commerce";
import { STORE_ORDER_STATUSES } from "@/types/portal";
import { isPaymentProvider } from "@/lib/provider-meta";
import { orderReference } from "@/lib/orders";
import type { ActionResult } from "./actions";

// Everything the Commerce screen does that touches Meta or an order.
//
// The division of labour worth knowing: products are managed in Meta's
// Commerce Manager, not here. Creating catalogue items needs the
// catalog_management permission, which this app has not been granted, so
// pretending to write them would fail on the first product with an error
// about scopes. What this does instead is read the catalogue, mirror it
// locally so it can be searched and sent, and send the real product
// messages that let a customer browse and build a cart in the chat.

async function requireManager() {
  const ctx = await requireFeature("commerce");
  if (ctx.role !== "owner" && ctx.role !== "admin") return null;
  return ctx;
}

const DENIED = "Only owners and admins can change commerce settings.";

function metaError(error: unknown): string {
  if (error instanceof MetaApiError) return describeMetaError(error.status, error.body);
  return error instanceof Error ? error.message : "Unknown Meta failure";
}

/**
 * The connection a commerce action should act on, token and all.
 *
 * A workspace can have several numbers and a catalogue belongs to the WABA,
 * so which number was chosen genuinely changes the answer. listConnections
 * deliberately does not carry the access token — it is for display — so the
 * choice is made there and the token fetched by loadOrgConnection.
 */
async function pickConnection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  connectionId: string | null
) {
  const summaries = await listConnections(supabase, orgId);
  if (summaries.length === 0) return null;

  const chosen = connectionId
    ? summaries.find((entry) => entry.id === connectionId)
    : (summaries.find((entry) => entry.isDefault) ?? summaries[0]);
  if (!chosen) return null;

  return loadOrgConnection(supabase, orgId, { connectionId: chosen.id });
}

// ------------------------------------------------------------- catalogue

/**
 * Finds the Meta catalogue attached to the WABA and remembers it.
 *
 * Also reads back whether the storefront and cart are actually switched on,
 * because a catalogue that exists but is invisible looks identical to one
 * that works until a customer cannot find the shop button.
 */
export async function linkCatalog(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const supabase = await createClient();
  const connection = await pickConnection(
    supabase,
    ctx.orgId,
    String(formData.get("connection_id") ?? "") || null
  );
  if (!connection) {
    return { ok: false, error: "Connect a WhatsApp number under Integrations first." };
  }

  try {
    const catalogs = await listWabaCatalogs(connection.wabaId, connection.accessToken);

    if (catalogs.length === 0) {
      return {
        ok: false,
        error:
          "No catalogue is attached to this WhatsApp Business Account. Create one in Meta Commerce Manager, then connect it to the WABA under WhatsApp Manager → Catalogue.",
      };
    }

    // A chosen id wins; otherwise the only one, or the first. Meta gives no
    // way to mark a default, so the choice is stored here.
    const wanted = String(formData.get("catalog_id") ?? "").trim();
    const catalog =
      catalogs.find((entry) => entry.id === wanted) ?? catalogs[0];

    let commerce: { isCatalogVisible: boolean | null; isCartEnabled: boolean | null } = {
      isCatalogVisible: null,
      isCartEnabled: null,
    };
    try {
      commerce = await getCommerceSettings(connection.phoneNumberId, connection.accessToken);
    } catch {
      // Not fatal. The catalogue link is the point; the visibility flags are
      // a nicety, and losing them should not lose the link.
    }

    const { error } = await supabase
      .from("waba_connections")
      .update({
        catalog_id: catalog.id,
        catalog_name: catalog.name,
        is_catalog_visible: commerce.isCatalogVisible,
        is_cart_enabled: commerce.isCartEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("org_id", ctx.orgId);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/commerce");
    return {
      ok: true,
      message:
        `Linked “${catalog.name}”` +
        (catalog.productCount !== null ? ` — ${catalog.productCount} items` : "") +
        (catalogs.length > 1 ? `. ${catalogs.length} catalogues found; this is the first.` : ".") +
        (commerce.isCatalogVisible === false
          ? " The storefront is currently hidden on this number — turn it on below."
          : ""),
    };
  } catch (error) {
    return { ok: false, error: metaError(error) };
  }
}

/** Turns the storefront icon and the in-chat cart on or off. */
export async function saveStorefront(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const supabase = await createClient();
  const connection = await pickConnection(
    supabase,
    ctx.orgId,
    String(formData.get("connection_id") ?? "") || null
  );
  if (!connection) return { ok: false, error: "No WhatsApp number to configure." };

  const isCatalogVisible = formData.get("is_catalog_visible") !== null;
  const isCartEnabled = formData.get("is_cart_enabled") !== null;

  try {
    await setCommerceSettings(connection.phoneNumberId, connection.accessToken, {
      isCatalogVisible,
      isCartEnabled,
    });

    await supabase
      .from("waba_connections")
      .update({
        is_catalog_visible: isCatalogVisible,
        is_cart_enabled: isCartEnabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("org_id", ctx.orgId);

    revalidatePath("/commerce");
    return {
      ok: true,
      message: isCatalogVisible
        ? `Storefront on${isCartEnabled ? " with the cart enabled" : ", cart off"}. It can take a few minutes to appear in the chat.`
        : "Storefront hidden.",
    };
  } catch (error) {
    return { ok: false, error: metaError(error) };
  }
}

/**
 * Mirrors the Meta catalogue into the local product list.
 *
 * The retailer_id is the reason: a product message can only reference an
 * item by the SKU Meta knows it as, so a product that only exists locally
 * cannot be sent as a product card. Importing gives every row the id that
 * makes it sendable.
 */
export async function importCatalog(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const supabase = await createClient();
  const connection = await pickConnection(
    supabase,
    ctx.orgId,
    String(formData.get("connection_id") ?? "") || null
  );
  if (!connection) return { ok: false, error: "No WhatsApp number to import from." };

  const { data: row } = await supabase
    .from("waba_connections")
    .select("catalog_id")
    .eq("id", connection.id)
    .maybeSingle();

  const catalogId = row?.catalog_id;
  if (!catalogId) {
    return { ok: false, error: "Link a catalogue first — there is nothing to import from." };
  }

  try {
    const products = await listCatalogProducts(catalogId, connection.accessToken);
    if (products.length === 0) {
      return {
        ok: false,
        error:
          "The catalogue is linked but has no items with a content ID. Add products in Commerce Manager first.",
      };
    }

    const { data: existing } = await supabase
      .from("products")
      .select("id, retailer_id")
      .eq("org_id", ctx.orgId)
      .not("retailer_id", "is", null);

    const rows = (existing ?? []) as Array<{ id: string; retailer_id: string | null }>;
    const byRetailer = new Map(
      rows
        .filter((entry): entry is { id: string; retailer_id: string } => !!entry.retailer_id)
        .map((entry) => [entry.retailer_id, entry.id] as const)
    );

    let created = 0;
    let updated = 0;
    let failed = 0;
    let firstError: string | null = null;

    for (const product of products) {
      const row = {
        org_id: ctx.orgId,
        name: product.name.slice(0, 200),
        description: product.description,
        // Meta returns the price already formatted ("₹1,299.00") with no
        // minor-unit field, so it is parsed rather than read.
        price_cents: parseMetaPrice(product.price),
        currency: product.currency ?? "INR",
        image_url: product.imageUrl,
        retailer_id: product.retailerId,
        is_active: (product.availability ?? "in stock") === "in stock",
        updated_at: new Date().toISOString(),
      };

      const id = byRetailer.get(product.retailerId);
      const { error } = id
        ? await supabase.from("products").update(row).eq("id", id).eq("org_id", ctx.orgId)
        : await supabase.from("products").insert(row);

      if (error) {
        failed += 1;
        firstError ??= error.message;
      } else if (id) updated += 1;
      else created += 1;
    }

    revalidatePath("/commerce");

    const parts = [`${created} added`, `${updated} updated`, failed > 0 ? `${failed} failed` : null]
      .filter(Boolean)
      .join(", ");

    return failed > 0 && created + updated === 0
      ? { ok: false, error: `Nothing imported — ${firstError}` }
      : { ok: true, message: `Catalogue: ${parts}.` };
  } catch (error) {
    return { ok: false, error: metaError(error) };
  }
}

/**
 * Meta's formatted price into paise.
 *
 * "₹1,299.00" — currency symbol, thousands separators and all. There is no
 * minor-unit field on this edge, so the string is the only source.
 */
function parseMetaPrice(value: string | null): number {
  if (!value) return 0;
  const digits = value.replace(/[^\d.,]/g, "");
  if (!digits) return 0;

  // The last separator followed by exactly two digits is the decimal point;
  // everything else is a thousands separator. This is what makes both
  // "1,299.00" and "1.299,00" come out the same.
  const match = /^(.*)[.,](\d{2})$/.exec(digits);
  if (match) {
    const whole = Number(match[1].replace(/[.,]/g, "") || "0");
    return whole * 100 + Number(match[2]);
  }
  return Number(digits.replace(/[.,]/g, "") || "0") * 100;
}

// ------------------------------------------------------ sending products

/** Sends one product, several, or the whole catalogue, into a conversation. */
export async function sendProducts(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("commerce");

  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  const retailerIds = String(formData.get("retailer_ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const mode = String(formData.get("mode") ?? "auto");

  if (!conversationId) return { ok: false, error: "No conversation to send into." };

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, connection_id, contacts(wa_id)")
    .eq("org_id", ctx.orgId)
    .eq("id", conversationId)
    .maybeSingle();

  const waId = (conversation?.contacts as { wa_id?: string } | null)?.wa_id;
  if (!conversation || !waId) return { ok: false, error: "That conversation no longer exists." };

  const connection = await loadOrgConnection(supabase, ctx.orgId, { conversationId });
  if (!connection) {
    return { ok: false, error: "No usable WhatsApp connection for this conversation." };
  }

  const { data: row } = await supabase
    .from("waba_connections")
    .select("catalog_id")
    .eq("id", connection.id)
    .maybeSingle();

  const catalogId = row?.catalog_id;
  if (!catalogId) {
    return {
      ok: false,
      error:
        "Link a Meta catalogue under Commerce → Catalogue first. A product card can only reference items in a catalogue Meta holds.",
    };
  }

  const body = String(formData.get("body") ?? "").trim() || "Here is what we have:";

  try {
    let result;
    let logged: Record<string, unknown>;

    if (mode === "catalog" || retailerIds.length === 0) {
      result = await sendCatalogMessage(connection.phoneNumberId, waId, body, connection.accessToken, {
        thumbnailRetailerId: retailerIds[0],
      });
      logged = { catalog_message: true, body };
    } else if (retailerIds.length === 1) {
      result = await sendProductMessage(
        connection.phoneNumberId,
        waId,
        catalogId,
        retailerIds[0],
        connection.accessToken,
        { body }
      );
      logged = { product: retailerIds[0], body };
    } else {
      result = await sendProductListMessage(
        connection.phoneNumberId,
        waId,
        catalogId,
        String(formData.get("header") ?? "Our products").trim() || "Our products",
        body,
        [{ title: "Products", retailerIds }],
        connection.accessToken
      );
      logged = { product_list: retailerIds, body };
    }

    const sentAt = new Date().toISOString();
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      type: "interactive",
      content: logged,
      wa_message_id: result.messages[0]?.id ?? null,
      status: "sent",
    });
    await supabase
      .from("conversations")
      .update({ last_message_at: sentAt })
      .eq("id", conversationId);

    revalidatePath("/inbox");
    return {
      ok: true,
      message:
        retailerIds.length > 1
          ? `Sent ${retailerIds.length} products.`
          : retailerIds.length === 1
            ? "Product sent."
            : "Catalogue sent.",
    };
  } catch (error) {
    return { ok: false, error: metaError(error) };
  }
}

// ---------------------------------------------------------------- orders

/** Asks the customer to pay for an order, whichever way is configured. */
export async function askForPayment(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("commerce");

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "No order selected." };

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("store_orders")
    .select("id, conversation_id, contact_id, contacts(wa_id, name)")
    .eq("org_id", ctx.orgId)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "That order no longer exists." };
  if (!order.conversation_id || !order.contact_id) {
    return {
      ok: false,
      error: "This order has no WhatsApp conversation to send a payment request into.",
    };
  }

  const contact = order.contacts as { wa_id?: string; name?: string | null } | null;
  if (!contact?.wa_id) return { ok: false, error: "This order's contact has no WhatsApp number." };

  const connection = await loadOrgConnection(supabase, ctx.orgId, {
    conversationId: order.conversation_id,
  });
  if (!connection) return { ok: false, error: "No usable WhatsApp connection for this order." };

  const result = await requestPayment(
    {
      supabase,
      connection,
      orgId: ctx.orgId,
      conversationId: order.conversation_id,
      contactId: order.contact_id,
      contactWaId: contact.wa_id,
      contactName: contact.name ?? null,
    },
    orderId
  );

  revalidatePath("/commerce");
  revalidatePath("/inbox");

  if (!result.ok) return { ok: false, error: result.error ?? "The payment request failed." };
  return {
    ok: true,
    message:
      result.method === "whatsapp"
        ? "Sent as a WhatsApp payment request — the customer can pay by UPI in the chat."
        : `Payment link sent${result.url ? `: ${result.url}` : "."}`,
  };
}

/** Moves an order along, and tells the customer. */
export async function setOrderStatus(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("commerce");

  const orderId = String(formData.get("order_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (!orderId) return { ok: false, error: "No order selected." };
  if (!(STORE_ORDER_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Not a status an order can be in." };
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("store_orders")
    .select("conversation_id")
    .eq("org_id", ctx.orgId)
    .eq("id", orderId)
    .maybeSingle();

  const connection = order?.conversation_id
    ? await loadOrgConnection(supabase, ctx.orgId, { conversationId: order.conversation_id })
    : null;

  const result = await updateOrderStatus({
    supabase,
    orgId: ctx.orgId,
    orderId,
    status: status as "paid",
    // Silent for the internal-only moves. Telling a customer their order is
    // "pending" again is noise, and telling them twice is worse.
    notify:
      connection && ["confirmed", "shipped", "delivered", "cancelled", "refunded"].includes(status)
        ? { connection }
        : null,
  });

  revalidatePath("/commerce");
  if (!result.ok) return { ok: false, error: result.error ?? "The order could not be updated." };
  return { ok: true, message: `Order marked ${status.replace("_", " ")}.` };
}

/** Records the AWB so "where is my order?" has an answer. */
export async function saveOrderShipping(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("commerce");

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "No order selected." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_orders")
    .update({
      awb: String(formData.get("awb") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", ctx.orgId)
    .eq("id", orderId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/commerce");
  return { ok: true, message: "Saved." };
}

// -------------------------------------------------------------- payments

/** How this workspace asks for money, and what it says while doing it. */
export async function savePaymentSettings(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const method = String(formData.get("method") ?? "link") === "whatsapp" ? "whatsapp" : "link";
  const linkProvider = String(formData.get("link_provider") ?? "").trim() || null;
  const configuration = String(formData.get("wa_payment_configuration") ?? "").trim() || null;
  const gateway = String(formData.get("wa_payment_gateway") ?? "").trim().toLowerCase() || null;

  // Refused here rather than at send time. A workspace that switches to
  // WhatsApp payments without a configuration would otherwise discover it
  // on the first real order, in front of a customer.
  if (method === "whatsapp" && (!configuration || !gateway)) {
    return {
      ok: false,
      error:
        "WhatsApp payments need the payment configuration name from WhatsApp Manager → Payments, and the gateway behind it (razorpay or payu).",
    };
  }
  if (method === "whatsapp" && gateway && !["razorpay", "payu"].includes(gateway)) {
    return { ok: false, error: "Meta supports razorpay or payu as the gateway for India." };
  }
  if (method === "link" && linkProvider && !isPaymentProvider(linkProvider)) {
    return { ok: false, error: "Choose Razorpay, Cashfree or Stripe." };
  }

  const number = (name: string, fallback: number) => {
    const raw = String(formData.get(name) ?? "").trim();
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  const text = (name: string, fallback: string) =>
    String(formData.get(name) ?? "").trim() || fallback;

  const supabase = await createClient();
  const { error } = await supabase.from("payment_settings").upsert(
    {
      org_id: ctx.orgId,
      method,
      link_provider: linkProvider,
      wa_payment_configuration: configuration,
      wa_payment_gateway: gateway,
      goods_type:
        String(formData.get("goods_type") ?? "physical") === "digital" ? "digital" : "physical",
      payment_expiry_minutes: Math.max(
        10,
        Math.min(20160, Math.round(number("payment_expiry_minutes", 1440)))
      ),
      tax_percent: Math.max(0, Math.min(100, number("tax_percent", 0))),
      // Typed in rupees, stored in paise.
      shipping_cents: Math.max(0, Math.round(number("shipping", 0) * 100)),
      free_shipping_above_cents: Math.max(0, Math.round(number("free_shipping_above", 0) * 100)),
      order_received_message: text(
        "order_received_message",
        "Thanks for your order. Here is what we have: {{items}}. Total {{total}}."
      ),
      payment_request_message: text(
        "payment_request_message",
        "Your order comes to {{total}}. Tap to pay: {{link}}"
      ),
      payment_received_message: text(
        "payment_received_message",
        "Payment received — thank you. Your order {{reference}} is confirmed."
      ),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" }
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/commerce");
  return {
    ok: true,
    message:
      method === "whatsapp"
        ? "Saved. Customers will be asked to pay inside WhatsApp."
        : "Saved. Customers will get a payment link.",
  };
}

/**
 * Charges a customer for something agreed in the conversation.
 *
 * No catalogue and no cart — a repair, a consultation, a custom order. It
 * still creates a real order rather than a bare payment link, because the
 * webhook that reports the payment matches on an order reference and because
 * "what did we charge them for?" is a question somebody asks later.
 */
export async function chargeCustomer(formData: FormData): Promise<ActionResult> {
  const ctx = await requireFeature("commerce");

  const contactId = String(formData.get("contact_id") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const rupees = Number(String(formData.get("amount") ?? "").trim());

  if (!contactId) return { ok: false, error: "Choose a customer to charge." };
  if (!description) return { ok: false, error: "Say what the charge is for." };
  if (!Number.isFinite(rupees) || rupees <= 0) {
    return { ok: false, error: "Enter an amount above zero." };
  }

  const supabase = await createClient();
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, wa_id, name")
    .eq("org_id", ctx.orgId)
    .eq("id", contactId)
    .maybeSingle();

  if (!contact) return { ok: false, error: "That contact no longer exists." };

  // A charge needs a conversation to be sent into, and a conversation is
  // also what proves the customer has written to us — which is what makes
  // the 24-hour window open.
  const conversation = await findContactConversation(supabase, ctx.orgId, contactId);

  if (!conversation) {
    return {
      ok: false,
      error:
        "There is no WhatsApp conversation with this contact yet. They have to message you first — WhatsApp does not allow a business to open a chat with a free-form message.",
    };
  }

  const connection = await loadOrgConnection(supabase, ctx.orgId, {
    conversationId: conversation.id,
  });
  if (!connection) return { ok: false, error: "No usable WhatsApp connection." };

  const settings = await loadPaymentSettings(supabase, ctx.orgId);
  const amountCents = Math.round(rupees * 100);
  const taxCents = Math.round((amountCents * (Number(settings.tax_percent) || 0)) / 100);
  const reference = orderReference();

  const { data: order, error } = await supabase
    .from("store_orders")
    .insert({
      org_id: ctx.orgId,
      contact_id: contactId,
      conversation_id: conversation.id,
      reference,
      status: "pending",
      currency: "INR",
      subtotal_cents: amountCents,
      tax_cents: taxCents,
      // No shipping on an ad-hoc charge: there is nothing to ship, and
      // adding the configured amount would surprise everyone.
      shipping_cents: 0,
      total_cents: amountCents + taxCents,
      notes: description,
    })
    .select("id")
    .single();

  if (error || !order) {
    return { ok: false, error: error?.message ?? "The charge could not be saved." };
  }

  await supabase.from("store_order_items").insert({
    order_id: order.id,
    name: description.slice(0, 200),
    quantity: 1,
    unit_price_cents: amountCents,
    currency: "INR",
  });

  const result = await requestPayment(
    {
      supabase,
      connection,
      orgId: ctx.orgId,
      conversationId: conversation.id,
      contactId,
      contactWaId: contact.wa_id,
      contactName: contact.name,
    },
    order.id
  );

  revalidatePath("/wa-pay");
  revalidatePath("/commerce");
  revalidatePath("/inbox");

  if (!result.ok) {
    // The order stands so it can be retried or marked paid by hand; the
    // failure is about the request, not the charge.
    return {
      ok: false,
      error: `${result.error} The order ${reference} was saved, so you can retry it from Commerce.`,
    };
  }

  return {
    ok: true,
    message:
      result.method === "whatsapp"
        ? `Sent ${reference} as a WhatsApp payment request.`
        : `Sent ${reference}${result.url ? ` — ${result.url}` : "."}`,
  };
}

/** Exported so the Commerce page and these actions agree on the defaults. */
export async function currentPaymentSettings(orgId: string) {
  const supabase = await createClient();
  return loadPaymentSettings(supabase, orgId);
}
