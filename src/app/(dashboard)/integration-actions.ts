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
import { fetchCalendlyEventTypes, testShiprocket, trackShipment } from "@/lib/misc-providers";
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

  const { shipment } = result;
  return {
    ok: true,
    message: [
      `${shipment.awb}: ${shipment.status}`,
      shipment.courier ? `via ${shipment.courier}` : null,
      shipment.expectedDelivery ? `due ${shipment.expectedDelivery}` : null,
      shipment.lastUpdate,
    ]
      .filter(Boolean)
      .join(" · "),
  };
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
