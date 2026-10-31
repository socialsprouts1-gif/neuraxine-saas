-- =====================================================================
-- Instagram automations: buttons, a follow gate, and honest counters
-- =====================================================================
--
-- The table is still called instagram_comment_rules because that is what
-- it was when it only did comments. Renaming a live table to improve a
-- name is not worth the outage, so the name is historical and the screen
-- calls these automations.
--
-- What is new is everything that makes an automation worth measuring:
-- buttons on the message, a gate that asks for a follow first, a prompt
-- for an email address, and counters for each so a screen can say what
-- an automation actually did rather than that it exists.

alter table public.instagram_comment_rules
  -- 'comment' fires on a comment; 'dm' fires on a direct message whose
  -- text matches. The default is what every existing row already is.
  add column if not exists trigger_type text not null default 'comment',
  -- Up to three. Each is {label, url} for a link, or {label, payload}
  -- for one the webhook hears about. Instagram refuses a fourth.
  add column if not exists buttons jsonb not null default '[]'::jsonb,
  -- Ask the person to follow before sending the real message.
  add column if not exists follow_gate boolean not null default false,
  add column if not exists follow_gate_message text,
  -- Ask for an email address in the thread and keep what they type.
  add column if not exists ask_email boolean not null default false,
  add column if not exists ask_email_message text,
  -- Shown on the list so an automation is recognisable by its post
  -- rather than by a media id nobody can read.
  add column if not exists media_thumbnail_url text,
  add column if not exists media_caption text,
  -- Counted separately because they answer different questions. sent_count
  -- already exists and means "messages delivered"; a run is a trigger that
  -- matched, which can be larger when a send fails.
  add column if not exists run_count integer not null default 0,
  add column if not exists button_click_count integer not null default 0,
  add column if not exists follower_gain_count integer not null default 0,
  add column if not exists email_count integer not null default 0;

create index if not exists instagram_rules_trigger_idx
  on public.instagram_comment_rules (org_id, trigger_type, is_active);

-- --- where a button click is counted -------------------------------------
--
-- Instagram reports nothing about a web link button being tapped, so a
-- tracked link points here instead and this redirects. That is the only
-- way the number on the screen can be true rather than estimated.
--
-- The id is short and random rather than sequential: it appears in a URL
-- a stranger receives, and a sequential one invites walking the list.

create table if not exists public.instagram_links (
  id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  rule_id uuid references public.instagram_comment_rules(id) on delete cascade,
  label text,
  target_url text not null,
  click_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists instagram_links_rule_idx
  on public.instagram_links (rule_id);

-- --- the follow gate's memory --------------------------------------------
--
-- A gated automation sends the ask, then has to remember what it was
-- going to send once the person follows. Without this the second half of
-- the conversation has no idea which automation started it.

create table if not exists public.instagram_pending_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.instagram_connections(id) on delete cascade,
  rule_id uuid references public.instagram_comment_rules(id) on delete cascade,
  ig_user_id text not null,
  stage text not null default 'awaiting_follow',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create unique index if not exists instagram_pending_unique
  on public.instagram_pending_sends (org_id, ig_user_id, rule_id);

-- --- captured email addresses --------------------------------------------

alter table public.contacts
  add column if not exists email text;

-- --- what happened, per automation ---------------------------------------
--
-- The events table already logs comments. Direct-message triggers and
-- button clicks belong in the same log, so the screen has one timeline
-- rather than three.

alter table public.instagram_comment_events
  add column if not exists kind text not null default 'comment';

alter table public.instagram_comment_events
  alter column comment_id drop not null;

-- The unique index on comment_id was what stopped Meta's retries sending
-- a person the same DM four times. It has to keep doing that, while
-- letting many rows have no comment id at all.
drop index if exists instagram_comment_events_comment_idx;
create unique index if not exists instagram_events_comment_unique
  on public.instagram_comment_events (comment_id)
  where comment_id is not null;

-- Who the event was about.
--
-- Without it the log can say a message was sent but not to whom, which
-- makes "credit the automation this person was answering" impossible —
-- and crediting the most recent automation for anybody is a number that
-- looks right and is wrong.
alter table public.instagram_comment_events
  add column if not exists ig_user_id text;

create index if not exists instagram_events_person_idx
  on public.instagram_comment_events (org_id, ig_user_id, created_at desc);

-- --- row security ---------------------------------------------------------

alter table public.instagram_links enable row level security;
alter table public.instagram_pending_sends enable row level security;

drop policy if exists instagram_links_rw on public.instagram_links;
create policy instagram_links_rw on public.instagram_links
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

drop policy if exists instagram_pending_read on public.instagram_pending_sends;
create policy instagram_pending_read on public.instagram_pending_sends
  for select using (public.is_org_member(org_id));

notify pgrst, 'reload schema';
