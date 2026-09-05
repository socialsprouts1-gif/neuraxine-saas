import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Supabase sends users back here through two different mechanisms, and the
// route has to handle both:
//
//   OAuth / PKCE (Google)      -> ?code=...
//   Email links (confirm,      -> ?token_hash=...&type=signup
//   magic link, recovery)
//
// Handling only `code` silently breaks every email confirmation link, since
// those carry a token_hash instead and fall through to the failure branch.
//
// Supabase also redirects here (or to the Site URL) with error parameters
// when a link is expired or already used, so those are forwarded to the
// login page rather than being flattened into a generic message.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/inbox";

  const error = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  if (error || errorCode) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(
        errorDescription ?? errorCode ?? error ?? "Sign in link could not be used"
      )}`
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent("Supabase is not configured on this deployment")}`
    );
  }

  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!verifyError) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(verifyError.message)}`
    );
  }

  const code = searchParams.get("code");
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/auth/login?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  return NextResponse.redirect(
    `${origin}/auth/login?error=${encodeURIComponent("This sign in link is missing its token. Request a new one.")}`
  );
}
