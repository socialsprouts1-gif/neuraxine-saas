// Only what the code actually reads. META_ACCESS_TOKEN is declared in
// .env.local.example but no code path consumes it — per-org tokens come
// from waba_connections.access_token_encrypted instead — so listing it
// here would send people hunting for a value they don't need yet.
const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "META_APP_SECRET",
  "TOKEN_ENCRYPTION_KEY",
];

export default function SetupNotice() {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center p-6">
      <div className="glass-card p-8 max-w-lg">
        <h1 className="text-xl font-bold mb-2">Setup required</h1>
        <p className="text-white/60 text-sm mb-6">
          Neura Chat can&apos;t reach Supabase because its environment variables
          aren&apos;t set on this deployment. Add them, then redeploy.
        </p>

        <ul className="space-y-1.5 mb-6">
          {REQUIRED_VARS.map((name) => (
            <li key={name} className="font-mono text-xs text-accent-ink">
              {name}
            </li>
          ))}
        </ul>

        <p className="text-white/40 text-xs">
          See <span className="font-mono text-white/60">.env.local.example</span> for
          what each value is and where to find it.
        </p>
      </div>
    </div>
  );
}
