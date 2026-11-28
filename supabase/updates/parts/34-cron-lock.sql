-- =====================================================================
-- A lock so two scheduled runs cannot overlap
-- =====================================================================
--
-- Vercel's Hobby plan runs a cron once a day. A reminder set for 11am
-- therefore went out at 3am the following morning, and a one-minute
-- delay took until the next sweep — which is what "it works but it's
-- too late" means.
--
-- The fix is a heartbeat every minute from outside Vercel. That turns a
-- job which ran once a day into one that can still be running when the
-- next minute arrives, and three of these jobs select their work, send
-- it, and only then mark it done:
--
--   * appointment reminders
--   * campaign recipients
--   * drip enrolments
--
-- Run two of those at once and the same customer gets the same message
-- twice. On a broadcast that is the whole list, twice.
--
-- Each engine could claim its own rows, and three separate claims is
-- three chances to get it subtly wrong in code that sends real messages
-- to real people. One lock in front of the runner is smaller, and it
-- covers every job including ones added later.

create table if not exists public.cron_locks (
  name text primary key,
  -- When the holder's claim expires. A run that dies without releasing
  -- does not wedge the schedule for ever; the next run after this time
  -- takes it. Hence a time rather than a boolean.
  locked_until timestamptz not null default now(),
  locked_at timestamptz,
  released_at timestamptz
);

insert into public.cron_locks (name, locked_until)
values ('jobs', now())
on conflict (name) do nothing;

-- Nobody but the service role. There is nothing here for a customer to
-- read, and a lock a browser could take is not a lock.
alter table public.cron_locks enable row level security;

notify pgrst, 'reload schema';
