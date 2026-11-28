-- =====================================================================
-- THE HEARTBEAT — run this once, and scheduled things happen on time
-- =====================================================================
--
-- THE PROBLEM
--
-- Vercel's Hobby plan runs a scheduled job once a day. That is the whole
-- allowance. So the app woke at 3am, sent everything that had come due
-- in the previous twenty-four hours, and went back to sleep.
--
-- A reminder set for 11am went out at 3am the next morning. A message
-- with a one-minute delay waited for the same sweep. Nothing was broken
-- — there was simply nothing awake to notice the time.
--
-- THE FIX
--
-- Supabase can call the app every minute, for free, from the database
-- you already have. No third-party cron service, no card, nothing
-- leaving your own infrastructure.
--
-- BEFORE YOU RUN THIS
--
-- 1. In Vercel, add an environment variable called CRON_SECRET. The
--    value is yours to choose: a long random string, 30+ characters.
--    This is what stops a stranger making your app send messages by
--    guessing a URL.
-- 2. Redeploy, or the app will not know the value yet.
-- 3. Replace PASTE-YOUR-CRON-SECRET-HERE below with the same string.
--
-- Keep that string out of screenshots and out of chat.


-- The two extensions. Both ship with Supabase; this only switches them
-- on. pg_cron keeps the schedule, pg_net makes the call.
create extension if not exists pg_cron;
create extension if not exists pg_net;


-- Remove an older copy before adding this one, so running the file twice
-- does not leave you with two heartbeats calling the app in parallel.
select cron.unschedule('neura-heartbeat')
where exists (select 1 from cron.job where jobname = 'neura-heartbeat');


select cron.schedule(
  'neura-heartbeat',
  '* * * * *',
  $$
    select net.http_get(
      url := 'https://www.neurachat.in/api/cron/tick',
      headers := '{"Authorization": "Bearer PASTE-YOUR-CRON-SECRET-HERE"}'::jsonb,
      timeout_milliseconds := 55000
    );
  $$
);


-- CHECKING IT WORKS
--
-- A minute after running this, the schedule should show one row:
--
--   select jobname, schedule, active from cron.job;
--
-- And the recent calls, newest first. status 200 is the app answering:
--
--   select status_code, content, created
--   from net._http_response
--   order by created desc
--   limit 5;
--
-- Read `content` on a 401 — it says which of the three it is: no secret
-- on the deployment, a secret that does not match what was sent, or a
-- value added to Vercel without redeploying since. Do not skip the
-- content column: the status alone cannot tell them apart.
--
-- A body saying "a run was already in progress" is not a fault. It
-- means the previous minute's work was still going and this call stood
-- aside, which is the lock doing its job.


-- WHAT STILL RUNS ONCE A DAY
--
-- Vercel keeps calling /api/cron/run-all at 3am for recurring invoices,
-- billing emails and the Instagram token refresh. None of those is late
-- if it waits an hour, and two of them cost money or send mail, so they
-- are deliberately not on the minute.


-- TO STOP THE HEARTBEAT
--
--   select cron.unschedule('neura-heartbeat');
