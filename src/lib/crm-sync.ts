import "server-only";

import { loadIntegrations } from "@/lib/integration-store";
import {
  CRM_PROVIDERS,
  CRM_RECORD_LABEL,
  crmContactFromRow,
  escapeSoql,
  hubspotProperties,
  isCrmProvider,
  salesforceLead,
  toE164,
  zohoLead,
  type CrmContact,
  type CrmProvider,
  type CrmRefs,
  type CrmSyncOutcome,
} from "@/lib/crm";
import type { RunnerClient } from "@/lib/whatsapp-send";

// The HTTP half of the CRM integration.
//
// Until now the three CRM entries in the catalogue stored credentials and
// did nothing with them — the card said so, which was honest but not much
// use. This pushes contacts for real.
//
// One pattern for all three, because all three need it: find the record by
// phone number, then update it or create it. None of them treats a phone
// number as a unique key on its own, so a blind create on every sync would
// fill the CRM with duplicates of the same customer.

const TIMEOUT_MS = 12_000;

export interface CrmConnection {
  provider: CrmProvider;
  credentials: Record<string, string>;
  config: Record<string, string>;
}

/** What a push did, before it is written to the log. */
type PushResult =
  | { status: "created" | "updated"; externalId: string }
  | { status: "failed"; error: string };

// --------------------------------------------------------------- transport

/**
 * fetch with a deadline and no thrown exceptions.
 *
 * A CRM that hangs must not hold a webhook open: Meta redelivers anything it
 * does not get a prompt 200 for, and a redelivered webhook is a second
 * message to the customer.
 */
async function call(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; body: unknown; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return {
      ok: response.ok,
      status: response.status,
      body,
      error: response.ok ? null : describeError(response.status, body),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `No answer within ${TIMEOUT_MS / 1000}s`
        : error instanceof Error
          ? error.message
          : "Request failed";
    return { ok: false, status: 0, body: null, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The provider's own wording where there is any.
 *
 * All three bury the useful sentence somewhere different, and the HTTP
 * status alone ("400 Bad Request") tells an operator nothing about which
 * field their CRM refused.
 */
function describeError(status: number, body: unknown): string {
  const seen = new Set<string>();
  const collect = (value: unknown, depth = 0): void => {
    if (depth > 4 || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of ["message", "error_description", "details", "errorMessage", "api_name"]) {
      const found = record[key];
      if (typeof found === "string" && found.trim()) seen.add(found.trim());
    }
    for (const entry of Object.values(record)) collect(entry, depth + 1);
  };
  collect(body);

  const detail = [...seen].slice(0, 2).join(" — ");
  if (detail) return `${detail} (HTTP ${status})`;
  if (typeof body === "string" && body.trim()) return `${body.trim().slice(0, 200)} (HTTP ${status})`;
  return `HTTP ${status}`;
}

// -------------------------------------------------------------- HubSpot

const HUBSPOT_BASE = "https://api.hubapi.com";

function hubspotHeaders(credentials: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.access_token ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function hubspotFindByPhone(
  connection: CrmConnection,
  phone: string
): Promise<string | null> {
  const result = await call(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
    method: "POST",
    headers: hubspotHeaders(connection.credentials),
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: "phone", operator: "EQ", value: phone }] },
      ],
      properties: ["phone"],
      limit: 1,
    }),
  });

  if (!result.ok) return null;
  const results = (result.body as { results?: Array<{ id?: string }> } | null)?.results;
  return results?.[0]?.id ?? null;
}

