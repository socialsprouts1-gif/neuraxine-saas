import type { NextRequest } from "next/server";

// Who is allowed to trigger scheduled work.
//
// Two callers, because there are two ways this product gets a heartbeat.
// Vercel signs its own cron invocations with a header nobody outside the
// platform can set. Everything else — cron-job.org, GitHub Actions, a
// server the customer already runs, curl — proves itself with a shared
// secret. Vercel's Hobby plan runs crons once a day at most, which is not
// a schedule a campaign queue can live on, so the second route is not a
// fallback: for most deployments it is the real one.
//
// Lived in four copies, one per cron route, which is three too many for a
// function that decides who may make the product send messages.

export function isCronAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;

  // Vercel sets this on its own scheduled invocations and strips it from
  // anything arriving from outside.
  return request.headers.get("x-vercel-cron") !== null;
}
