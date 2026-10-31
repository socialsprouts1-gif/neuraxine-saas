-- Transactional email: what was sent, to whom, and once only.
--
-- The unique index is the whole point. These messages go out from a cron
-- sweep, and a sweep that runs twice — a retried job, a redeploy mid-run —
-- would otherwise send the same "your trial ends tomorrow" again. Claiming
-- the row before the request means the second attempt loses the insert and
-- stops, rather than both checking, both finding nothing, and both sending.

create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  to_email text not null,
  kind text not null,
  -- Unique per thing-being-notified-about: for billing mail it carries the
  -- workspace and the period end, which is what gives a monthly plan
  -- exactly one renewal notice per month with nothing counting them.
  dedupe_key text not null,
  status text not null default 'sending',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists email_log_dedupe_key_idx on email_log (dedupe_key);
create index if not exists email_log_org_idx on email_log (org_id, created_at desc);

alter table email_log enable row level security;

-- Written only by the service role, from webhooks and cron. A tenant has
-- no reason to read another workspace's mail log, and no reason to read
-- its own through the API when the app already knows what it sent.
drop policy if exists "email_log service only" on email_log;
create policy "email_log service only" on email_log
  for all using (false) with check (false);
