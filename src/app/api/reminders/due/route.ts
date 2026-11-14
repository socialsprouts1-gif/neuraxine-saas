import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/org";

// What the watcher asks for every minute or so.
//
// Kept to pending reminders in a narrow window rather than the whole table:
// a workspace with a year of history should not send a year of rows down
// the wire to decide whether anything is due in the next five minutes.

export const dynamic = "force-dynamic";

/** How far ahead to look, so the poll interval can tighten before it fires. */
const HORIZON_MS = 30 * 60_000;

export async function GET(): Promise<NextResponse> {
  const ctx = await requireOrg();

  // Reminders are a gated feature. Polling from a workspace that does not
  // have it would be a small, permanent cost for something it cannot use.
  if (ctx.features.reminders === false) {
    return NextResponse.json({ reminders: [] });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reminders")
    .select("id, title, body, remind_at, status, contacts(name)")
    .eq("org_id", ctx.orgId)
    .eq("status", "pending")
    .lte("remind_at", new Date(Date.now() + HORIZON_MS).toISOString())
    .order("remind_at")
    .limit(50);

  if (error) {
    // An empty list rather than an error: a watcher that cannot read the
    // table should go quiet, not put a failure on every page in the app.
    console.error("Could not read due reminders", error);
    return NextResponse.json({ reminders: [] });
  }

  return NextResponse.json({
    reminders: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      remind_at: row.remind_at,
      status: row.status,
      contactName: (row.contacts as { name: string | null } | null)?.name ?? null,
    })),
  });
}
