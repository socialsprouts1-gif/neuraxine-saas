import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { runDueRecurringInvoices } from "@/lib/invoice-engine";
import { todayIn } from "@/lib/invoices";

// The recurring invoice sweep's scheduled entry point.
//
// Drive it with a pinger sending Authorization: Bearer $CRON_SECRET, or a
// vercel.json cron on Pro. The same work is reachable from Invoice →
// Recurring, so a workspace without a scheduler is not stuck — it just has
// to press the button.
//
// Once a day is enough: a schedule fires on a date, not at a time.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const origin = `https://${request.headers.get("host") ?? "localhost:3000"}`;

  // Every workspace with a schedule that has come due. Read here rather than
  // inside the sweep because the sweep is per-org — it is also called from a
  // button, where the org comes from the session.
  const { data: schedules, error } = await supabase
    .from("recurring_invoices")
    .select("org_id, next_run_on")
    .eq("is_active", true)
    .lte("next_run_on", todayIn("Asia/Kolkata"))
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orgIds = [...new Set((schedules ?? []).map((row) => row.org_id))];
  if (orgIds.length === 0) {
    return NextResponse.json({ orgs: 0, raised: 0, sent: 0, failed: 0 });
  }

  const totals = { orgs: orgIds.length, due: 0, raised: 0, sent: 0, failed: 0 };
  const problems: string[] = [];

  for (const orgId of orgIds) {
    // Each workspace's own timezone decides what "today" means for its
    // schedules; the query above uses IST only to narrow the candidates.
    const result = await runDueRecurringInvoices(supabase, orgId, origin);
    totals.due += result.due;
    totals.raised += result.raised;
    totals.sent += result.sent;
    totals.failed += result.failed;
    if (result.firstError) problems.push(`${orgId}: ${result.firstError}`);
    if (result.error) problems.push(`${orgId}: ${result.error}`);
  }

  return NextResponse.json({ ...totals, problems: problems.slice(0, 10) });
}

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return request.headers.get("x-vercel-cron") !== null;
}
