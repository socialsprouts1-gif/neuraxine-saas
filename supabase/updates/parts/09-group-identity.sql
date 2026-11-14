-- Neura Chat database update 9
-- group-identity
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Run the numbered files in order. Safe to run more than once.

-- A group you can recognise, and the people in it who speak for the rest.
--
-- Still not a WhatsApp group. Meta's Cloud API has no group endpoints,
-- so nothing here creates one and nothing posts into one. What these
-- columns do is make a list of customers usable: a picture so a wall of
-- grey rows can be scanned, and a role so the two people who matter in a
-- group of two hundred can be told first.

alter table public.contact_groups
  -- One emoji. Rendered on a tile tinted with the group's colour when
  -- there is no uploaded logo.
  add column if not exists icon text,
  -- An https URL, usually a file uploaded to the media bucket. Takes
  -- precedence over the icon when both are set.
  add column if not exists image_url text;

comment on column public.contact_groups.icon is
  'One emoji shown on the group tile. Falls back to the name initials.';
comment on column public.contact_groups.image_url is
  'https URL of a logo. Shown instead of the icon when present.';

-- An admin here is a key contact, not a WhatsApp administrator — there is
-- nothing to administer. It marks the people who speak for the group, so
-- they can be pinned to the top of the list and messaged on their own.
alter table public.contact_group_members
  add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contact_group_members_role_check'
  ) then
    alter table public.contact_group_members
      add constraint contact_group_members_role_check
      check (role in ('admin', 'member'));
  end if;
end $$;

comment on column public.contact_group_members.role is
  'admin = key contact for this group. Not a WhatsApp group admin; no such API exists.';

create index if not exists contact_group_members_admin_idx
  on public.contact_group_members (group_id) where role = 'admin';

-- The table had select, insert and delete policies and no update policy.
-- Postgres does not raise on an update whose rows are filtered out by RLS
-- — it reports zero rows changed, which PostgREST returns as success — so
-- promoting somebody would have shown a green confirmation and changed
-- nothing at all.
drop policy if exists contact_group_members_update on public.contact_group_members;
create policy contact_group_members_update on public.contact_group_members
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

notify pgrst, 'reload schema';
