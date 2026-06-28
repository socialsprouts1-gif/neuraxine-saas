/**
 * Pluggable durable persistence for the app's data snapshot.
 *
 * The app keeps a working copy of all data in memory (see `store.ts`). This
 * module persists that snapshot to durable storage and reloads it, so data
 * survives server restarts and serverless cold starts.
 *
 * Adapter is chosen automatically from the environment:
 *   - DATABASE_URL set        → Postgres (recommended for production / Vercel)
 *   - otherwise, writable FS  → JSON file at ./.data/state.json (local dev)
 *   - otherwise               → none (pure in-memory)
 *
 * The snapshot is a single JSON document. This is intentionally simple and is
 * a great fit for MVP / single-instance deployments. For high write
 * concurrency across many serverless instances, migrate to a normalised schema
 * (the store's exported functions are the boundary to swap).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

type Snapshot = Record<string, unknown>;

const FILE_PATH = path.join(process.cwd(), ".data", "state.json");
const SNAPSHOT_ID = "singleton";

type Adapter = "postgres" | "file" | "none";

function adapter(): Adapter {
  if (process.env.DATABASE_URL) return "postgres";
  // Disable file persistence on read-only/serverless filesystems.
  if (process.env.DISABLE_FILE_PERSIST === "1" || process.env.VERCEL) return "none";
  return "file";
}

export function persistenceMode(): Adapter {
  return adapter();
}

/* -------------------------------------------------------------------------- */
/*  Postgres adapter                                                           */
/* -------------------------------------------------------------------------- */

// Lazily created singleton SQL client (kept on globalThis across hot-reloads).
const globalForSql = globalThis as unknown as { __waSql?: import("postgres").Sql };

async function getSql() {
  if (!globalForSql.__waSql) {
    const { default: postgres } = await import("postgres");
    globalForSql.__waSql = postgres(process.env.DATABASE_URL as string, {
      // Most managed Postgres providers (Supabase/Neon/Vercel) require TLS.
      ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
      max: 1,
    });
  }
  return globalForSql.__waSql;
}

async function pgLoad(): Promise<Snapshot | null> {
  const sql = await getSql();
  await sql`CREATE TABLE IF NOT EXISTS app_state (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  const rows = await sql`SELECT data FROM app_state WHERE id = ${SNAPSHOT_ID}`;
  return rows.length ? (rows[0].data as Snapshot) : null;
}

async function pgSave(state: Snapshot): Promise<void> {
  const sql = await getSql();
  await sql`
    INSERT INTO app_state (id, data, updated_at)
    VALUES (${SNAPSHOT_ID}, ${sql.json(state as never)}, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
  `;
}

/* -------------------------------------------------------------------------- */
/*  File adapter                                                               */
/* -------------------------------------------------------------------------- */

async function fileLoad(): Promise<Snapshot | null> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null; // not created yet
  }
}

async function fileSave(state: Snapshot): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  await fs.writeFile(FILE_PATH, JSON.stringify(state), "utf8");
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function loadSnapshot(): Promise<Snapshot | null> {
  switch (adapter()) {
    case "postgres":
      return pgLoad();
    case "file":
      return fileLoad();
    default:
      return null;
  }
}

export async function saveSnapshot(state: Snapshot): Promise<void> {
  switch (adapter()) {
    case "postgres":
      return pgSave(state);
    case "file":
      return fileSave(state);
    default:
      return;
  }
}

export function persistenceEnabled(): boolean {
  return adapter() !== "none";
}
