"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Copy, Database } from "lucide-react";

/**
 * What is missing, and the shortest way to fix it.
 *
 * The file paths are shown rather than the SQL itself: the SQL is thousands
 * of lines and lives in the repo, and pasting it here would mean shipping a
 * copy that goes out of date the next time a migration is added.
 */
export default function MissingTables({
  bundles,
  missingByMigration,
  present,
  errored,
}: {
  bundles: Array<{ bundle: string; tables: string[] }>;
  missingByMigration: Array<{ migration: string; tables: string[] }>;
  present: string[];
  errored: Array<{ table: string; error: string }>;
}) {
  const [showPresent, setShowPresent] = useState(false);

  return (
    <div className="space-y-4">
      {bundles.length === 0 ? (
        <div className="glass-card p-6 flex items-start gap-3">
          <Check className="w-5 h-5 text-accent-ink flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold mb-1">Every table is present</div>
            <p className="text-sm text-white/55">
              This database has run all the migrations. Nothing to do.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="glass-card p-6">
            <div className="flex items-start gap-3 mb-5">
              <AlertTriangle className="w-5 h-5 text-[#FACC15] flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-1">
                  {bundles.reduce((total, entry) => total + entry.tables.length, 0)} tables are
                  missing
                </div>
                <p className="text-sm text-white/55 leading-relaxed">
                  Run the files below in the Supabase SQL editor, oldest month first. Each is safe
                  to run more than once, so a partly-applied earlier attempt does not block it.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {bundles.map((entry) => (
                <div
                  key={entry.bundle}
                  className="rounded-xl border border-white/10 bg-white/4 p-4"
                >
                  <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                    <code className="text-sm text-accent-ink font-semibold">
                      supabase/updates/{entry.bundle}.sql
                    </code>
                    <CopyButton value={`supabase/updates/${entry.bundle}.sql`} />
                  </div>
                  <p className="text-xs text-white/45 leading-relaxed">
                    Creates {entry.tables.length}{" "}
                    {entry.tables.length === 1 ? "table" : "tables"}:{" "}
                    <span className="text-white/60">{entry.tables.join(", ")}</span>
                  </p>
                </div>
              ))}
            </div>

            <p className="text-xs text-white/35 mt-4 leading-relaxed">
              Or run <code className="text-white/55">supabase/setup.sql</code> once, which contains
              every migration from the beginning — longer, same result.
            </p>
          </div>

          <div className="glass-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40 mb-3">
              Missing tables by migration
            </div>
            <div className="space-y-2">
              {missingByMigration.map((entry) => (
                <div key={entry.migration} className="text-xs">
                  <code className="text-white/70">{entry.migration}</code>
                  <div className="text-white/40 mt-0.5 ml-3">{entry.tables.join(", ")}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* A table that exists but refuses the probe is a different problem —
          usually a policy that recurses — and must not be filed as missing,
          because running the migration again would not fix it. */}
      {errored.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[#F87171]" />
            <div className="text-sm font-semibold">
              {errored.length} {errored.length === 1 ? "table exists" : "tables exist"} but would
              not answer
            </div>
          </div>
          <p className="text-xs text-white/45 mb-3 leading-relaxed">
            These are present, so running the migration again will not help. The error is below as
            Postgres reported it.
          </p>
          <div className="space-y-2">
            {errored.map((entry) => (
              <div key={entry.table} className="text-xs">
                <code className="text-white/70">{entry.table}</code>
                <div className="text-[#FACC15] mt-0.5 ml-3 break-words">{entry.error}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-card p-5">
        <button
          type="button"
          onClick={() => setShowPresent((current) => !current)}
          aria-expanded={showPresent}
          className="w-full flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          <Database className="w-4 h-4" />
          {present.length} tables present
          <ChevronDown
            className={`ml-auto w-4 h-4 transition-transform ${showPresent ? "rotate-180" : ""}`}
          />
        </button>

        {showPresent && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {present.map((table) => (
              <code
                key={table}
                className="text-[11px] px-2 py-1 rounded-lg bg-white/5 border border-white/8 text-white/50"
              >
                {table}
              </code>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // A browser that refuses clipboard access leaves the path on
          // screen to select by hand, which is the fallback anyway.
        }
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-white/50 hover:text-white hover:bg-white/8 transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-accent-ink" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy path"}
    </button>
  );
}
