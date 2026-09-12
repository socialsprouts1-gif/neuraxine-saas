import type { ReactNode } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/org";
import { INTEGRATIONS, integrationBySlug } from "@/lib/integrations";
import { CRM_PROVIDERS } from "@/lib/crm";
import { LEAD_PROVIDERS, PAYMENT_PROVIDERS, STORE_PROVIDERS } from "@/lib/provider-meta";
import IntegrationsBrowser from "./IntegrationsBrowser";
import type { CardData } from "./IntegrationCard";
import WhatsAppCard from "./WhatsAppCard";
import CrmPanel from "./CrmPanel";
import ProviderPanel from "./ProviderPanel";
import WebhooksPanel from "./WebhooksPanel";
import ApiPanel from "./ApiPanel";
import type { OutgoingWebhook } from "@/types/portal";

// WhatsApp is not in the catalogue — it has its own connection lifecycle,
// its own table and its own Embedded Signup flow — but it is the first thing
// anyone comes here to connect, so it leads the grid as a card like the rest.
const WHATSAPP_CARD = {
  slug: "whatsapp",
  name: "WhatsApp Business",
  description:
    "Connect with customers on their favourite messaging app. Send updates, support messages and campaigns from a number on your own Meta WhatsApp Business Account — no reseller in the middle.",
  note:
    "The number must not be active on the WhatsApp or WhatsApp Business app. Meta allows a number on the app or the Cloud API, never both — moving one over deletes its chat history on the phone.",
  brand: "#25D366",
  alwaysOn: false,
} as const;

export default async function IntegrationsPage({
  searchParams,
}: {
  // The Embedded Signup callback reports its outcome by redirecting here.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId, role } = await requireFeature("integrations");
  const supabase = await createClient();
  const canManage = role === "owner" || role === "admin";

  const query = await searchParams;
  const one = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const signup = {
    connected: one("wa_connected"),
    error: one("wa_error"),
    note: one("wa_note"),
  };

  const [{ data: connections }, { data: webhooks }, waba, crm] = await Promise.all([
    // credentials_encrypted is deliberately not selected — this page never
    // needs the secret, and not fetching it keeps it out of the RSC payload.
    supabase
      .from("org_integrations")
      .select("provider, status, connected_at, last_error")
      .eq("org_id", orgId),
    supabase.from("outgoing_webhooks").select("*").eq("org_id", orgId).order("created_at"),
    // access_token_encrypted is likewise never selected here.
    loadWabaConnections(supabase, orgId),
    loadCrmStatus(supabase, orgId),
  ]);

  const wabaConnections = waba.data ?? [];
  const connectedSet = new Set(
    (connections ?? []).filter((row) => row.status === "connected").map((row) => row.provider)
  );

  const host = (await headers()).get("host") ?? "your-domain";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const apiBase = `${proto}://${host}/api`;

  const cards: CardData[] = [
    {
      ...WHATSAPP_CARD,
      // A failed query returns no rows, which renders identically to having
      // no connection. Treat it as not connected on the tile and let the
      // panel say what actually happened.
      connected: wabaConnections.length > 0,
    },
    ...INTEGRATIONS.map((def) => ({
      slug: def.slug,
      name: def.name,
      description: def.description,
      note: def.note,
      brand: def.brand,
      connected: connectedSet.has(def.slug),
      // Nothing to connect, only settings to adjust.
      alwaysOn: def.fields.length === 0,
    })),
  ];

  // One panel per CRM in the catalogue, so a connected CRM opens on its sync
  // state rather than a credential form it has already been given.
  const crmPanels: Record<string, ReactNode> = {};
  for (const provider of CRM_PROVIDERS) {
    const def = integrationBySlug(provider);
    if (!def) continue;
    const row = (connections ?? []).find((entry) => entry.provider === provider);
    crmPanels[provider] = (
      <CrmPanel
        def={def}
        provider={provider}
        connected={row?.status === "connected"}
        canManage={canManage}
        lastError={row?.last_error ?? null}
        syncedCount={crm.synced}
        totalCount={crm.total}
        lastSyncedAt={crm.lastSyncedAt}
        recentFailure={crm.lastFailure[provider] ?? null}
      />
    );
  }

  // Everything else that makes a real call: gateways, shops, lead sources,
  // and the three one-trick providers. Each gets a Test button and its own
  // operation, so a connected card is never a card that does nothing.
  const OTHER_PROVIDERS = [
    ...PAYMENT_PROVIDERS,
    ...STORE_PROVIDERS,
    ...LEAD_PROVIDERS,
    "google-calendar",
    "shiprocket",
    "calendly",
  ];

  for (const provider of OTHER_PROVIDERS) {
    const def = integrationBySlug(provider);
    if (!def) continue;
    const row = (connections ?? []).find((entry) => entry.provider === provider);
    crmPanels[provider] = (
      <ProviderPanel
        def={def}
        connected={row?.status === "connected"}
        canManage={canManage}
        lastError={row?.last_error ?? null}
        // Only the gateways have a webhook to receive, and only they need
        // the URL spelled out.
        webhookUrl={
          (PAYMENT_PROVIDERS as string[]).includes(provider)
            ? `${apiBase}/webhooks/payments/${provider}`
            : null
        }
      />
    );
  }

  return (
    <div className="p-6 md:p-8">
      <IntegrationsBrowser
        cards={cards}
        canManage={canManage}
        // Land on the WhatsApp panel when Meta has just redirected back, so
        // the outcome of the signup is the first thing on screen.
        initialOpen={signup.connected || signup.error ? "whatsapp" : null}
        panels={{
          whatsapp: (
            <WhatsAppCard
              connections={wabaConnections}
              webhookUrl={`${apiBase}/webhooks/whatsapp`}
              canManage={canManage}
              loadError={waba.error?.message ?? null}
              // Connections loaded, but without health tracking. Say so
              // quietly rather than letting the banner's absence read as
              // "all fine".
              healthUnavailable={waba.degraded}
              signup={signup}
            />
          ),
          webhooks: (
            <WebhooksPanel
              webhooks={(webhooks ?? []) as OutgoingWebhook[]}
              canManage={canManage}
            />
          ),
          api: <ApiPanel apiBase={apiBase} />,
          ...crmPanels,
        }}
      />
    </div>
  );
}

/**
 * Connections, tolerating a database that has not run the latest migration.
 *
 * The health columns are a nicety; the connection itself is what the operator
 * needs to see and act on. Selecting both in one shot meant a pending
 * migration took the whole card down — including the controls for fixing it —
 * so fall back to the columns that have always existed and lose only the
 * health banner.
 */
async function loadWabaConnections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
) {
  const BASE =
    "id, waba_id, phone_number_id, meta_app_id, webhook_verify_token, status, display_phone_number, verified_name, label, is_default";

  const full = await supabase
    .from("waba_connections")
    .select(`${BASE}, last_error, last_error_at`)
    .eq("org_id", orgId)
    .order("created_at");

  if (!full.error) return { data: full.data, error: null, degraded: false };

  const base = await supabase
    .from("waba_connections")
    .select(BASE)
    .eq("org_id", orgId)
    .order("created_at");

  if (base.error) return { data: null, error: base.error, degraded: false };

  return {
    data: base.data.map((row) => ({ ...row, last_error: null, last_error_at: null })),
    // Not an error the operator has to act on before using the page, but
    // worth naming so the missing banner is explained rather than mysterious.
    error: null,
    degraded: true,
  };
}

