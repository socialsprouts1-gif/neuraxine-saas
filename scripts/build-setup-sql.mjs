import { readdirSync, readFileSync, writeFileSync } from "node:fs";

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

let out = header;

for (const name of FILES) {
  const raw = readFileSync(`${DIR}/${name}`, "utf8");

  // Postgres has no "create policy if not exists", so make each policy
  // idempotent by dropping it first. Without this, re-running the file
  // after a partially-applied attempt fails on the first duplicate.
  const guarded = raw.replace(
    /create policy (\w+)\s+on\s+([\w.]+)/g,
    (_m, policy, table) =>
      `drop policy if exists ${policy} on ${table};\ncreate policy ${policy} on ${table}`
  );

  out += `\n-- ========================================================================\n`;
  out += `-- ${name}\n`;
  out += `-- ========================================================================\n\n`;
  out += guarded.trimEnd() + "\n";
}

writeFileSync("supabase/setup.sql", out);

const policies = (out.match(/^create policy /gm) ?? []).length;
const drops = (out.match(/^drop policy if exists /gm) ?? []).length;
const tables = (out.match(/create table if not exists/g) ?? []).length;

console.log("setup.sql written");
console.log(`  migrations included: ${FILES.length}`);
for (const f of FILES) console.log(`    - ${f}`);
console.log(`  tables:              ${tables}`);
console.log(`  policies:            ${policies}`);
// Every create needs a guard; extra drops are harmless, since a migration
// may drop a policy an earlier one created under a different name.
console.log(`  drop guards match:   ${drops >= policies ? "yes" : "NO — MISMATCH"}`);

if (drops < policies) process.exit(1);
