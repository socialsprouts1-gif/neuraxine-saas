import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv, SUPABASE_NOT_CONFIGURED_MESSAGE } from "./env";

export function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    // Surfaced to the user by the auth pages rather than left as an
    // unhandled promise rejection with Supabase's own wording.
    throw new Error(SUPABASE_NOT_CONFIGURED_MESSAGE);
  }

  return createBrowserClient<Database>(env.url, env.anonKey);
}