async function hubspotPush(connection: CrmConnection, contact: CrmContact): Promise<PushResult> {
  const payload = hubspotProperties(contact);
  const existing = await hubspotFindByPhone(connection, toE164(contact.waId));

  const result = existing
    ? await call(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${existing}`, {
        method: "PATCH",
        headers: hubspotHeaders(connection.credentials),
        body: JSON.stringify(payload),
      })
    : await call(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
        method: "POST",
        headers: hubspotHeaders(connection.credentials),
        body: JSON.stringify(payload),
      });

  if (!result.ok) return { status: "failed", error: result.error ?? "HubSpot refused the record" };

  const id = (result.body as { id?: string } | null)?.id ?? existing;
  if (!id) return { status: "failed", error: "HubSpot accepted the record but returned no id" };
  return { status: existing ? "updated" : "created", externalId: id };
}

async function hubspotTest(connection: CrmConnection): Promise<string | null> {
  const result = await call(`${HUBSPOT_BASE}/crm/v3/objects/contacts?limit=1`, {
    headers: hubspotHeaders(connection.credentials),
  });
  return result.ok ? null : (result.error ?? "HubSpot rejected the token");
}

// ----------------------------------------------------------------- Zoho

/**
 * Zoho is regional and the regions are not interchangeable: a token minted
 * in the Indian data centre is rejected outright by the American one, with
 * an "invalid code" that reads like a typo in the credentials.
 */
const ZOHO_REGIONS: Record<string, { accounts: string; api: string }> = {
  com: { accounts: "https://accounts.zoho.com", api: "https://www.zohoapis.com" },
  in: { accounts: "https://accounts.zoho.in", api: "https://www.zohoapis.in" },
  eu: { accounts: "https://accounts.zoho.eu", api: "https://www.zohoapis.eu" },
  "com.au": { accounts: "https://accounts.zoho.com.au", api: "https://www.zohoapis.com.au" },
  jp: { accounts: "https://accounts.zoho.jp", api: "https://www.zohoapis.jp" },
};

function zohoRegion(config: Record<string, string>) {
  const key = (config.data_center ?? "in").trim().toLowerCase();
  return ZOHO_REGIONS[key] ?? ZOHO_REGIONS.in;
}

/**
 * Zoho's refresh tokens do not expire but its access tokens last an hour,
 * so every call starts by trading one for the other. Not cached: a sync runs
 * for a second or two and the extra round trip is cheaper than holding a
 * token across requests in a serverless process that may not be the same one
 * next time.
 */
async function zohoAccessToken(
  connection: CrmConnection
): Promise<{ token: string } | { error: string }> {
  const region = zohoRegion(connection.config);
  const params = new URLSearchParams({
    refresh_token: connection.credentials.refresh_token ?? "",
    client_id: connection.config.client_id ?? connection.credentials.client_id ?? "",
    client_secret: connection.credentials.client_secret ?? "",
    grant_type: "refresh_token",
  });

  const result = await call(`${region.accounts}/oauth/v2/token?${params}`, { method: "POST" });
  const body = result.body as { access_token?: string; error?: string } | null;

  // Zoho answers 200 with {"error":"invalid_code"} rather than a 4xx, so the
  // HTTP status cannot be trusted on its own here.
  if (body?.access_token) return { token: body.access_token };
  return {
    error:
      body?.error === "invalid_client"
        ? "Zoho rejected the client ID or secret."
        : body?.error === "invalid_code"
          ? `Zoho rejected the refresh token. Check it was generated in the ${
              connection.config.data_center ?? "in"
            } data centre.`
          : (result.error ?? "Zoho would not issue an access token."),
  };
}

async function zohoPush(connection: CrmConnection, contact: CrmContact): Promise<PushResult> {
  const auth = await zohoAccessToken(connection);
  if ("error" in auth) return { status: "failed", error: auth.error };

  const region = zohoRegion(connection.config);
  // Zoho has a real upsert keyed on the fields we nominate, so unlike the
  // other two this is one call and the deduplication is server-side.
  const result = await call(`${region.api}/crm/v6/Leads/upsert`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(zohoLead(contact)),
  });

  const entry = (result.body as { data?: Array<{ code?: string; action?: string; details?: { id?: string } }> } | null)
    ?.data?.[0];

  if (!result.ok || (entry?.code && entry.code !== "SUCCESS")) {
    return { status: "failed", error: result.error ?? `Zoho returned ${entry?.code ?? "no result"}` };
  }

  const id = entry?.details?.id;
  if (!id) return { status: "failed", error: "Zoho accepted the lead but returned no id" };
  return { status: entry?.action === "update" ? "updated" : "created", externalId: id };
}

async function zohoTest(connection: CrmConnection): Promise<string | null> {
  const auth = await zohoAccessToken(connection);
  if ("error" in auth) return auth.error;

  const region = zohoRegion(connection.config);
  const result = await call(`${region.api}/crm/v6/settings/modules`, {
    headers: { Authorization: `Zoho-oauthtoken ${auth.token}` },
  });
  return result.ok ? null : (result.error ?? "Zoho rejected the token");
}

// ----------------------------------------------------------- Salesforce

const SALESFORCE_API = "v60.0";

/**
 * The client credentials flow, which is the only one that works without a
 * person sitting at a browser. It has to be enabled on the Connected App
 * ("Enable Client Credentials Flow") and given a run-as user; without that
 * Salesforce answers with an unhelpful invalid_grant.
 */
async function salesforceAccessToken(
  connection: CrmConnection
): Promise<{ token: string; instance: string } | { error: string }> {
  const instance = (connection.config.instance_url ?? "").replace(/\/+$/, "");
  if (!instance) return { error: "No Salesforce instance URL stored." };

  const result = await call(`${instance}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: connection.config.client_id ?? "",
      client_secret: connection.credentials.client_secret ?? "",
    }).toString(),
  });

  const body = result.body as
    | { access_token?: string; instance_url?: string; error_description?: string }
    | null;

  if (body?.access_token) {
    return { token: body.access_token, instance: body.instance_url ?? instance };
  }
  return {
    error:
      body?.error_description ??
      result.error ??
      "Salesforce would not issue a token. Check that the Connected App has the client credentials flow enabled and a run-as user.",
  };
}

