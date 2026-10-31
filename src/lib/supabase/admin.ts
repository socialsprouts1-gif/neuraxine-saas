import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseEnv, SUPABASE_NOT_CONFIGURED_MESSAGE } from "./env";

// Service-role client for trusted server-only code that has no user
// session to scope RLS to — currently just the WhatsApp webhook handler,
// which authenticates the request itself via the Meta signature instead.
// This bypasses RLS entirely: never import it into client components or
// anything that forwards caller-controlled org/user IDs unchecked.
export function createAdminClient() {
  const env = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!env || !serviceRoleKey) {
    throw new Error(
      `${SUPABASE_NOT_CONFIGURED_MESSAGE} The webhook also requires SUPABASE_SERVICE_ROLE_KEY.`
    );
  }

  return createSupabaseClient<Database>(env.url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
