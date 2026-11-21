import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isCronAuthorised } from "@/lib/cron-auth";
import { resumeParkedFlows } from "@/lib/flow-resume";

// The scheduler behind the Delay node.
//
// A flow that hits a delay longer than we run inline parks with a time and
// a node to come back to. This is what comes back for it.
//
// The work lives in lib/flow-resume so the one URL that drives every job
// can call it directly rather than over HTTP. This route stays because an
// external pinger needs an address:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://your-domain/api/cron/resume-flows

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await resumeParkedFlows();
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