async function salesforcePush(connection: CrmConnection, contact: CrmContact): Promise<PushResult> {
  const auth = await salesforceAccessToken(connection);
  if ("error" in auth) return { status: "failed", error: auth.error };

  const headers = {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": "application/json",
  };
  const phone = toE164(contact.waId);

  const found = await call(
    `${auth.instance}/services/data/${SALESFORCE_API}/query?q=${encodeURIComponent(
      `SELECT Id FROM Lead WHERE Phone = '${escapeSoql(phone)}' OR MobilePhone = '${escapeSoql(
        phone
      )}' LIMIT 1`
    )}`,
    { headers }
  );
  const existing =
    (found.body as { records?: Array<{ Id?: string }> } | null)?.records?.[0]?.Id ?? null;

  const record = salesforceLead(contact);
  const result = existing
    ? await call(`${auth.instance}/services/data/${SALESFORCE_API}/sobjects/Lead/${existing}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(record),
      })
    : await call(`${auth.instance}/services/data/${SALESFORCE_API}/sobjects/Lead`, {
        method: "POST",
        headers,
        body: JSON.stringify(record),
      });

  if (!result.ok) {
    return { status: "failed", error: result.error ?? "Salesforce refused the lead" };
  }

  // A PATCH that succeeds returns 204 and no body, so the id we already have
  // is the only one there is.
  const id = (result.body as { id?: string } | null)?.id ?? existing;
  if (!id) return { status: "failed", error: "Salesforce accepted the lead but returned no id" };
  return { status: existing ? "updated" : "created", externalId: id };
}

