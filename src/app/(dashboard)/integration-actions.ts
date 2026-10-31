"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";
import { integrationBySlug } from "@/lib/integrations";
import { loadIntegration, recordIntegrationOutcome } from "@/lib/integration-store";
import { isCrmProvider, CRM_LABEL } from "@/lib/crm";
import { loadCrmConnections, testCrmConnection } from "@/lib/crm-sync";
import { testPaymentProvider, type PaymentConnection } from "@/lib/payment-links";
import {
  IMPORT_LIMIT,
  fetchStoreProducts,
  testStoreProvider,
  type StoreConnection,
} from "@/lib/store-import";
import { fetchLeads, testLeadProvider, type LeadConnection } from "@/lib/lead-sources";
import {
  LEAD_LABEL,
  PAYMENT_LABEL,
  STORE_LABEL,
  isLeadProvider,
  isPaymentProvider,
  isStoreProvider,
} from "@/lib/provider-meta";
import {
  fetchCalendlyEventTypes,
  testShiprocket,
  trackShipment,
  createShiprocketOrder,
  listPickupLocations,
  listShiprocketOrders,
  assignAwb,
  generateLabel,
  generateInvoice,
  requestPickup,
} from "@/lib/misc-providers";
import { courierDate, customerMessage, staffSummary } from "@/lib/shipment-message";
import { buildShiprocketOrder } from "@/lib/shiprocket-order";
import { loadOrgConnection, sendAndLogText } from "@/lib/whatsapp-send";
import { loadGoogleCalendar, testGoogleCalendar } from "@/lib/google-calendar";
import type { ActionResult } from "./actions";

// One place for "does this integration actually work", and for the one real
// operation each of them has.
//
// Connecting only encrypts what was typed; nothing checks it until the first
// customer arrives, and by then the failure is a line in a log nobody is
// watching. Every provider therefore has a Test button that makes a real
// call and reports the provider's own words.

async function requireManager() {
  const ctx = await requireOrg();
  if (ctx.role !== "owner" && ctx.role !== "admin") return null;
  return ctx;
}

const DENIED = "Only owners and admins can manage integrations.";

function notConnected(name: string): ActionResult {
  return {
    ok: false,
    error: `${name} is not connected, or its stored credentials could not be decrypted. Disconnect and connect again.`,
  };
}

// ------------------------------------------------------------------ test

/**
 * Calls the provider with the stored credentials and says what came back.
 *
 * One action for every provider rather than one each: the dispatch is a
 * lookup, and a separate action per provider would be ten copies of the same
 * permission check and the same error wrapping.
 */
