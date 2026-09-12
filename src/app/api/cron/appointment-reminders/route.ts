import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { dispatchDueReminders } from "@/lib/appointment-reminders";

// The appointment reminder sweep's scheduled entry point.
//
// Drive it with a pinger sending Authorization: Bearer $CRON_SECRET, or a
// vercel.json cron on Pro. The same work is reachable from Appointments →
// Bot, so a workspace without a scheduler is not stuck — it just has to
// press the button.
//
// Worth running often: a reminder set for three hours before an appointment
// is only correct if something checks at least that often, and a sweep with
// nothing due is two queries and no sends.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await dispatchDueReminders();
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  return request.headers.get("x-vercel-cron") !== null;
}
