import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/crypto";

// Keeping an Instagram connection alive.
//
// An Instagram long-lived token lasts sixty days. Meta will extend it by
// another sixty for the asking, any time after the first twenty-four
// hours — but only while it is still valid. Once it lapses there is no
// extending it and the only way back is the customer signing in again.
//
// Nothing did the asking. The connect flow wrote token_expires_at and
// nothing ever read it; the comment beside the exchange even says "the
// refresh job can fix it", about a job that was never written. So every
// account worked beautifully for two months and then stopped, with no
// error anybody would connect to a token — comments still arrived,
// because webhooks are verified against the app secret rather than the
// token, and only the reply failed.
//
// Sixty days is long enough that the first time it happens, nobody
// remembers what they did sixty days ago.

const GRAPH = "https://graph.instagram.com";

/** Refresh this far ahead of expiry. */
const WINDOW_DAYS = 10;

/** Meta refuses a refresh on a token younger than a day. */
const MIN_AGE_HOURS = 24;

export interface RefreshResult {
  checked: number;
  refreshed: number;
  expired: number;
  failed: number;
  firstError?: string;
}

const EMPTY: RefreshResult = { checked: 0, refreshed: 0, expired: 0, failed: 0 };

/**
 * Extends every connection that is near its end.
 *
 * Never throws. This runs from the cron that also sends reminders and
 * dispatches campaigns, and an Instagram account nobody is using must
 * not be able to stop those.
 */
export async function refreshInstagramTokens(): Promise<RefreshResult> {
  const result: RefreshResult = { ...EMPTY };

  try {
    const admin = createAdminClient();
    const now = Date.now();

    // Only the ones worth touching: active, with a known expiry, inside
    // the window. A connection with no expiry recorded is left alone —
    // it predates this and guessing at its age could burn a working
    // token on a refusal.
    const { data: rows, error } = await admin
      .from("instagram_connections")
      .select("id, username, access_token_encrypted, token_expires_at, created_at")
      .eq("status", "active")
      .not("token_expires_at", "is", null)
      .lte("token_expires_at", new Date(now + WINDOW_DAYS * 86_400_000).toISOString())
      .limit(50);

    if (error) return { ...result, firstError: error.message };
    if (!rows || rows.length === 0) return result;

    for (const row of rows) {
      result.checked += 1;

      const expiresAt = new Date(row.token_expires_at ?? "").getTime();

      // Already gone. Marked, not retried: Meta will not extend a lapsed
      // token and the only way back is the customer signing in again.
      // Saying so is the whole value — the alternative is an account
      // that silently answers nobody.
      if (Number.isFinite(expiresAt) && expiresAt <= now) {
        result.expired += 1;
        await admin
          .from("instagram_connections")
          .update({
            status: "expired",
            last_error:
              "Instagram access has run out. Connect the account again — it takes a few seconds and nothing else is lost.",
            last_error_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        continue;
      }

      // Too young for Meta to extend. It will come round again tomorrow.
      const age = now - new Date(row.created_at ?? "").getTime();
      if (Number.isFinite(age) && age < MIN_AGE_HOURS * 3_600_000) continue;

      try {
        const token = decryptToken(row.access_token_encrypted);
        const response = await fetch(
          `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(
            token
          )}`,
          { signal: AbortSignal.timeout(10_000) }
        );

        const body = (await response.json().catch(() => null)) as {
          access_token?: string;
          expires_in?: number;
          error?: { message?: string };
        } | null;

        if (!response.ok || !body?.access_token) {
          result.failed += 1;
          const reason =
            body?.error?.message?.trim() || "Instagram would not extend the access.";
          result.firstError ??= `${row.username ?? row.id}: ${reason}`;

          await admin
            .from("instagram_connections")
            .update({ last_error: reason.slice(0, 500), last_error_at: new Date().toISOString() })
            .eq("id", row.id);
          continue;
        }

        const seconds = typeof body.expires_in === "number" ? body.expires_in : 60 * 86_400;

        await admin
          .from("instagram_connections")
          .update({
            access_token_encrypted: encryptToken(body.access_token),
            token_expires_at: new Date(now + seconds * 1000).toISOString(),
            last_error: null,
            last_error_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        result.refreshed += 1;
      } catch (error) {
        result.failed += 1;
        result.firstError ??=
          error instanceof Error ? error.message : "The refresh could not be attempted.";
      }
    }

    return result;
  } catch (error) {
    return {
      ...result,
      firstError: error instanceof Error ? error.message : "The refresh sweep failed.",
    };
  }
}
