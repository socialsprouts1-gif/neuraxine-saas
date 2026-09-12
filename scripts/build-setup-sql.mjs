import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// Read the migrations directory rather than a hardcoded list: a hardcoded
// list silently omits any migration added later, producing a setup.sql that
// looks fine and leaves the database missing tables.
const DIR = "supabase/migrations";
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // timestamp prefixes make lexical order the correct apply order

const header = `-- Neura Chat — complete database setup
--
-- Generated from supabase/migrations/*.sql in filename order.
-- Paste this whole file into the Supabase SQL editor and press Run.
--
-- Safe to run more than once: tables use "if not exists", functions use
-- "create or replace", and every policy is dropped before being recreated,
-- so a partial earlier run does not block this.
--
-- Source of truth remains the individual files in supabase/migrations/.
-- Regenerate with: node scripts/build-setup-sql.mjs

`;

// Postgres has no "create policy if not exists", so make each policy
// idempotent by dropping it first. Without this, re-running a file after a
// partially-applied attempt fails on the first duplicate.
function guard(sql) {
  return sql.replace(
    /create policy (\w+)\s+on\s+([\w.]+)/g,
    (_m, policy, table) =>
      `drop policy if exists ${policy} on ${table};\ncreate policy ${policy} on ${table}`
  );
}

function section(name, sql) {
  return (
    `\n-- ========================================================================\n` +
    `-- ${name}\n` +
    `-- ========================================================================\n\n` +
    guard(sql).trimEnd() +
    "\n"
  );
}

let out = header;

for (const name of FILES) {
  out += section(name, readFileSync(`${DIR}/${name}`, "utf8"));
}

writeFileSync("supabase/setup.sql", out);

// ---------------------------------------------------------------------------
// Monthly update bundles.
//
// setup.sql is four thousand lines. Pasting it is correct and it is
// idempotent, but nobody wants to run it to pick up three new tables, and a
// wall of SQL is easy to abandon halfway. So each calendar month of
// migrations also gets its own file, small enough to read before running.
//
// Grouped by month rather than "everything since X" so the files are stable:
// a name, once written, always means the same set of migrations, and there is
// no marker anyone has to remember to bump.
// ---------------------------------------------------------------------------
const UPDATES = "supabase/updates";
rmSync(UPDATES, { recursive: true, force: true });
mkdirSync(UPDATES, { recursive: true });

const byMonth = new Map();
for (const name of FILES) {
  // Filenames are YYYYMMDDHHMMSS_slug.sql.
  const stamp = /^(\d{4})(\d{2})/.exec(name);
  if (!stamp) continue;
  const month = `${stamp[1]}-${stamp[2]}`;
  if (!byMonth.has(month)) byMonth.set(month, []);
  byMonth.get(month).push(name);
}

for (const [month, names] of byMonth) {
  let bundle = `-- Neura Chat — database update for ${month}
--
-- The migrations added in ${month}, and nothing else. Paste this into the
-- Supabase SQL editor and press Run.
--
-- Safe to run more than once, and safe to run out of order with other
-- months: tables use "if not exists", columns use "add column if not
-- exists", functions use "create or replace", and every policy is dropped
-- before being recreated.
--
-- If this is a brand new database, run supabase/setup.sql instead — it
-- contains every migration from the beginning.
--
-- Regenerate with: node scripts/build-setup-sql.mjs

`;
  for (const name of names) {
    bundle += section(name, readFileSync(`${DIR}/${name}`, "utf8"));
  }
  writeFileSync(`${UPDATES}/${month}.sql`, bundle);
}

const policies = (out.match(/^create policy /gm) ?? []).length;
const drops = (out.match(/^drop policy if exists /gm) ?? []).length;
const tables = (out.match(/create table if not exists/g) ?? []).length;

// ---------------------------------------------------------------------------
// The schema manifest.
//
// Which table each migration creates, parsed from the migrations themselves.
// Admin → Database probes this list to say exactly which tables are missing
// and which file to run for them.
//
// Generated rather than hand-written because the hand-written version went
// stale immediately: /setup listed four migration files for months while
// twenty-two more were added, so the one screen whose job was to explain a
// missing table named the wrong file.
// ---------------------------------------------------------------------------
const manifest = [];
for (const name of FILES) {
  const sql = readFileSync(`${DIR}/${name}`, "utf8");
  for (const [, table] of sql.matchAll(
    /create table if not exists public\.(\w+)/g
  )) {
    // First writer wins: a later migration that alters a table is not where
    // it comes from.
    if (!manifest.some((entry) => entry.table === table)) {
      manifest.push({ table, migration: name });
    }
  }
}

const monthOf = (migration) => {
  const stamp = /^(\d{4})(\d{2})/.exec(migration);
  return stamp ? `${stamp[1]}-${stamp[2]}` : "";
};

writeFileSync(
  "src/lib/schema-manifest.ts",
  `// GENERATED FILE — do not edit.
//
// Written by scripts/build-setup-sql.mjs from supabase/migrations/*.sql.
// Regenerate with: node scripts/build-setup-sql.mjs

export interface SchemaTable {
  /** The table name, without the public. prefix. */
  table: string;
  /** The migration file that creates it. */
  migration: string;
  /** The monthly bundle under supabase/updates/ that contains it. */
  bundle: string;
}

export const SCHEMA_MANIFEST: SchemaTable[] = [
${manifest
  .map(
    (entry) =>
      `  { table: ${JSON.stringify(entry.table)}, migration: ${JSON.stringify(
        entry.migration
      )}, bundle: ${JSON.stringify(monthOf(entry.migration))} },`
  )
  .join("\n")}
];
`
);

console.log("setup.sql written");
console.log(`  migrations included: ${FILES.length}`);
for (const f of FILES) console.log(`    - ${f}`);
console.log(`  tables:              ${tables}`);
console.log(`  policies:            ${policies}`);
// Every create needs a guard; extra drops are harmless, since a migration
// may drop a policy an earlier one created under a different name.
console.log(`  drop guards match:   ${drops >= policies ? "yes" : "NO — MISMATCH"}`);
console.log(`  manifest tables:     ${manifest.length}`);
console.log(`  update bundles:      ${byMonth.size}`);
for (const [month, names] of byMonth) {
  console.log(`    - updates/${month}.sql (${names.length})`);
}

if (drops < policies) process.exit(1);
