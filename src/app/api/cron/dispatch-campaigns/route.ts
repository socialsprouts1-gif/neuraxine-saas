import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isCronAuthorised } from "@/lib/cron-auth";
import { dispatchDueCampaigns } from "@/lib/campaign-dispatch";

// The campaign dispatcher's scheduled entry point.
//
// Drive it with a pinger sending Authorization: Bearer $CRON_SECRET, or a
// vercel.json cron on Pro. The same work is reachable from the Campaigns
// screen, so a workspace without a scheduler is not stuck.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await dispatchDueCampaigns();
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
