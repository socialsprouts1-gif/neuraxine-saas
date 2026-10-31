import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, instagramEnv } from "@/lib/instagram-api";
import { readState } from "@/lib/instagram-state";

// Where Instagram sends the customer back.
//
// Everything here ends in a redirect to /instagram carrying a short
// reason, because this page is never read by a person — they see
// whatever the dashboard shows next. A raw error body at this URL is a
// customer staring at JSON after approving a permission screen.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(reason: string, appUrl: string) {
  return NextResponse.redirect(new URL(`/instagram?${reason}`, appUrl));
}

export async function GET(request: NextRequest) {
  const env = instagramEnv();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://neurachat.in";
  if ("error" in env) return back("setup=1", appUrl);

  const params = request.nextUrl.searchParams;

  // The customer pressed Cancel on Instagram's screen. Not an error.
  if (params.get("error")) return back("cancelled=1", appUrl);

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back("failed=missing", appUrl);

  // Signed on the way out, so a forged or stale state stops here rather
  // than attaching an account to the wrong workspace.
  const orgId = readState(state);
  if (!orgId) return back("failed=state", appUrl);

  const account = await exchangeCode(code, env);
  if ("error" in account) {
    console.error("Instagram connect failed", account.error);
    return back("failed=exchange", appUrl);
  }

  const admin = createAdminClient();

  // Whoever connects the account owns it. The unique index on ig_user_id
  // is what makes that true rather than hoped for: two workspaces both
  // claiming one account would give an inbound DM two destinations.
  const { data: existing } = await admin
    .from("instagram_connections")
    .select("id, org_id")
    .eq("ig_user_id", account.igUserId)
    .maybeSingle();

  if (existing && existing.org_id !== orgId) {
    return back("failed=claimed", appUrl);
  }

  // Split because org_id and ig_user_id are insert-only: reconnecting an
  // account refreshes its token, it does not move it to another
  // workspace. The types enforce that rather than trusting this file to.
  const refreshed = {
    username: account.username,
    account_name: account.accountName,
    profile_picture_url: account.profilePictureUrl,
    access_token_encrypted: account.accessTokenEncrypted,
    token_expires_at: account.expiresAt,
    status: "active",
    last_error: null,
    last_error_at: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await admin.from("instagram_connections").update(refreshed).eq("id", existing.id)
    : await admin.from("instagram_connections").insert({
        org_id: orgId,
        ig_user_id: account.igUserId,
        username: account.username,
        account_name: account.accountName,
        profile_picture_url: account.profilePictureUrl,
        access_token_encrypted: account.accessTokenEncrypted,
        token_expires_at: account.expiresAt,
        status: "active",
        // Proves an inbound webhook is Meta's, the same way the WhatsApp
        // side does. Generated once and never shown to the browser.
        webhook_verify_token: randomBytes(24).toString("base64url"),
      });

  if (error) {
    console.error("Could not save the Instagram connection", error);
    return back(error.code === "42P01" ? "failed=migration" : "failed=save", appUrl);
  }

  return back("connected=1", appUrl);
}
