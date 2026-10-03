-- Neura Chat database update 2
-- admin-sees-every-workspace (part 1 of 3)
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Run the numbered files in order. Safe to run more than once.

-- A platform admin can see and administer every workspace.
--
-- organizations and org_members were the only two tables left whose
-- policies read `is_org_member` / `is_org_admin` with no platform-admin
-- exception. Every other tenant table already has one. The effect was that
-- the admin panel showed staff their own workspaces and nobody else's:
-- /admin/organizations listed the handful the admin happened to belong to,
-- so three fresh signups appeared to have created nothing at all.
--
-- The writes failed worse than the reads. Postgres does not error on an
-- UPDATE whose rows are filtered out by RLS — it reports zero rows changed,
-- which PostgREST returns as success. So changing somebody's role, editing
-- feature overrides and suspending a workspace all came back with a green
-- confirmation and changed nothing. "It is not changing" with no error on
-- screen is exactly what that looks like from the outside.

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.is_platform_admin());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_admin(id) or public.is_platform_admin())
  with check (public.is_org_admin(id) or public.is_platform_admin());

drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());

drop policy if exists org_members_insert on public.org_members;
create policy org_members_insert on public.org_members
  for insert to authenticated
  with check (public.is_org_admin(org_id) or public.is_platform_admin());

drop policy if exists org_members_update on public.org_members;
create policy org_members_update on public.org_members
  for update to authenticated
  using (public.is_org_admin(org_id) or public.is_platform_admin())
  with check (public.is_org_admin(org_id) or public.is_platform_admin());

drop policy if exists org_members_delete_admin on public.org_members;
create policy org_members_delete_admin on public.org_members
  for delete to authenticated
  using (public.is_org_admin(org_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------

-- What role the person who creates a workspace is given.
--
-- Settable, because it is a policy decision rather than a fact about the
-- software. It defaults to owner, and that default is deliberate: owner and
-- admin are the roles that may connect a WhatsApp number, open billing,
-- manage integrations and invite anybody. A workspace whose only member is
-- a plain member cannot be set up by the person who just signed up for it —
-- they would have to ask support before they could send a single message,
-- which is a strange way to start a seven-day trial.
--
-- Change it from Admin → Settings → New signups when that is what you want.
create or replace function public.signup_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select value ->> 'default_role'
       from public.platform_settings
      where key = 'signups'
        and value ->> 'default_role' in ('owner', 'admin', 'member')),
    'owner'
  );
$$;

grant execute on function public.signup_role() to authenticated;
