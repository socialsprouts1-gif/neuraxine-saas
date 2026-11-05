-- Neura Chat database update 8
-- group-sending
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Run the numbered files in order. Safe to run more than once.

-- A default number for a group, and a record of what was sent to it.
--
-- A group here is a named segment of contacts, not a WhatsApp group.
-- Meta's Cloud API has no group endpoints at all — groups exist only in
-- the consumer and Business apps, and every tool that claims otherwise is
-- driving an unofficial library that gets numbers banned. So a "broadcast"
-- is one message to each member, sent individually, which is also what
-- reaches people who have muted a group.

alter table public.contact_groups
  -- Which number this segment is usually messaged from. A default rather
  -- than a constraint: the same people can be written to from either
  -- number, and the picker on the send still decides.
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null;

comment on column public.contact_groups.connection_id is
  'Default WhatsApp number for broadcasts to this group. Not a WhatsApp group — no such API exists.';

-- What went out to a group, so a second look answers "did I already send
-- this" without counting rows in the message log.
create table if not exists public.group_broadcasts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.contact_groups(id) on delete cascade,
  connection_id uuid references public.waba_connections(id) on delete set null,
  body text not null,
  sent_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists group_broadcasts_group_idx
  on public.group_broadcasts (group_id, created_at desc);

alter table public.group_broadcasts enable row level security;

drop policy if exists group_broadcasts_select on public.group_broadcasts;
create policy group_broadcasts_select on public.group_broadcasts
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists group_broadcasts_insert on public.group_broadcasts;
create policy group_broadcasts_insert on public.group_broadcasts
  for insert to authenticated with check (public.is_org_member(org_id));

notify pgrst, 'reload schema';
