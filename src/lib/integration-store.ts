import "server-only";

import { decryptToken } from "@/lib/crypto";
import type { RunnerClient } from "@/lib/whatsapp-send";

// Reading a stored integration back out.
//
// Three modules were each doing this separately — select the row, decrypt
// credentials_encrypted, parse it, merge in config — and each was making the
// same decision about a row whose credentials will not decrypt. One place
// now, with one answer: a bad row is absent rather than an exception, because
// this is called from webhook paths where a throw is a dropped message.
//
// The split between `credentials` and `config` is where the form put them:
// a password-typed field is encrypted, everything else stays queryable. Both
// are handed back merged as well, since a caller usually just wants a value
// and does not care which side it came from.

export interface StoredIntegration {
  provider: string;
  /** The encrypted half, decrypted. */
  credentials: Record<string, string>;
  /** The plain half: shop domains, client ids, modes. */
  config: Record<string, string>;
  status: string;
  lastError: string | null;
  /** config with credentials laid over it, for a caller that wants a value. */
  values: Record<string, string>;
}

/**
 * One integration, or null.
 *
 * Null covers all four ways this legitimately has nothing to give: no row,
 * the row is disconnected, the query failed because the table is missing, or
 * the credentials will not decrypt because TOKEN_ENCRYPTION_KEY has changed.
 * Only the last is a real problem, and it is one no caller can do anything
 * about mid-request.
 */
export async function loadIntegration(
  supabase: RunnerClient,
  orgId: string,
  provider: string,
  options: { requireConnected?: boolean } = {}
): Promise<StoredIntegration | null> {
  const { data, error } = await supabase
    .from("org_integrations")
    .select("provider, credentials_encrypted, config, status, last_error")
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();

  if (error || !data) return null;
  if (options.requireConnected !== false && data.status !== "connected") return null;

  return hydrate(data);
}

/** Several integrations at once, skipping any that cannot be read. */
export async function loadIntegrations(
  supabase: RunnerClient,
  orgId: string,
  providers: string[]
): Promise<StoredIntegration[]> {
  if (providers.length === 0) return [];

  const { data, error } = await supabase
    .from("org_integrations")
    .select("provider, credentials_encrypted, config, status, last_error")
    .eq("org_id", orgId)
    .eq("status", "connected")
    .in("provider", providers);

  if (error || !data) return [];

  const loaded: StoredIntegration[] = [];
  for (const row of data) {
    const entry = hydrate(row);
    if (entry) loaded.push(entry);
  }
  return loaded;
}

function hydrate(row: {
  provider: string;
  credentials_encrypted: string | null;
  config: Record<string, string> | null;
  status: string;
  last_error: string | null;
}): StoredIntegration | null {
  let credentials: Record<string, string> = {};

  if (row.credentials_encrypted) {
    try {
      const parsed = JSON.parse(decryptToken(row.credentials_encrypted));
      // A row that decrypts to something other than an object is corrupt,
      // and pretending otherwise would hand a caller `undefined` where it
      // expects a secret.
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      credentials = parsed as Record<string, string>;
    } catch {
      return null;
    }
  }

  const config = row.config ?? {};
  return {
    provider: row.provider,
    credentials,
    config,
    status: row.status,
    lastError: row.last_error,
    values: { ...config, ...credentials },
  };
}

/**
 * Records what the last attempt against a provider did.
 *
 * Written where the Integrations card can read it, so a connection that has
 * stopped working stops looking identical to one nobody has used yet.
 */
export async function recordIntegrationOutcome(
  supabase: RunnerClient,
  orgId: string,
  provider: string,
  failure: string | null
): Promise<void> {
  const { error } = await supabase
    .from("org_integrations")
    .update({
      last_error: failure ? failure.slice(0, 1000) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("provider", provider);

  if (error) console.error("Could not record the integration outcome", error);
}
