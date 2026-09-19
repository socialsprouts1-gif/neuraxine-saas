import Link from "next/link";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { SCHEMA_MANIFEST } from "@/lib/schema-manifest";

// Two distinct failures land here, and they need different instructions:
// missing environment variables, or a reachable Supabase whose schema the
// migrations were never applied to.
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const looksLikeMissingSchema =
    !!reason && /does not exist|relation|schema cache|not find the table/i.test(reason);

  return (
    <div className="min-h-screen bg-[var(--app-bg)] flex items-center justify-center p-6">
      <div className="glass-card p-8 max-w-xl">
        <h1 className="text-xl font-bold mb-2">
          {looksLikeMissingSchema ? "Database not set up yet" : "Account setup incomplete"}
        </h1>

        {looksLikeMissingSchema ? (
          <>
            <p className="text-white/60 text-sm mb-5">
              Supabase is connected, but the tables this app needs don&apos;t exist. Paste{" "}
              <code className="text-white/80">supabase/setup.sql</code> into the Supabase SQL
              editor and press Run. It contains every migration, in order, and is safe to run
              more than once.
            </p>
            <p className="text-white/45 text-xs mb-6">
              It creates {SCHEMA_MANIFEST.length} tables across{" "}
              {new Set(SCHEMA_MANIFEST.map((entry) => entry.migration)).size} migrations. Once you
              can sign in, Admin → Database lists exactly which of them are present, so a later
              missing table never needs guessing at.
            </p>
          </>
        ) : (
          <p className="text-white/60 text-sm mb-5">
            You&apos;re signed in, but this account isn&apos;t attached to an organization
            and one couldn&apos;t be created automatically. This usually means the signup
            trigger migration hasn&apos;t been applied.
          </p>
        )}

        {reason && (
          <div className="bg-[var(--surface-1)] border border-white/10 rounded-xl p-4 mb-6">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-1.5">
              Reported error
            </div>
            <code className="text-xs text-[#FACC15] break-words">{reason}</code>
          </div>
        )}

        <div className="flex gap-3">
          <Link href="/overview" className="btn-primary text-sm">
            Try again
          </Link>
          <Link href="/auth/login" className="btn-secondary text-sm">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
