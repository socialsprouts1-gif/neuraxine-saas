import { createAdminClient } from "@/lib/supabase/admin";
import { SCHEMA_MANIFEST } from "@/lib/schema-manifest";
import { HeroHeader, StatCard } from "@/components/ui/primitives";
import MissingTables from "./MissingTables";

// Which tables actually exist, and what to run for the ones that do not.
//
// Every "Could not find the table 'public.x' in the schema cache" costs a
// round of guessing at which SQL file was missed. This answers it directly:
// probe every table the migrations create, group what is missing by the file
// that creates it, and print the file to run.
//
// The manifest is generated from supabase/migrations/*.sql by
// scripts/build-setup-sql.mjs, so it cannot go stale the way the hardcoded
// list on /setup did.

export const dynamic = "force-dynamic";

export default async function DatabasePage() {
  // The service-role client: RLS would make an empty table and a missing one
  // look identical to a tenant, and this page has to tell them apart.
  const supabase = createAdminClient();

  const results = await Promise.all(
    SCHEMA_MANIFEST.map(async (entry) => {
      const { error } = await supabase
        .from(entry.table as "organizations")
        .select("*", { count: "exact", head: true })
        .limit(1);

      // Postgres 42P01 is "undefined table"; PostgREST answers PGRST205 when
      // its schema cache has never seen it. Anything else is a live table
      // refusing the query for some other reason, which is not "missing".
      const missing =
        !!error &&
        (error.code === "42P01" ||
          error.code === "PGRST205" ||
          /does not exist|not find the table/i.test(error.message));

      return { ...entry, missing, error: error?.message ?? null };
    })
  );

  const missing = results.filter((row) => row.missing);
  const errored = results.filter((row) => !row.missing && row.error);

  // Grouped by bundle rather than by migration: one paste per month is the
  // shortest path from here to a working database.
  const bundles = new Map<string, string[]>();
  for (const row of missing) {
    if (!bundles.has(row.bundle)) bundles.set(row.bundle, []);
    bundles.get(row.bundle)!.push(row.table);
  }

  return (
    <div className="p-6 md:p-8">
      <HeroHeader
        title="Database"
        subtitle="Which tables the migrations create, and which of them this database actually has."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Tables expected" value={SCHEMA_MANIFEST.length} />
        <StatCard label="Present" value={SCHEMA_MANIFEST.length - missing.length} />
        <StatCard label="Missing" value={missing.length} />
        <StatCard label="Migrations" value={new Set(SCHEMA_MANIFEST.map((e) => e.migration)).size} />
      </div>

      <MissingTables
        bundles={[...bundles.entries()].map(([bundle, tables]) => ({ bundle, tables }))}
        missingByMigration={[
          ...missing
            .reduce((map, row) => {
              const list = map.get(row.migration) ?? [];
              list.push(row.table);
              map.set(row.migration, list);
              return map;
            }, new Map<string, string[]>())
            .entries(),
        ].map(([migration, tables]) => ({ migration, tables }))}
        present={results.filter((row) => !row.missing).map((row) => row.table)}
        errored={errored.map((row) => ({ table: row.table, error: row.error! }))}
      />
    </div>
  );
}
