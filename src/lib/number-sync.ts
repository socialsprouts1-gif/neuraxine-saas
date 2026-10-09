import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { decryptToken } from "@/lib/crypto";
import { getPhoneNumber } from "@/lib/meta-whatsapp";
import { needsNumberSync, type SyncCandidate } from "@/lib/number-identity";

// Filling in numbers Meta was never asked for.
//
// Embedded Signup had the display number in hand and stored only the ids,
// so workspaces carry rows whose sole identifier is Meta's
// phone_number_id. That is fixed at the source now, but the rows already
// saved would stay unreadable until someone found the Refresh button on
// /numbers — a button you only look for if you already know what is
// wrong. Asking Meta here heals them on the next page view instead.
//
// Deliberately quiet: no errors surface, nothing is marked broken. This is
// a name lookup, not a health check, and /numbers still reports the real
// reason when a number genuinely cannot be reached.

type Client = SupabaseClient<Database>;

/** What Meta can tell us about a number, in the app's own spelling. */
export interface NumberFacts {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
}

type Candidate = SyncCandidate & { phoneNumberId: string };

/**
 * Asks Meta about any connection with no number on it, stores what comes
 * back, and returns it keyed by connection id. Callers merge it into what
 * they already read; connections not in the map are unchanged.
 */
export async function syncMissingNumbers(
  supabase: Client,
  orgId: string,
  connections: readonly Candidate[]
): Promise<Map<string, NumberFacts>> {
  const found = new Map<string, NumberFacts>();

  const due = needsNumberSync(connections);
  if (due.length === 0) return found;

  const { data: rows } = await supabase
    .from("waba_connections")
    .select("id, access_token_encrypted")
    .eq("org_id", orgId)
    .in(
      "id",
      due.map((connection) => connection.id)
    );

  const tokens = new Map((rows ?? []).map((row) => [row.id, row.access_token_encrypted]));

  for (const connection of due) {
    const encrypted = tokens.get(connection.id);
    if (!encrypted) continue;

    // Stamped whatever happens, so a number Meta will not describe is
    // retried hourly rather than on every render.
    const checkedAt = new Date().toISOString();

    try {
      const token = decryptToken(encrypted);
      const number = await getPhoneNumber(connection.phoneNumberId, token);
      const facts: NumberFacts = {
        displayPhoneNumber: number.display_phone_number ?? null,
        verifiedName: number.verified_name ?? null,
        qualityRating: number.quality_rating ?? null,
      };

      await supabase
        .from("waba_connections")
        .update({
          display_phone_number: facts.displayPhoneNumber,
          verified_name: facts.verifiedName,
          quality_rating: facts.qualityRating,
          last_checked_at: checkedAt,
        })
        .eq("id", connection.id)
        .eq("org_id", orgId);

      if (facts.displayPhoneNumber || facts.verifiedName) found.set(connection.id, facts);
    } catch {
      await supabase
        .from("waba_connections")
        .update({ last_checked_at: checkedAt })
        .eq("id", connection.id)
        .eq("org_id", orgId);
    }
  }

  return found;
}
