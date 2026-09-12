// Supabase env vars are read through here rather than asserted non-null at
// each call site. A missing value is a deployment state we have to survive,
// not a type-level impossibility: `process.env.X!` satisfies TypeScript but
// still yields undefined at runtime, which makes createClient throw and —
// from the proxy, which runs on every request — 500s the entire site,
// including public pages that never touch Supabase.

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.local.example).";
