import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorised } from "@/lib/cron-auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { withCronLock } from "@/lib/cron-lock";
import { dispatchDueCampaigns } from "@/lib/campaign-dispatch";
import { resumeParkedFlows } from "@/lib/flow-resume";
import { dispatchDueReminders } from "@/lib/appointment-reminders";
import { dispatchScheduledMessages } from "@/lib/scheduled-dispatch";
import { dispatchDueDrips } from "@/lib/drip-engine";
import { sweepInstagramFollowups } from "@/lib/instagram-followups";

// The heartbeat. Everything that is late if it waits.
//
// Vercel's Hobby plan allows one cron run a day, so /api/cron/run-all is
// called at 3am and that was the only thing driving the product. A
// reminder set for 11am went out at 3am the next morning. A message with
// a one-minute delay waited for the same sweep. Both were reported as
// "it works, but far too late", which is exactly right.
//
// This route is the one an outside pinger calls every minute. It holds
// only the jobs where a minute matters, because the alternative — the
// whole of run-all, every minute — would re-run invoice generation and
// the billing mail fourteen hundred times a day to no purpose.
//
// What stays daily: recurring invoices, billing emails, and the
// Instagram token refresh. None of them is late if it waits an hour,
// and two of them cost money or send mail.

export const dynamic = "force-dynamic";
// Shorter than run-all's. A heartbeat that runs for five minutes has
// stopped being a heartbeat, and the lock's expiry is set just past this.
export const maxDuration = 280;

const JOBS: Array<{ name: string; run: () => Promise<unknown> }> = [
  // Ordered by how annoying lateness is. A scheduled message has a time
  // somebody typed; a follow-up has a delay somebody chose.
  { name: "scheduled-messages", run: () => dispatchScheduledMessages() },
  { name: "appointment-reminders", run: () => dispatchDueReminders() },
  { name: "resume-flows", run: () => resumeParkedFlows() },
  { name: "drip-campaigns", run: () => dispatchDueDrips() },
  { name: "dispatch-campaigns", run: () => dispatchDueCampaigns() },
  { name: "instagram-followups", run: () => sweepInstagramFollowups() },
];

export async function GET(request: NextRequest) {
  if (!isCronAuthorised(request)) {
    // Which of the three it is.
    //
    // A bare "Unauthorized" leaves somebody guessing between a secret
    // that was never set, one set but not deployed, and one that does
    // not match what the caller sent — and the only place the answer
    // shows up is a 401 in a table of http responses. Saying whether
    // the server has a secret at all discloses nothing: it does not
    // help anybody in, and it immediately rules out two of the three.
    const configured = Boolean(process.env.CRON_SECRET);
    return NextResponse.json(
      {
        error: "Unauthorized",
        detail: configured
          ? "This deployment has a CRON_SECRET, and the Authorization header did not match it. Check the value in the heartbeat SQL matches Vercel exactly, with no quotes or spaces around it, and that it is sent as: Bearer <secret>."
          : "This deployment has no CRON_SECRET. Add it in Vercel under Settings, Environment Variables, then redeploy — a new value only reaches the running app on a new deployment.",
      },
      { status: 401 }
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const outcome = await withCronLock(async () => {
    const results: Array<{ job: string; ok: boolean; detail?: unknown; error?: string }> = [];

    for (const job of JOBS) {
      try {
        results.push({ job: job.name, ok: true, detail: await job.run() });
      } catch (error) {
        // One job failing must not abandon the rest: a stuck campaign
        // queue silently costing everybody their appointment reminders
        // is the coupling this loop exists to avoid.
        results.push({
          job: job.name,
          ok: false,
          error: error instanceof Error ? error.message : "Unknown failure",
        });
      }
    }

    return results;
  });

  // Another run still had the lock. A normal minute on a busy queue, and
  // a 200 because nothing went wrong — a pinger that retries this would
  // only queue up behind the same lock.
  if (outcome === null) {
    return NextResponse.json({ skipped: "a run was already in progress", at: new Date().toISOString() });
  }

  const failed = outcome.filter((result) => !result.ok).length;

  return NextResponse.json(
    { ran: outcome.length, failed, results: outcome, at: new Date().toISOString() },
    { status: failed === 0 ? 200 : 207 }
  );
}
