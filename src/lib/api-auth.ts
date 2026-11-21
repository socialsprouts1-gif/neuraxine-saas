import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Proving which workspace an HTTP request belongs to.
//
// The keys existed before this did. They were created, hashed and shown
// once, listed on a screen with a revoke button — and no route on the
// whole platform accepted one. The API Endpoints page said so in small
// print at the bottom. A key that authenticates nothing is a worse thing
// to ship than no key at all, because somebody has already pasted it
// into their code and believes they are connected.
//
// So: one function, used by every public endpoint that is driven from
// outside.

export interface ApiCaller {
  orgId: string;
  keyId: string;
  /** For the log and for naming the caller in an error. */
  keyName: string;
}

export type ApiAuth = ApiCaller | { error: string; status: 401 | 403 };

const PREFIX = "nc_live_";

/**
 * The key out of the request.
 *
 * Authorization: Bearer first, because that is what an HTTP client does
 * by default. X-Api-Key second, because a surprising number of no-code
 * tools cannot set an Authorization header at all, and telling those
 * users "use a real HTTP client" is telling them not to integrate.
 */
export function keyFrom(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();

  return (request.headers.get("x-api-key") ?? "").trim();
}

/**
 * Which workspace is calling, or why it cannot be established.
 *
 * Never says which of the two it was. "No such key" and "that key is
 * revoked" are the same sentence to a caller, because the difference is
 * only useful to somebody guessing keys.
 */
export async function authenticate(request: Request): Promise<ApiAuth> {
  const key = keyFrom(request);

  if (!key) {
    return {
      error:
        "No API key. Send it as an Authorization: Bearer header, or as X-Api-Key if your tool cannot set that one.",
      status: 401,
    };
  }

  if (!key.startsWith(PREFIX)) {
    return { error: `That is not an API key — they begin with ${PREFIX}.`, status: 401 };
  }

  const hash = createHash("sha256").update(key).digest("hex");

  try {
    const admin = createAdminClient();

    // Looked up by prefix and compared in constant time, rather than
    // looked up by hash. Both work; this one leaves the comparison in
    // our hands rather than the database's, where the timing of an index
    // lookup is nobody's to reason about.
    const { data: rows } = await admin
      .from("api_keys")
      .select("id, org_id, name, key_hash, revoked_at")
      .eq("key_prefix", key.slice(0, 12))
      .limit(20);

    const match = (rows ?? []).find((row) => {
      if (row.revoked_at) return false;
      const stored = Buffer.from(row.key_hash ?? "", "utf8");
      const given = Buffer.from(hash, "utf8");
      return stored.length === given.length && timingSafeEqual(stored, given);
    });

    if (!match) return { error: "That API key is not valid.", status: 401 };

    // Stamped, not awaited. The caller is waiting on the real work, and
    // a slow write here would be charged to every request they make.
    void admin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", match.id)
      .then(() => undefined);

    return { orgId: match.org_id, keyId: match.id, keyName: match.name ?? "API key" };
  } catch {
    return { error: "The key could not be checked just now.", status: 403 };
  }
}

export function isAuthed(result: ApiAuth): result is ApiCaller {
  return "orgId" in result;
}
