import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseEnv, SUPABASE_NOT_CONFIGURED_MESSAGE } from "./env";

// For use in Server Components, Route Handlers, and Server Actions. Reads
// the caller's session from cookies, so all queries run under that user's
// RLS policies.
//
// Callers that can render without auth should check isSupabaseConfigured()
// first; this throws a named error so routes can turn it into a clear 503
// instead of an opaque 500.
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new SupabaseNotConfiguredError();
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component with no response to write to
          // (e.g. rendering, not a Server Action). Session refresh for
          // those requests is handled by proxy.ts instead.
        }
      },
    },
  });
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super(SUPABASE_NOT_CONFIGURED_MESSAGE);
    this.name = "SupabaseNotConfiguredError";
  }
}
