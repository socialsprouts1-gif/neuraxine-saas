import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isCronAuthorised } from "@/lib/cron-auth";
import { runAllDueRecurringInvoices } from "@/lib/invoice-engine";

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
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = `https://${request.headers.get("host") ?? "localhost:3000"}`;
  const result = await runAllDueRecurringInvoices(origin);
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
