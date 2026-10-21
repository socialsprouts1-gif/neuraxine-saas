-- =========================================================================
-- Inbox: assignment, unread tracking, opt-in, and teammate identities
--
-- The inbox could show conversations and send replies, but it had no way to
-- say who owns a thread, which ones are new, or who on the team is who.
-- =========================================================================

alter table public.conversations
  -- Null means unassigned, which is a real state the filter menu offers —
  -- not a missing value.
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  -- When the thread was last opened by anyone on the team. Unread is derived
  -- from this against last_message_at rather than stored as a counter, so it
  -- can never drift out of step with the messages themselves.
  add column if not exists last_read_at timestamptz;

create index if not exists conversations_assigned_to_idx
  on public.conversations(org_id, assigned_to);

-- =========================================================================
-- profiles — the readable identity behind a user id.
--
-- auth.users is not reachable under RLS, so every screen that wanted to name
-- a teammate had to go through the service role. This mirrors just the
-- display fields, and org members can read each other's.
-- =========================================================================
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing accounts predate the trigger below, so bring them in.
insert into public.profiles (user_id, email, full_name, avatar_url)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name'),
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;

-- SECURITY DEFINER so the policy below can read org_members without
-- re-entering that table's own RLS, which would recurse.
create or replace function public.shares_org_with(other_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.org_members mine
    join public.org_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid()
      and theirs.user_id = other_user
  );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.shares_org_with(user_id));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Extend the signup trigger to fill it. Same body as before plus the
-- profile insert, so account creation stays one atomic transaction.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  org_name text;
begin
  org_name := coalesce(
    new.raw_user_meta_data ->> 'org_name',
    new.raw_user_meta_data ->> 'full_name',
    split_part(new.email, '@', 1),
    'My Organization'
  );

  insert into public.organizations (name)
  values (org_name)
  returning id into new_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  insert into public.profiles (user_id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;
