import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { decryptToken } from "@/lib/crypto";

// Choosing which of a workspace's WhatsApp numbers to act on.
//
// This exists because the answer used to be assumed. Every caller wrote
// `.eq("org_id", …).eq("status", "active").maybeSingle()` and treated the
// row as "the" connection. With two numbers connected that query returns
// two rows, maybeSingle() answers with an error rather than a row, and the
// app tells an org that just connected two numbers to connect a number.
//
// One function, one order of precedence, used everywhere.

type Client = SupabaseClient<Database>;

/** Everything a screen needs to show a number. No secrets. */
export interface ConnectionSummary {
  id: string;
  phoneNumberId: string;
  wabaId: string;
  /** "+91 92724 47307" — what Meta reports, for people to recognise. */
  displayPhoneNumber: string | null;
  /** The name Meta shows to customers. */
  verifiedName: string | null;
  /** The operator's own name for it: "Support", "Sales". */
  label: string | null;
  qualityRating: string | null;
  /** The Meta app the token belongs to. Needed to upload media to Meta. */
  metaAppId: string;
  status: string;
  isDefault: boolean;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** A summary plus the decrypted token — only for code about to call Meta. */
export interface ResolvedConnection extends ConnectionSummary {
  accessToken: string;
}

// The columns the multi-number migration adds. Selecting one that does not
// exist fails the whole query, so everything below can fall back to BASE —
// otherwise a workspace that has not run the migration yet sees no numbers
// at all and every picker hides itself, with nothing on screen saying why.
const EXTRA = "display_phone_number, verified_name, label, quality_rating, is_default";
const BASE =
  "id, org_id, phone_number_id, waba_id, meta_app_id, status, last_error, last_error_at";
const COLUMNS = `${BASE}, ${EXTRA}`;

/** What a row looks like before the migration has been applied. */
type BaseRow = Omit<Row, "display_phone_number" | "verified_name" | "label" | "quality_rating" | "is_default">;

function fillMissing(row: BaseRow): Row {
  return {
    ...row,
    display_phone_number: null,
    verified_name: null,
    label: null,
    quality_rating: null,
    is_default: false,
  };
}

/**
 * Whether the multi-number columns exist yet.
 *
 * Screens use it to tell someone to run the migration rather than showing
 * them an empty list and letting them guess.
 */
export async function hasNumberColumns(supabase: Client): Promise<boolean> {
  const { error } = await supabase.from("waba_connections").select("is_default").limit(1);
  return !error;
}

type Row = {
  id: string;
  phone_number_id: string;
  waba_id: string;
  meta_app_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  label: string | null;
  quality_rating: string | null;
  status: string;
  is_default: boolean;
  last_error: string | null;
  last_error_at: string | null;
};

function toSummary(row: Row): ConnectionSummary {
  return {
    id: row.id,
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id,
    displayPhoneNumber: row.display_phone_number,
    verifiedName: row.verified_name,
    label: row.label,
    qualityRating: row.quality_rating,
    metaAppId: row.meta_app_id,
    status: row.status,
    isDefault: row.is_default,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
  };
}

/**
 * Every number in the workspace, default first.
 *
 * Includes numbers that are not active: a broken number the operator needs
 * to fix is exactly the one they came to this screen to find.
 */
export async function listConnections(
  supabase: Client,
  orgId: string
): Promise<ConnectionSummary[]> {
  const { data, error } = await supabase
    .from("waba_connections")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (!error && data) return (data as unknown as Row[]).map(toSummary);

  // Pre-migration: list what does exist rather than nothing.
  const { data: basic } = await supabase
    .from("waba_connections")
    .select(BASE)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  return ((basic ?? []) as unknown as BaseRow[]).map((row) => toSummary(fillMissing(row)));
}

/** Just the sendable ones, for a picker. */
export async function listActiveConnections(
  supabase: Client,
  orgId: string
): Promise<ConnectionSummary[]> {
  return (await listConnections(supabase, orgId)).filter(
    (connection) => connection.status === "active"
  );
}

export interface ResolveOptions {
  /** An explicit choice — a picker, or a bot pinned to one number. */
  connectionId?: string | null;
  /** Reply on the number the customer actually messaged. */
  conversationId?: string | null;
  /** Inbound webhooks know the number by Meta's id for it. */
  phoneNumberId?: string | null;
}

/**
 * Picks the number to act on, in a fixed order of precedence:
 *
 *   1. an explicit connection id
 *   2. the number the conversation happened on
 *   3. the workspace default
 *   4. the oldest active number
 *
 * Returning a reason rather than null: "no active WhatsApp number" and
 * "the number you picked is disabled" need different fixes, and a caller
 * that only gets null has to invent the wording for both.
 */
export async function resolveConnection(
  supabase: Client,
  orgId: string,
  options: ResolveOptions = {}
): Promise<ResolvedConnection | { error: string }> {
  const row = await findRow(supabase, orgId, options);
  if ("error" in row) return row;

  let accessToken: string;
  try {
    accessToken = decryptToken(row.access_token_encrypted);
  } catch {
    return {
      error:
        "The stored access token for this number could not be decrypted. Reconnect it under Integrations.",
    };
  }

  return { ...toSummary(row), accessToken };
}

type RowWithToken = Row & { access_token_encrypted: string };

async function findRow(
  supabase: Client,
  orgId: string,
  options: ResolveOptions
): Promise<RowWithToken | { error: string }> {
  // Tried with the migration's columns, then without. Sending must keep
  // working on a database that has not been migrated yet — a workspace
  // discovering the new columns are missing by having every message fail
  // is the worst possible way to learn it.
  const one = async (
    build: (select: string) => PromiseLike<{ data: unknown; error: unknown }>
  ): Promise<RowWithToken | null> => {
    const extended = await build(`${COLUMNS}, access_token_encrypted`);
    if (!extended.error && extended.data) {
      const rows = asRows(extended.data);
      return rows[0] ?? null;
    }
    const basic = await build(`${BASE}, access_token_encrypted`);
    if (basic.error || !basic.data) return null;
    const rows = asRows(basic.data);
    return rows[0] ? ({ ...fillMissing(rows[0]), access_token_encrypted: rows[0].access_token_encrypted } as RowWithToken) : null;
  };

  if (options.connectionId) {
    const row = await one((select) =>
      supabase
        .from("waba_connections")
        .select(select)
        .eq("org_id", orgId)
        .eq("id", options.connectionId!)
        .limit(1)
    );

    if (!row) return { error: "That WhatsApp number is not in this workspace." };
    if (row.status !== "active") {
      return {
        error: `The number ${describe(toSummary(row))} is ${row.status}, so it cannot send. Reconnect it under Integrations.`,
      };
    }
    return row;
  }

  if (options.phoneNumberId) {
    const row = await one((select) =>
      supabase
        .from("waba_connections")
        .select(select)
        .eq("phone_number_id", options.phoneNumberId!)
        .limit(1)
    );
    if (row) return row;
  }

  if (options.conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("connection_id")
      .eq("id", options.conversationId)
      .eq("org_id", orgId)
      .maybeSingle();

    // connection_id only exists after the migration; without it this step
    // is simply skipped and the default below answers.
    const pinned = (conversation as { connection_id?: string | null } | null)?.connection_id;
    if (pinned) {
      const row = await one((select) =>
        supabase
          .from("waba_connections")
          .select(select)
          .eq("id", pinned)
          .eq("status", "active")
          .limit(1)
      );
      // A conversation on a since-disabled number falls through to the
      // default rather than refusing to send at all.
      if (row) return row;
    }
  }

  // Default first, then oldest. limit(1) rather than maybeSingle() is the
  // whole point: several rows is the normal case now, not an error.
  const row = await one((select) => {
    const query = supabase
      .from("waba_connections")
      .select(select)
      .eq("org_id", orgId)
      .eq("status", "active");
    // Ordering by is_default is only possible once the column exists; the
    // basic pass sorts by age alone.
    return select.includes("is_default")
      ? query.order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(1)
      : query.order("created_at", { ascending: true }).limit(1);
  });

  if (!row) {
    return {
      error: "No active WhatsApp number in this workspace. Connect one under Integrations.",
    };
  }
  return row;
}

function asRows(data: unknown): Array<RowWithToken & BaseRow> {
  return (Array.isArray(data) ? data : [data]) as Array<RowWithToken & BaseRow>;
}

/** "Support (+91 92724 47307)", or the best label available. */
export function describe(connection: ConnectionSummary): string {
  const number = connection.displayPhoneNumber ?? connection.phoneNumberId;
  const name = connection.label ?? connection.verifiedName;
  return name ? `${name} (${number})` : number;
}

/** The short form for a picker option. */
export function optionLabel(connection: ConnectionSummary): string {
  const number = connection.displayPhoneNumber ?? `ID ${connection.phoneNumberId}`;
  const name = connection.label ?? connection.verifiedName;
  return name ? `${name} · ${number}` : number;
}
