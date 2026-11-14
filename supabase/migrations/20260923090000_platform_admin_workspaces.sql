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
  values (new_org_id, new.id, public.signup_role());

  insert into public.profiles (user_id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;

  insert into public.subscriptions (org_id, status, current_period_start, current_period_end)
  values (
    new_org_id,
    'trialing',
    now(),
    now() + make_interval(days => public.trial_days())
  )
  on conflict (org_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The repair path gives the same role as the signup trigger, so which of
-- the two happened to create a workspace is not something anybody can tell
-- from the outside.
create or replace function public.provision_org_for_user(
  target_user uuid,
  org_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing uuid;
  created uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user::text, 0));

  select org_id into existing
  from public.org_members
  where user_id = target_user
  order by created_at
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.organizations (name)
  values (coalesce(nullif(btrim(org_name), ''), 'My Organization'))
  returning id into created;

  insert into public.org_members (org_id, user_id, role)
  values (created, target_user, public.signup_role());

  insert into public.subscriptions (org_id, status, current_period_start, current_period_end)
  values (
    created,
    'trialing',
    now(),
    now() + make_interval(days => public.trial_days())
  )
  on conflict (org_id) do nothing;

  return created;
end;
$$;

revoke all on function public.provision_org_for_user(uuid, text) from public;
revoke all on function public.provision_org_for_user(uuid, text) from anon, authenticated;

notify pgrst, 'reload schema';