export async function testIntegration(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const provider = String(formData.get("provider") ?? "");
  const def = integrationBySlug(provider);
  if (!def) return { ok: false, error: "Not an integration this app knows about." };

  const supabase = await createClient();
  const failure = await runTest(supabase, ctx.orgId, provider);

  // Whatever happened goes on the row, so the card shows the state of the
  // last real attempt rather than the state at the moment it was connected.
  await recordIntegrationOutcome(supabase, ctx.orgId, provider, failure.error);
  revalidatePath("/integrations");

  if (failure.error) return { ok: false, error: failure.error };
  return { ok: true, message: failure.message ?? `${def.name} answered. The credentials work.` };
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function runTest(
  supabase: Client,
  orgId: string,
  provider: string
): Promise<{ error: string | null; message?: string }> {
  const def = integrationBySlug(provider)!;

  if (isCrmProvider(provider)) {
    const [connection] = await loadCrmConnections(supabase, orgId, provider);
    if (!connection) return { error: notConnected(CRM_LABEL[provider]).error! };
    return { error: await testCrmConnection(connection) };
  }

  if (isPaymentProvider(provider)) {
    const stored = await loadIntegration(supabase, orgId, provider);
    if (!stored) return { error: notConnected(PAYMENT_LABEL[provider]).error! };
    const connection: PaymentConnection = {
      provider,
      credentials: stored.credentials,
      config: stored.config,
    };
    return { error: await testPaymentProvider(connection) };
  }

  if (isStoreProvider(provider)) {
    const stored = await loadIntegration(supabase, orgId, provider);
    if (!stored) return { error: notConnected(STORE_LABEL[provider]).error! };
    const connection: StoreConnection = {
      provider,
      credentials: stored.credentials,
      config: stored.config,
    };
    return { error: await testStoreProvider(connection) };
  }

  if (isLeadProvider(provider)) {
    const stored = await loadIntegration(supabase, orgId, provider);
    if (!stored) return { error: notConnected(LEAD_LABEL[provider]).error! };
    const connection: LeadConnection = {
      provider,
      credentials: stored.credentials,
      config: stored.config,
    };
    return { error: await testLeadProvider(connection) };
  }

  if (provider === "google-calendar") {
    const credentials = await loadGoogleCalendar(supabase, orgId);
    if (!credentials) return { error: notConnected("Google Calendar").error! };
    const result = await testGoogleCalendar(credentials);
    return result.ok
      ? { error: null, message: `Connected to “${result.calendarName}”.` }
      : { error: result.error };
  }

  if (provider === "shiprocket") {
    const stored = await loadIntegration(supabase, orgId, provider);
    if (!stored) return { error: notConnected("Shiprocket").error! };
    return {
      error: await testShiprocket({
        email: stored.values.email ?? "",
        password: stored.values.password ?? "",
      }),
    };
  }

  if (provider === "calendly") {
    const stored = await loadIntegration(supabase, orgId, provider);
    if (!stored) return { error: notConnected("Calendly").error! };
    const result = await fetchCalendlyEventTypes(stored.values.access_token ?? "");
    return result.ok
      ? {
          error: null,
          message: `Connected to ${result.owner} — ${result.types.length} booking ${
            result.types.length === 1 ? "link" : "links"
          }.`,
        }
      : { error: result.error };
  }

  // Webhook-driven and always-on entries have nothing to call. Saying so is
  // better than a button that reports success without having done anything.
  return {
    error: null,
    message:
      def.capability === "via_webhook"
        ? `${def.name} receives events from us rather than answering requests, so there is nothing to call. Check the delivery log under Outgoing Webhooks.`
        : `${def.name} has no credentials to check.`,
  };
}

// ---------------------------------------------------------------- import

/**
 * Pulls a shop's products into the local catalogue.
 *
 * Keyed on the shop's own id so a second import updates rather than
 * duplicates. One direction only: writing stock back means owning inventory
 * arithmetic across two systems that both think they are authoritative.
 */
export async function importProducts(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const provider = String(formData.get("provider") ?? "");
  if (!isStoreProvider(provider)) return { ok: false, error: "Not a shop this app can import from." };

  const supabase = await createClient();
  const stored = await loadIntegration(supabase, ctx.orgId, provider);
  if (!stored) return notConnected(STORE_LABEL[provider]);

  const result = await fetchStoreProducts({
    provider,
    credentials: stored.credentials,
    config: stored.config,
  });

  if (!result.ok) {
    await recordIntegrationOutcome(supabase, ctx.orgId, provider, result.error);
    revalidatePath("/integrations");
    return { ok: false, error: result.error };
  }

  if (result.products.length === 0) {
    return { ok: false, error: `${STORE_LABEL[provider]} answered, but has no published products.` };
  }

  // Existing rows by external id, so an import updates the same product
  // rather than adding a second copy of it every time.
  const { data: existing } = await supabase
    .from("products")
    .select("id, external_id")
    .eq("org_id", ctx.orgId)
    .not("external_id", "is", null);

  const byExternal = new Map(
    (existing ?? [])
      .filter((row): row is { id: string; external_id: string } => !!row.external_id)
      .map((row) => [row.external_id, row.id])
  );

  let created = 0;
  let updated = 0;
  let failed = 0;
  let firstError: string | null = null;

  for (const product of result.products) {
    const row = {
      org_id: ctx.orgId,
      name: product.name.slice(0, 200),
      sku: product.sku,
      price_cents: product.priceCents,
      currency: product.currency,
      stock: product.stock,
      image_url: product.imageUrl,
      description: product.description,
      external_id: product.externalId,
      is_active: product.isActive,
      updated_at: new Date().toISOString(),
    };

    const id = byExternal.get(product.externalId);
    const { error } = id
      ? await supabase.from("products").update(row).eq("id", id).eq("org_id", ctx.orgId)
      : await supabase.from("products").insert(row);

    if (error) {
      failed += 1;
      firstError ??= error.message;
    } else if (id) updated += 1;
    else created += 1;
  }

  await recordIntegrationOutcome(supabase, ctx.orgId, provider, firstError);
  revalidatePath("/integrations");
  revalidatePath("/commerce");

  const parts = [
    `${created} added`,
    `${updated} updated`,
    failed > 0 ? `${failed} failed` : null,
  ].filter(Boolean);

  return {
    ok: failed === 0,
    ...(failed === 0
      ? {
          message:
            `${STORE_LABEL[provider]}: ${parts.join(", ")}.` +
            (result.truncated
              ? ` Stopped at ${IMPORT_LIMIT} — run it again for the rest.`
              : ""),
        }
      : { error: `${parts.join(", ")}. ${firstError}` }),
  } as ActionResult;
}

/**
 * Pulls leads in as contacts.
 *
 * A lead already in the contact book is left alone rather than overwritten:
 * whatever the team has since learned about that person is worth more than
 * what the lead form said.
 */
export async function importLeads(formData: FormData): Promise<ActionResult> {
  const ctx = await requireManager();
  if (!ctx) return { ok: false, error: DENIED };

  const provider = String(formData.get("provider") ?? "");
  if (!isLeadProvider(provider)) {
    return { ok: false, error: "Not a lead source this app can import from." };
  }

  const supabase = await createClient();
  const stored = await loadIntegration(supabase, ctx.orgId, provider);
  if (!stored) return notConnected(LEAD_LABEL[provider]);

  const result = await fetchLeads({
    provider,
    credentials: stored.credentials,
    config: stored.config,
  });

  if (!result.ok) {
    await recordIntegrationOutcome(supabase, ctx.orgId, provider, result.error);
    revalidatePath("/integrations");
    return { ok: false, error: result.error };
  }

  if (result.leads.length === 0) {
    await recordIntegrationOutcome(supabase, ctx.orgId, provider, null);
    return {
      ok: true,
      message: `${LEAD_LABEL[provider]} answered, but had no new enquiries in the window it covers.`,
    };
  }

  const waIds = result.leads.map((lead) => lead.waId);
  const { data: known } = await supabase
    .from("contacts")
    .select("wa_id")
    .eq("org_id", ctx.orgId)
    .in("wa_id", waIds);

  const alreadyHere = new Set((known ?? []).map((row) => row.wa_id));
  const fresh = result.leads.filter((lead) => !alreadyHere.has(lead.waId));

  let created = 0;
  let firstError: string | null = null;

  for (const lead of fresh) {
    const { error } = await supabase.from("contacts").insert({
      org_id: ctx.orgId,
      wa_id: lead.waId,
      name: lead.name,
      source: lead.source,
      lead_stage: "new",
      custom_fields: {
        ...(lead.email ? { email: lead.email } : {}),
        ...(lead.company ? { company: lead.company } : {}),
        ...(lead.note ? { enquiry: lead.note } : {}),
      },
    });

    if (error) firstError ??= error.message;
    else created += 1;
  }

  await recordIntegrationOutcome(supabase, ctx.orgId, provider, firstError);
  revalidatePath("/integrations");
  revalidatePath("/contacts");
  revalidatePath("/leads/board");

  const skipped = result.leads.length - fresh.length;
  return {
    ok: !firstError,
    ...(firstError
      ? { error: `${created} added, then: ${firstError}` }
      : {
          message:
            `${LEAD_LABEL[provider]}: ${created} new ${created === 1 ? "contact" : "contacts"}.` +
            (skipped > 0 ? ` ${skipped} already in your contacts, left untouched.` : ""),
        }),
  } as ActionResult;
}

// ---------------------------------------------------------------- lookup

/** Where a parcel is, by AWB number. */
export async function trackParcel(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();

  const awb = String(formData.get("awb") ?? "").trim();
  if (!awb) return { ok: false, error: "Enter an AWB number." };

  const supabase = await createClient();
  const stored = await loadIntegration(supabase, ctx.orgId, "shiprocket");
  if (!stored) return notConnected("Shiprocket");

  const result = await trackShipment(
    { email: stored.values.email ?? "", password: stored.values.password ?? "" },
    awb
  );

  if (!result.ok) return { ok: false, error: result.error };

  // The same sentence the notify path builds, rather than a second copy
  // of it that drifts — this one already forgot to tidy the date.
  return { ok: true, message: staffSummary(result.shipment) };
}

/** The Calendly links, so the right one can be pasted into a conversation. */
export async function listCalendlyLinks(): Promise<ActionResult> {
  const ctx = await requireOrg();

  const supabase = await createClient();
  const stored = await loadIntegration(supabase, ctx.orgId, "calendly");
  if (!stored) return notConnected("Calendly");

  const result = await fetchCalendlyEventTypes(stored.values.access_token ?? "");
  if (!result.ok) return { ok: false, error: result.error };

  const active = result.types.filter((type) => type.active);
  if (active.length === 0) {
    return { ok: false, error: "No active booking links on this Calendly account." };
  }

  return {
    ok: true,
    message: active
      .map((type) => `${type.name} (${type.durationMinutes} min) — ${type.schedulingUrl}`)
      .join("\n"),
  };
}

/**
 * Where an order's parcel is, and optionally telling the customer.
 *
 * trackParcel above answers for an AWB typed into a settings dialog,
 * which is not what "answer 'where is my order?' without leaving the
 * inbox" means. The AWB is already on the order and the conversation is
 * already there; this joins them up.
 *
 * Sending is opt-in per call rather than automatic: a courier scan is
 * not always news, and a customer messaged every time a parcel moves
 * between hubs stops reading any of them.
 */
export async function trackOrderShipment(
  formData: FormData
): Promise<ActionResult> {
  const ctx = await requireOrg();

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "No order selected." };
  const alsoSend = formData.get("send") !== null;

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("store_orders")
    .select("id, reference, awb, contact_id, connection_id")
    .eq("org_id", ctx.orgId)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "That order is not in this workspace." };
  if (!order.awb?.trim()) {
    return {
      ok: false,
      error: "This order has no AWB number yet. Add it under Shipping once Shiprocket has created the shipment.",
    };
  }

  const stored = await loadIntegration(supabase, ctx.orgId, "shiprocket");
  if (!stored) return notConnected("Shiprocket");

  const result = await trackShipment(
    { email: stored.values.email ?? "", password: stored.values.password ?? "" },
    order.awb.trim()
  );

  if (!result.ok) return { ok: false, error: result.error };

  const summary = staffSummary(result.shipment);
  if (!alsoSend) return { ok: true, message: summary };

  if (!order.contact_id) {
    return { ok: true, message: `${summary} — no contact on this order, so nothing was sent.` };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, last_inbound_at, contacts(wa_id)")
    .eq("org_id", ctx.orgId)
    .eq("contact_id", order.contact_id)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const waId = (conversation?.contacts as { wa_id?: string } | null)?.wa_id;
  if (!conversation || !waId) {
    return {
      ok: true,
      message: `${summary} — but there is no WhatsApp conversation with this customer, so nothing was sent. They have to write first.`,
    };
  }

  // The number chosen on the order wins, then the conversation's own.
  // With several numbers connected, "whichever thread this is in" is a
  // sender the operator cannot see or correct.
  const connection = await loadOrgConnection(supabase, ctx.orgId, {
    connectionId: order.connection_id,
    conversationId: conversation.id,
  });
  if (!connection) {
    return { ok: true, message: `${summary} — no active WhatsApp number to send from.` };
  }

  const sent = await sendAndLogText({
    supabase,
    connection,
    conversationId: conversation.id,
    toWaId: waId,
    body: customerMessage(result.shipment, { orderNumber: order.reference }),
    lastInboundAt: conversation.last_inbound_at,
  });

  revalidatePath("/commerce");
  revalidatePath("/inbox");

  if (!sent.ok) {
    return {
      ok: false,
      error: sent.outsideWindow
        ? `${summary} — but the customer last wrote more than 24 hours ago, so WhatsApp will not take a plain message. Wait for them to write, or send a template from Campaigns.`
        : (sent.error ?? "The update did not send."),
    };
  }

  return { ok: true, message: `Sent to the customer. ${summary}` };
}

