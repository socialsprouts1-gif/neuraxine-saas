import { processDueJobs } from "@/lib/automation";

/**
 * Process due scheduled jobs (drip flow steps). Intended to be called on a
 * schedule by Vercel Cron, but also safe to hit on-demand from the UI.
 *
 *   GET|POST /api/cron/process
 */
export const dynamic = "force-dynamic";

async function run(): Promise<Response> {
  const processed = await processDueJobs();
  return Response.json({ ok: true, processed });
}

export const GET = run;
export const POST = run;
