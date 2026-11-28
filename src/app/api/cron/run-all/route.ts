import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorised } from "@/lib/cron-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { withCronLock } from "@/lib/cron-lock";
import { dispatchDueCampaigns } from "@/lib/campaign-dispatch";
import { resumeParkedFlows } from "@/lib/flow-resume";
import { dispatchDueReminders } from "@/lib/appointment-reminders";
import { runAllDueRecurringInvoices } from "@/lib/invoice-engine";
import { sweepBillingEmails } from "@/lib/billing-emails";
import { dispatchScheduledMessages } from "@/lib/scheduled-dispatch";
import { dispatchDueDrips } from "@/lib/drip-engine";
import { sweepInstagramFollowups } from "@/lib/instagram-followups";
import { refreshInstagramTokens } from "@/lib/instagram-refresh";

// One URL that drives every scheduled job.
//
// It used to reach the other routes over HTTP, which meant this endpoint
// had to authenticate to itself — and since Vercel's own cron header is
// stripped from an outgoing request, the only way to do that was a shared
// secret. Without CRON_SECRET set, every job answered 401 and the whole
// run refused with a 503. Vercel was calling this on schedule and nothing
// was happening, which is indistinguishable from the schedule not existing.
//
// Now it calls the work directly. No secret is needed for Vercel's own
// cron, there are no HTTP round trips, and a job cannot fail for a reason
// that has nothing to do with what it does.

export const dynamic = "force-dynamic";
// Five jobs in one invocation, and a campaign queue can be long.
export const maxDuration = 300;

interface JobResult {
  job: string;
  ok: boolean;
  detail?: unknown;
  error?: string;
}

const JOBS: Array<{ name: string; run: (origin: string) => Promise<unknown> }> = [
  { name: "dispatch-campaigns", run: () => dispatchDueCampaigns() },
  { name: "resume-flows", run: () => resumeParkedFlows() },
  { name: "appointment-reminders", run: () => dispatchDueReminders() },
  { name: "recurring-invoices", run: (origin) => runAllDueRecurringInvoices(origin) },
  { name: "scheduled-messages", run: () => dispatchScheduledMessages() },
  { name: "drip-campaigns", run: () => dispatchDueDrips() },
  { name: "billing-emails", run: () => sweepBillingEmails() },
  { name: "instagram-followups", run: () => sweepInstagramFollowups() },
  // Instagram access lasts sixty days and Meta will extend it for the
  // asking — but only while it is still valid. Nothing was asking, so
  // every account worked for two months and then quietly stopped.
  { name: "instagram-token-refresh", run: () => refreshInstagramTokens() },
];

export async function GET(request: NextRequest) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const origin = request.nextUrl.origin;

  // The same lock the minute-by-minute heartbeat takes. This runs the
  // same queues, so the two overlapping would reintroduce precisely the
  // double-send the lock exists to prevent — and the daily run is the
  // one most likely to be long.
  const results = await withCronLock(async () => {
    const collected: JobResult[] = [];

    for (const job of JOBS) {
      try {
        collected.push({ job: job.name, ok: true, detail: await job.run(origin) });
      } catch (error) {
        // One job's failure must not abandon the rest. A stuck invoice run
        // silently costing everybody their trial reminders is exactly the
        // coupling this loop exists to avoid.
        collected.push({
          job: job.name,
          ok: false,
          error: error instanceof Error ? error.message : "Unknown failure",
        });
      }
    }

    return collected;
  });

  if (results === null) {
    return NextResponse.json({
      skipped: "a run was already in progress",
      at: new Date().toISOString(),
    });
  }

  const failed = results.filter((result) => !result.ok).length;

  // 207 when some worked and some did not: a plain 500 tells a pinger to
  // retry everything, including the jobs that already ran.
  return NextResponse.json(
    { ran: results.length, failed, results, at: new Date().toISOString() },
    { status: failed === 0 ? 200 : 207 }
  );
}