// ------------------------------------------------ Shiprocket: two-way

/**
 * Pushes one of our orders to Shiprocket, and tells the customer.
 *
 * Pushed once: the returned shiprocket_order_id is stored, and a second
 * press updates our copy from theirs rather than creating a duplicate
 * order that would ship the same parcel twice.
 */
export async function pushOrderToShiprocket(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: "No order selected." };

  const supabase = await createClient();
  const stored = await loadIntegration(supabase, ctx.orgId, "shiprocket");
  if (!stored) return notConnected("Shiprocket");

  const credentials = {
    email: stored.values.email ?? "",
    password: stored.values.password ?? "",
  };

  const { data: order } = await supabase
    .from("store_orders")
    .select("*")
    .eq("org_id", ctx.orgId)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "That order is not in this workspace." };
  if (order.shiprocket_order_id) {
    return {
      ok: false,
      error: `This order is already on Shiprocket as ${order.shiprocket_order_id}. Use "Where is it?" to read its status.`,
    };
  }

  const { data: items } = await supabase
    .from("store_order_items")
    .select("name, quantity, unit_price_cents, retailer_id")
    .eq("order_id", orderId);

  // The pickup location is named on every order and Shiprocket keys on
  // its exact name, so it is read from the account rather than typed.
  const pickupName = String(formData.get("pickup_location") ?? "").trim();
  let pickup = pickupName;
  if (!pickup) {
    const locations = await listPickupLocations(credentials);
    if (!locations.ok) return { ok: false, error: locations.error };
    if (locations.locations.length === 0) {
      return {
        ok: false,
        error:
          "Shiprocket has no pickup location on this account. Add one in Shiprocket → Settings → Pickup Addresses, then try again.",
      };
    }
    pickup = locations.locations[0];
  }

  const built = buildShiprocketOrder(
    {
      reference: order.reference,
      createdAt: order.created_at,
      currency: order.currency,
      subtotalCents: Number(order.subtotal_cents ?? 0),
      totalCents: Number(order.total_cents ?? 0),
      shippingCents: Number(order.shipping_cents ?? 0),
      discountCents: Number(order.discount_cents ?? 0),
      paid: Boolean(order.paid_at),
      shipName: order.ship_name,
      shipPhone: order.ship_phone,
      shipAddress: order.ship_address,
      shipCity: order.ship_city,
      shipState: order.ship_state,
      shipPincode: order.ship_pincode,
      shipCountry: order.ship_country,
      shipEmail: order.ship_email,
      weightGrams: order.weight_grams,
      lengthCm: order.length_cm === null ? null : Number(order.length_cm),
      breadthCm: order.breadth_cm === null ? null : Number(order.breadth_cm),
      heightCm: order.height_cm === null ? null : Number(order.height_cm),
      items: (items ?? []).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPriceCents: Number(item.unit_price_cents ?? 0),
        sku: item.retailer_id,
      })),
    },
    pickup
  );

  if (!built.ok) return { ok: false, error: built.error };

  const created = await createShiprocketOrder(credentials, built.payload as unknown as Record<string, unknown>);
  if (!created.ok) return { ok: false, error: created.error };

  await supabase
    .from("store_orders")
    .update({
      shiprocket_order_id: created.created.shiprocketOrderId,
      shiprocket_shipment_id: created.created.shipmentId,
      awb: created.created.awb ?? order.awb,
      courier_name: created.created.courier ?? order.courier_name,
      shipped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  revalidatePath("/commerce");

  return {
    ok: true,
    message: created.created.awb
      ? `Sent to Shiprocket, AWB ${created.created.awb}. Press "Tell the customer" to let them know.`
      : `Sent to Shiprocket as order ${created.created.shiprocketOrderId}. A courier and AWB are assigned in Shiprocket — press Import once that is done and the number lands here.`,
  };
}

/**
 * Brings Shiprocket's own orders in, matching on our reference.
 *
 * Matching rather than importing blindly: an order raised in Shiprocket
 * against one of our references is the same order, and creating a second
 * copy of it here is how two systems stop agreeing about anything.
 */
export async function importShiprocketOrders(): Promise<ActionResult> {
  const ctx = await requireOrg();

  const supabase = await createClient();
  const stored = await loadIntegration(supabase, ctx.orgId, "shiprocket");
  if (!stored) return notConnected("Shiprocket");

  const remote = await listShiprocketOrders({
    email: stored.values.email ?? "",
    password: stored.values.password ?? "",
  });
  if (!remote.ok) return { ok: false, error: remote.error };
  if (remote.orders.length === 0) {
    return { ok: true, message: "Shiprocket has no orders on this account yet." };
  }

  const { data: ours } = await supabase
    .from("store_orders")
    .select("id, reference, awb, shiprocket_order_id")
    .eq("org_id", ctx.orgId)
    .limit(500);

  const byReference = new Map((ours ?? []).map((row) => [row.reference, row]));

  let updated = 0;
  let imported = 0;
  let unmatched = 0;

  for (const entry of remote.orders) {
    const mine = byReference.get(entry.reference);

    // Not in this workspace: bring it in rather than counting it as a
    // miss. An order raised in Shiprocket is still an order, and a
    // shipping screen that hides half of them is a screen you cannot
    // trust to be the whole picture.
    if (!mine) {
      const { error: insertError } = await supabase.from("store_orders").insert({
        org_id: ctx.orgId,
        reference: entry.reference,
        status: entry.awb ? "shipped" : "confirmed",
        currency: "INR",
        total_cents: entry.totalRupees ? Math.round(entry.totalRupees * 100) : 0,
        subtotal_cents: entry.totalRupees ? Math.round(entry.totalRupees * 100) : 0,
        ship_name: entry.customerName,
        ship_phone: entry.customerPhone,
        awb: entry.awb,
        courier_name: entry.courier,
        shiprocket_order_id: entry.shiprocketOrderId,
        notes: "Imported from Shiprocket.",
      });

      if (insertError) unmatched += 1;
      else imported += 1;
      continue;
    }

    // Only what Shiprocket is authoritative about. Our own totals and
    // status are not overwritten by theirs.
    const patch: {
      updated_at: string;
      awb?: string;
      courier_name?: string;
      shiprocket_order_id?: string;
    } = { updated_at: new Date().toISOString() };
    if (entry.awb && entry.awb !== mine.awb) patch.awb = entry.awb;
    if (entry.courier) patch.courier_name = entry.courier;
    if (!mine.shiprocket_order_id) patch.shiprocket_order_id = entry.shiprocketOrderId;

    if (Object.keys(patch).length > 1) {
      await supabase.from("store_orders").update(patch).eq("id", mine.id);
      updated += 1;
    }
  }

  revalidatePath("/commerce");

  revalidatePath("/shipments");

  const parts = [`Read ${remote.orders.length} order${remote.orders.length === 1 ? "" : "s"} from Shiprocket.`];
  if (imported > 0) parts.push(`${imported} brought in for the first time.`);
  if (updated > 0) parts.push(`${updated} updated with a tracking number or courier.`);
  if (unmatched > 0) parts.push(`${unmatched} could not be saved.`);
  if (imported === 0 && updated === 0) parts.push("Everything here already matches Shiprocket.");

  return { ok: true, message: parts.join(" ") };
}

/** Shared loader for the actions that need Shiprocket plus one order. */
async function shipmentContext(orgId: string, orderId: string) {
  const supabase = await createClient();

  const stored = await loadIntegration(supabase, orgId, "shiprocket");
  if (!stored) return { error: notConnected("Shiprocket").error! } as const;

  const { data: order } = await supabase
    .from("store_orders")
    .select(
      "id, reference, status, awb, contact_id, connection_id, shiprocket_order_id, shiprocket_shipment_id, label_url, invoice_url, pickup_scheduled_at, courier_name, tracking_url"
    )
    .eq("org_id", orgId)
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { error: "That order is not in this workspace." } as const;

  return {
    supabase,
    order,
    credentials: {
      email: stored.values.email ?? "",
      password: stored.values.password ?? "",
    },
  } as const;
}

/** Asks Shiprocket for a courier, which is what produces an AWB. */
export async function assignCourier(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  const found = await shipmentContext(ctx.orgId, String(formData.get("order_id") ?? "").trim());
  if ("error" in found) return { ok: false, error: found.error };

  const { supabase, order, credentials } = found;
  if (!order.shiprocket_shipment_id) {
    return { ok: false, error: "Send this order to Shiprocket first — there is no shipment yet." };
  }

  const result = await assignAwb(credentials, order.shiprocket_shipment_id);
  if (!result.ok) return { ok: false, error: result.error };

  await supabase
    .from("store_orders")
    .update({
      awb: result.awb,
      courier_name: result.courier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  revalidatePath("/shipments");
  revalidatePath("/commerce");
  return {
    ok: true,
    message: `${result.courier ?? "A courier"} assigned. AWB ${result.awb}.`,
  };
}

/**
 * The shipping label, and the invoice, as PDFs Shiprocket hosts.
 *
 * Kept once made. Regenerating on each press gives a different file
 * every time, which makes "the one already stuck on the box" an
 * unanswerable question.
 */
export async function makeShipmentDocument(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  const kind = String(formData.get("kind") ?? "") === "invoice" ? "invoice" : "label";
  const found = await shipmentContext(ctx.orgId, String(formData.get("order_id") ?? "").trim());
  if ("error" in found) return { ok: false, error: found.error };

  const { supabase, order, credentials } = found;

  const existing = kind === "label" ? order.label_url : order.invoice_url;
  if (existing) return { ok: true, message: existing };

  if (kind === "label") {
    if (!order.shiprocket_shipment_id || !order.awb) {
      return {
        ok: false,
        error: "A label needs a courier first — Shiprocket will not print one without an AWB.",
      };
    }
    const made = await generateLabel(credentials, order.shiprocket_shipment_id);
    if (!made.ok) return { ok: false, error: made.error };

    await supabase
      .from("store_orders")
      .update({ label_url: made.url, updated_at: new Date().toISOString() })
      .eq("id", order.id);

    revalidatePath("/shipments");
    return { ok: true, message: made.url };
  }

  if (!order.shiprocket_order_id) {
    return { ok: false, error: "Send this order to Shiprocket first." };
  }

  const made = await generateInvoice(credentials, order.shiprocket_order_id);
  if (!made.ok) return { ok: false, error: made.error };

  await supabase
    .from("store_orders")
    .update({ invoice_url: made.url, updated_at: new Date().toISOString() })
    .eq("id", order.id);

  revalidatePath("/shipments");
  return { ok: true, message: made.url };
}

/** Books the courier to collect. */
export async function bookPickup(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  const found = await shipmentContext(ctx.orgId, String(formData.get("order_id") ?? "").trim());
  if ("error" in found) return { ok: false, error: found.error };

  const { supabase, order, credentials } = found;
  if (!order.shiprocket_shipment_id || !order.awb) {
    return { ok: false, error: "Assign a courier before booking a pickup." };
  }

  const result = await requestPickup(credentials, order.shiprocket_shipment_id);
  if (!result.ok) return { ok: false, error: result.error };

  await supabase
    .from("store_orders")
    .update({
      pickup_scheduled_at: new Date().toISOString(),
      status: "shipped",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  revalidatePath("/shipments");
  revalidatePath("/commerce");
  return {
    ok: true,
    message: result.scheduledFor
      ? `Pickup booked for ${courierDate(result.scheduledFor)}.`
      : "Pickup booked. Shiprocket did not name a date — check the order there for the slot.",
  };
}

/**
 * Raises an order here and, optionally, on Shiprocket in the same breath.
 *
 * The two-step version — create in Commerce, then find it in Shipments
 * and push it — is the same work split across two screens, and the
 * second half is the half people forget. Everything Shiprocket needs is
 * asked for once, here.
 */
export async function createShipmentOrder(formData: FormData): Promise<ActionResult> {
  const ctx = await requireOrg();
  const supabase = await createClient();

  const text = (name: string): string | null =>
    String(formData.get(name) ?? "").trim() || null;
  const money = (name: string): number => {
    const value = Number(String(formData.get(name) ?? "").trim());
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
  };
  const digits = (name: string): number | null => {
    const value = Number(String(formData.get(name) ?? "").trim());
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  const reference =
    text("reference") ?? `SR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const itemName = text("item_name");
  const phone = text("ship_phone");

  if (!itemName) return { ok: false, error: "Name what is being shipped." };
  if (!phone) return { ok: false, error: "The customer's phone number is required." };

  const unitCents = money("item_price");
  const quantity = Math.max(1, Math.round(Number(formData.get("item_quantity") ?? 1) || 1));
  const shippingCents = money("shipping_charges");
  const subtotal = unitCents * quantity;

  // Matched to an existing contact by number so the order lands in the
  // conversation they are already in, rather than beside it.
  const waId = phone.replace(/\D/g, "");
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("wa_id", waId)
    .maybeSingle();

  const paid = formData.get("paid") !== null;

  const { data: created, error } = await supabase
    .from("store_orders")
    .insert({
      org_id: ctx.orgId,
      contact_id: contact?.id ?? null,
      reference,
      status: paid ? "paid" : "confirmed",
      currency: "INR",
      subtotal_cents: subtotal,
      shipping_cents: shippingCents,
      total_cents: subtotal + shippingCents,
      paid_at: paid ? new Date().toISOString() : null,
      ship_name: text("ship_name"),
      ship_phone: phone,
      ship_address: text("ship_address"),
      ship_city: text("ship_city"),
      ship_state: text("ship_state"),
      ship_pincode: text("ship_pincode"),
      ship_email: text("ship_email"),
      ship_country: "India",
      weight_grams: digits("weight_grams"),
      length_cm: digits("length_cm"),
      breadth_cm: digits("breadth_cm"),
      height_cm: digits("height_cm"),
      connection_id: text("connection_id"),
      notes: text("notes"),
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error:
        error.code === "23505"
          ? `An order with the reference ${reference} already exists. Use a different one.`
          : error.message,
    };
  }

  await supabase.from("store_order_items").insert({
    order_id: created.id,
    name: itemName,
    quantity,
    unit_price_cents: unitCents,
    currency: "INR",
    retailer_id: text("item_sku"),
  });

  revalidatePath("/shipments");
  revalidatePath("/commerce");

  const notes: string[] = [`Order ${reference} created.`];

  // Told at the moment it is placed, which is the update customers
  // actually want and the one nobody remembers to send by hand.
  if (formData.get("tell_customer") !== null && contact?.id) {
    const told = await tellCustomerOrderPlaced(supabase, ctx.orgId, created.id);
    notes.push(told);
  }

  if (formData.get("push_now") !== null) {
    const push = new FormData();
    push.set("order_id", created.id);
    const pushed = await pushOrderToShiprocket(push);
    notes.push(pushed.ok ? (pushed.message ?? "Sent to Shiprocket.") : `Not sent: ${pushed.error}`);
  }

  return { ok: true, message: notes.join(" ") };
}

/** The "we have your order" message, sent from the order's own number. */
async function tellCustomerOrderPlaced(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  orderId: string
): Promise<string> {
  const { data: order } = await supabase
    .from("store_orders")
    .select("reference, total_cents, currency, contact_id, connection_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order?.contact_id) return "No contact on the order, so nothing was sent.";

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, last_inbound_at, contacts(wa_id)")
    .eq("org_id", orgId)
    .eq("contact_id", order.contact_id)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const waId = (conversation?.contacts as { wa_id?: string } | null)?.wa_id;
  if (!conversation || !waId) {
    return "No WhatsApp conversation with this customer yet, so nothing was sent — they have to write first.";
  }

  const connection = await loadOrgConnection(supabase, orgId, {
    connectionId: order.connection_id,
    conversationId: conversation.id,
  });
  if (!connection) return "No active WhatsApp number to send from.";

  const amount = (Number(order.total_cents ?? 0) / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: order.currency || "INR",
    maximumFractionDigits: 0,
  });

  const sent = await sendAndLogText({
    supabase,
    connection,
    conversationId: conversation.id,
    toWaId: waId,
    body: `We have your order ${order.reference} for ${amount}. We will send you the tracking details as soon as it ships.`,
    lastInboundAt: conversation.last_inbound_at,
  });

  if (!sent.ok) {
    return sent.outsideWindow
      ? "The customer last wrote more than 24 hours ago, so WhatsApp would not take the confirmation."
      : `The confirmation did not send: ${sent.error}`;
  }
  return "Customer told on WhatsApp.";
}