/**
 * How much of the contact book has reached a CRM, and what last went wrong.
 *
 * "Synced" is counted from contacts.crm_synced_at rather than per provider:
 * the timestamp is a column and a plain count, where "does this contact have
 * a HubSpot id" is a key lookup inside a jsonb column that PostgREST cannot
 * express reliably for a slug with a hyphen in it. A workspace with two CRMs
 * connected at once would see the same number on both cards, which is worth
 * it for a count that is always right rather than sometimes silently zero.
 *
 * Tolerates a database that has not run the CRM migration: the columns are
 * new, and losing the counts is better than losing the whole Integrations
 * page, which is where the operator would go to fix it.
 */
async function loadCrmStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<{
  total: number;
  synced: number;
  lastFailure: Record<string, string>;
  lastSyncedAt: string | null;
}> {
  const empty = { total: 0, synced: 0, lastFailure: {}, lastSyncedAt: null };

  const total = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  if (total.error) return empty;

  const synced = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .not("crm_synced_at", "is", null);

  const recent = await supabase
    .from("contacts")
    .select("crm_synced_at")
    .eq("org_id", orgId)
    .not("crm_synced_at", "is", null)
    .order("crm_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const failures = await supabase
    .from("crm_sync_log")
    .select("provider, error, created_at")
    .eq("org_id", orgId)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(30);

  const lastFailure: Record<string, string> = {};
  for (const row of failures.data ?? []) {
    // Ordered newest first, so the first one seen for a provider is the one
    // to show and the rest are history.
    if (row.error && !lastFailure[row.provider]) lastFailure[row.provider] = row.error;
  }

  return {
    total: total.count ?? 0,
    synced: synced.error ? 0 : (synced.count ?? 0),
    lastFailure,
    lastSyncedAt: recent.error ? null : (recent.data?.crm_synced_at ?? null),
  };
}
