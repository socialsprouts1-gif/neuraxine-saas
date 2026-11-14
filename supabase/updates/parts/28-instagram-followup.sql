-- =====================================================================
-- A second message, a little later
-- =====================================================================
--
-- One message is an answer. Two is a conversation — and the second one,
-- sent a few minutes after somebody has read the first, is where the
-- reply usually comes from.
--
-- Sent on a delay rather than immediately, because two messages landing
-- in the same second read as a malfunction. Null delay means "straight
-- after", which is what somebody who only wants a second paragraph
-- expects.

alter table public.instagram_comment_rules
  add column if not exists followup_message text,
  add column if not exists followup_delay_minutes integer not null default 10,
  add column if not exists followup_count integer not null default 0;

-- --- what is owed, and when ----------------------------------------------
--
-- A queue rather than a timer in the running process: a send due in ten
-- minutes must survive a deploy, and a serverless function that has
-- already returned cannot send anything.

create table if not exists public.instagram_followups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.instagram_connections(id) on delete cascade,
  rule_id uuid references public.instagram_comment_rules(id) on delete cascade,
  ig_user_id text not null,
  body text not null,
  due_at timestamptz not null,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

-- One pending follow-up per person per automation. Somebody who
-- comments three times on the same post gets one follow-up, not three.
create unique index if not exists instagram_followups_pending
  on public.instagram_followups (org_id, rule_id, ig_user_id)
  where sent_at is null;

create index if not exists instagram_followups_due
  on public.instagram_followups (due_at)
  where sent_at is null;

alter table public.instagram_followups enable row level security;

drop policy if exists instagram_followups_read on public.instagram_followups;
create policy instagram_followups_read on public.instagram_followups
  for select using (public.is_org_member(org_id));

notify pgrst, 'reload schema';
