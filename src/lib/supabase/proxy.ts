import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

// Refreshes the Supabase session cookie on every request so server
// components always see an up-to-date auth state. Mirrors the official
// @supabase/ssr Next.js middleware pattern.
export async function updateSession(request: NextRequest) {
  const env = getSupabaseEnv();

  // This runs for every matched request, including public pages that never
  // touch Supabase. Without credentials there is no session to refresh, so
  // pass the request through untouched rather than throwing — otherwise a
  // missing env var takes down the whole site instead of just auth.
  if (!env) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Required: this call refreshes the session and must not be removed or
  // reordered, per @supabase/ssr's documented middleware contract.
  await supabase.auth.getUser();

  return response;
}
