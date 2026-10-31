-- =========================================================================
-- Drip campaigns — follow-up sequences people walk through one at a time
-- =========================================================================
-- Not the same thing as a campaign, which is why it is not a column on
-- one. A campaign picks an audience now and sends to all of them
-- together. A drip has no audience: people join it one at a time, by
-- messaging a keyword, by an agent adding them, or by an API call from a
-- website form — and each of them is at a different point in the sequence
-- at any moment.
--
-- So the unit of state is the enrolment, not the campaign. One row per
-- person per sequence, carrying which step they are on and when the next
-- one is due, and the dispatcher is a loop over rows that have come due.

create table if not exists public.drip_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  -- How people get in.
  trigger_type text not null default 'manual'
    check (trigger_type in ('manual', 'keyword', 'api')),
  trigger_keywords text[] not null default '{}',
  -- How they get out. Two separate questions: a nurture sequence wants to
  -- stop the moment a human is talking, and a reminder sequence wants to
  -- keep going until the thing is actually done.
  exit_on_keyword boolean not null default false,
  exit_keywords text[] not null default '{}',
  exit_on_reply boolean not null default false,
  -- What to do when somebody joins after a timed step's hour has passed.
  skip_missed_steps boolean not null default false,
  time_zone text not null default 'Asia/Kolkata',
  -- Which number the whole sequence sends from. Null means the default.
  connection_id uuid references public.waba_connections(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drip_campaigns_org_idx
  on public.drip_campaigns(org_id, created_at desc);

-- The keyword trigger is matched on every inbound message, so the lookup
-- has to be cheap and scoped to the sequences that are actually running.
create index if not exists drip_campaigns_live_idx
  on public.drip_campaigns(org_id, status)
  where status = 'active';

create table if not exists public.drip_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.drip_campaigns(id) on delete cascade,
  -- 1-based, and the first one goes out the moment somebody joins.
  step_index integer not null,
  template_id uuid references public.message_templates(id) on delete set null,
  variables text[] not null default '{}',
  -- The gap *after* this step, before the next. Never read on the last
  -- one, because nothing follows it.
  wait_kind text not null default 'duration'
    check (wait_kind in ('duration', 'time_of_day')),
  wait_minutes integer not null default 1440,
  -- For a timed step: minutes past midnight in the campaign's zone.
  send_at_minutes integer not null default 600
    check (send_at_minutes >= 0 and send_at_minutes < 1440),
  send_at_days integer not null default 1,
  created_at timestamptz not null default now(),
  unique (campaign_id, step_index)
);

create index if not exists drip_steps_campaign_idx
  on public.drip_steps(campaign_id, step_index);

create table if not exists public.drip_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.drip_campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  -- Kept beside contact_id so a deleted contact cannot orphan a sequence
  -- half way through — the same reason scheduled_messages carries it.
  wa_id text not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'exited', 'failed')),
  -- The step that goes out next, and when. These two are the whole state
  -- machine: the dispatcher reads rows whose time has come and nothing else.
  next_step_index integer not null default 1,
  next_send_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text,
  exited_reason text,
  enrolled_via text not null default 'manual'
    check (enrolled_via in ('manual', 'keyword', 'api', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One run through a sequence per person. Joining twice would mean two
  -- copies of every message, which is the complaint that gets a number
  -- blocked rather than a feature anybody asked for.
  unique (campaign_id, wa_id)
);

-- The dispatcher's only query: active enrolments whose time has come.
create index if not exists drip_enrollments_due_idx
  on public.drip_enrollments(next_send_at)
  where status = 'active';

create index if not exists drip_enrollments_campaign_idx
  on public.drip_enrollments(campaign_id, status);

-- An inbound message has to find every sequence this number is in, to
-- apply the exit rules.
create index if not exists drip_enrollments_wa_idx
  on public.drip_enrollments(org_id, wa_id)
  where status = 'active';

-- --- row level security ---------------------------------------------------
-- The same shape as every other tenant table: your own workspace's rows,
-- and nobody else's. The dispatcher runs as the service role and is not
-- subject to these.

alter table public.drip_campaigns enable row level security;
alter table public.drip_steps enable row level security;
alter table public.drip_enrollments enable row level security;

drop policy if exists drip_campaigns_own on public.drip_campaigns;
create policy drip_campaigns_own on public.drip_campaigns
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists drip_steps_own on public.drip_steps;
create policy drip_steps_own on public.drip_steps
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists drip_enrollments_own on public.drip_enrollments;
create policy drip_enrollments_own on public.drip_enrollments
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- Keeps updated_at honest without every caller remembering to set it.
create or replace function public.touch_drip_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists drip_campaigns_touch on public.drip_campaigns;
create trigger drip_campaigns_touch
  before update on public.drip_campaigns
  for each row execute function public.touch_drip_updated_at();

drop trigger if exists drip_enrollments_touch on public.drip_enrollments;
create trigger drip_enrollments_touch
  before update on public.drip_enrollments
  for each row execute function public.touch_drip_updated_at();
