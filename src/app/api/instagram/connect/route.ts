import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { instagramAllowance } from "@/lib/entitlement";
import { instagramEnv } from "@/lib/instagram-api";
import { authoriseUrl, redirectUri } from "@/lib/instagram";
import { signState } from "@/lib/instagram-state";

// Sends the customer to Instagram to approve the connection.
//
// A GET that redirects rather than a form post, so the Connect button is
// an ordinary link and works with no JavaScript — which matters because
// this is the one action in the product that leaves the site entirely.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { orgId, isPlatformAdmin } = await requireOrg();

  // Checked before Instagram rather than after.
  //
  // The callback could refuse just as well, but by then somebody has
  // approved permissions on Instagram's screen for a connection that
  // was never going to be allowed — and the thing they remember is
  // granting access and being told no.
  const allowance = await instagramAllowance(await createClient(), orgId, isPlatformAdmin);
  if (!allowance.ok) {
    return NextResponse.redirect(
      new URL(
        "/instagram?failed=limit",
        process.env.NEXT_PUBLIC_APP_URL ?? "https://neurachat.in"
      )
    );
  }

  const env = instagramEnv();
  if ("error" in env) {
    // Back to the screen that explains what is missing, rather than a
    // raw error page: the fix is four fields away and described there.
    return NextResponse.redirect(
      new URL("/instagram?setup=1", process.env.NEXT_PUBLIC_APP_URL ?? "https://neurachat.in")
    );
  }

  return NextResponse.redirect(
    authoriseUrl({
      instagramAppId: env.appId,
      redirectUri: redirectUri(env.appUrl),
      // Signed, and the only thing that tells the callback which
      // workspace this is. Unsigned, anyone who knows the redirect URI
      // could attach their own Instagram account to somebody else's
      // workspace by editing one query parameter.
      state: signState(orgId),
    })
  );
}