async function salesforceTest(connection: CrmConnection): Promise<string | null> {
  const auth = await salesforceAccessToken(connection);
  if ("error" in auth) return auth.error;

  const result = await call(`${auth.instance}/services/data/${SALESFORCE_API}/sobjects/Lead/describe`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  return result.ok ? null : (result.error ?? "Salesforce rejected the token");
}

// ------------------------------------------------------------- dispatch

const PUSH: Record<CrmProvider, (c: CrmConnection, contact: CrmContact) => Promise<PushResult>> = {
  hubspot: hubspotPush,
  "zoho-crm": zohoPush,
  salesforce: salesforcePush,
};

const TEST: Record<CrmProvider, (c: CrmConnection) => Promise<string | null>> = {
  hubspot: hubspotTest,
  "zoho-crm": zohoTest,
  salesforce: salesforceTest,
};

/** Checks a connection is usable. Returns null when it is, else why not. */
export function testCrmConnection(connection: CrmConnection): Promise<string | null> {
  return TEST[connection.provider](connection);
}

// -------------------------------------------------------------- loading

/**
 * The org's connected CRMs.
 *
 * A row whose credentials will not decrypt is dropped by the loader rather
 * than thrown on: one bad connection must not stop the others syncing, and
 * the sync log records the reason per contact anyway.
 */
export async function loadCrmConnections(
  supabase: RunnerClient,
  orgId: string,
  only?: CrmProvider
): Promise<CrmConnection[]> {
  const stored = await loadIntegrations(supabase, orgId, only ? [only] : CRM_PROVIDERS);

  const connections: CrmConnection[] = [];
  for (const entry of stored) {
    if (!isCrmProvider(entry.provider)) continue;
    connections.push({
      provider: entry.provider,
      credentials: entry.credentials,
      config: entry.config,
    });
  }
  return connections;
}

const CONTACT_COLUMNS =
  "id, wa_id, name, tags, lead_stage, lead_score, source, custom_fields, crm_refs";

interface ContactRow {
  id: string;
  wa_id: string;
  name: string | null;
  tags: string[] | null;
  lead_stage: string | null;
  lead_score: number | null;
  source: string | null;
  custom_fields: Record<string, unknown> | null;
  crm_refs: CrmRefs | null;
}

// -------------------------------------------------------------- syncing

/**
 * Pushes one contact to every connected CRM.
 *
 * Never throws. Called from the webhook path, where an exception would cost
 * the customer their reply, so every failure ends up in crm_sync_log instead
 * and the caller carries on.
 */
export async function syncContact(
  supabase: RunnerClient,
  orgId: string,
  contactId: string,
  connections?: CrmConnection[]
): Promise<CrmSyncOutcome[]> {
  try {
    const crms = connections ?? (await loadCrmConnections(supabase, orgId));
    if (crms.length === 0) return [];

    const { data } = await supabase
      .from("contacts")
      .select(CONTACT_COLUMNS)
      .eq("org_id", orgId)
      .eq("id", contactId)
      .maybeSingle();

    if (!data) return [];
    return await pushOne(supabase, orgId, data as ContactRow, crms);
  } catch (error) {
    console.error("CRM sync crashed", error);
    return [];
  }
}

async function pushOne(
  supabase: RunnerClient,
  orgId: string,
  row: ContactRow,
  crms: CrmConnection[]
): Promise<CrmSyncOutcome[]> {
  const contact = crmContactFromRow(row);
  const refs: CrmRefs = { ...(row.crm_refs ?? {}) };
  const outcomes: CrmSyncOutcome[] = [];

  // Sequential on purpose. Every one of these APIs is rate limited per
  // account, and a burst of parallel writes from a bulk sync is the fastest
  // way to have the whole connection throttled.
  for (const connection of crms) {
    const result = await PUSH[connection.provider](connection, contact);
    if (result.status === "failed") {
      outcomes.push({
        provider: connection.provider,
        contactId: row.id,
        status: "failed",
        externalId: null,
        error: result.error,
      });
      continue;
    }

    refs[connection.provider] = result.externalId;
    outcomes.push({
      provider: connection.provider,
      contactId: row.id,
      status: result.status,
      externalId: result.externalId,
      error: null,
    });
  }

  const changed = outcomes.some((outcome) => outcome.externalId);
  if (changed) {
    await supabase
      .from("contacts")
      .update({ crm_refs: refs, crm_synced_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  await writeLog(supabase, orgId, outcomes);
  return outcomes;
}

async function writeLog(
  supabase: RunnerClient,
  orgId: string,
  outcomes: CrmSyncOutcome[]
): Promise<void> {
  if (outcomes.length === 0) return;
  const { error } = await supabase.from("crm_sync_log").insert(
    outcomes.map((outcome) => ({
      org_id: orgId,
      provider: outcome.provider,
      contact_id: outcome.contactId,
      status: outcome.status,
      external_id: outcome.externalId,
      error: outcome.error,
    }))
  );
  // The log is a diary, not the work. Losing an entry must not fail a sync
  // that actually reached the CRM.
  if (error) console.error("Could not write the CRM sync log", error);
}

export interface BulkSyncResult {
  attempted: number;
  created: number;
  updated: number;
  failed: number;
  /** The first thing that went wrong, for the message on screen. */
  firstError: string | null;
}

/** How many contacts one manual sync will push before stopping. */
export const BULK_SYNC_LIMIT = 200;

/**
 * Pushes the org's contacts, oldest unsynced first.
 *
 * Capped, and it says so: a serverless request has a wall clock and three
 * sequential HTTP calls per contact adds up. Running it again picks up where
 * it left off, because contacts already carrying a ref for this provider go
 * to the back of the queue.
 */
export async function syncAllContacts(
  supabase: RunnerClient,
  orgId: string,
  provider?: CrmProvider,
  limit = BULK_SYNC_LIMIT
): Promise<BulkSyncResult> {
  const empty: BulkSyncResult = {
    attempted: 0,
    created: 0,
    updated: 0,
    failed: 0,
    firstError: null,
  };

  const crms = await loadCrmConnections(supabase, orgId, provider);
  if (crms.length === 0) {
    return { ...empty, firstError: "No CRM is connected to this workspace." };
  }

  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("org_id", orgId)
    // Nulls first, so contacts that have never reached the CRM go before
    // ones that are only out of date.
    .order("crm_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) return { ...empty, firstError: error.message };

  const result = { ...empty };
  for (const row of (data ?? []) as ContactRow[]) {
    const outcomes = await pushOne(supabase, orgId, row, crms);
    for (const outcome of outcomes) {
      result.attempted += 1;
      if (outcome.status === "created") result.created += 1;
      else if (outcome.status === "updated") result.updated += 1;
      else if (outcome.status === "failed") {
        result.failed += 1;
        result.firstError ??= `${CRM_RECORD_LABEL[outcome.provider]}: ${outcome.error}`;
      }
    }
  }

  return result;
}
