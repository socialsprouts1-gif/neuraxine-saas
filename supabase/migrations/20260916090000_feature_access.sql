-- =========================================================================
-- Feature access — which screens a workspace is allowed to see.
--
-- Three layers, each overriding the last: a platform default, the plan, and
-- an override on the workspace itself. Everything is on unless something
-- says otherwise, because the failure that matters is the wrong "off":
-- a feature wrongly left on costs nothing, while one wrongly switched off
-- takes a screen away from a paying customer with no error they can act on.
--
-- The keys are defined in src/lib/features.ts, which is also what validates
-- them — storing unknown keys is harmless, and they are dropped on read.
-- =========================================================================

-- Per-workspace overrides. {} means "whatever the plan says".
alter table public.organizations
  add column if not exists feature_overrides jsonb not null default '{}'::jsonb;

comment on column public.organizations.feature_overrides is
  'Per-workspace feature on/off, as {key: boolean}. Wins over the plan. Empty means no override.';

-- Why this workspace is suspended, if it is. A suspended workspace can
-- still sign in and see Billing — locking someone out of the page that
-- explains the problem is how a late payment becomes a lost customer.
alter table public.organizations
  add column if not exists suspended_at timestamptz;
alter table public.organizations
  add column if not exists suspended_reason text;

comment on column public.organizations.suspended_at is
  'Set when platform staff suspend the workspace. Billing and Settings stay reachable.';

-- What a plan includes. An empty array means everything — a plan row
-- written before this existed must not silently strip every screen from
-- the customers already on it.
alter table public.plans
  add column if not exists feature_keys text[] not null default '{}'::text[];

comment on column public.plans.feature_keys is
  'Features this tier includes. Empty means all of them.';

-- The platform-wide default for a new workspace, stored like every other
-- platform setting so one screen edits all of them.
insert into public.platform_settings (key, value, description)
values (
  'feature_defaults',
  '{}'::jsonb,
  'Features a new workspace starts with, as {key: boolean}. Empty means all on.'
)
on conflict (key) do nothing;

-- =========================================================================
-- One organization per signup, not four.
--
-- requireOrg() provisions an organization for any authenticated user who
-- has no membership. Next renders a page in parallel with its layout, so
-- several of those run at once for the same user, and each one inserted its
-- own organization — a single signup could end up owning four identical
-- workspaces, splitting its data across them.
--
-- An advisory lock keyed on the user serialises them: the first caller
-- creates, the rest wait and then find what it created. The lock is held to
-- the end of the transaction and needs no cleanup.
-- =========================================================================
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
  -- Two callers for the same user queue here; different users never wait
  -- on each other.
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
  values (created, target_user, 'owner');

  return created;
end;
$$;

revoke all on function public.provision_org_for_user(uuid, text) from public;
revoke all on function public.provision_org_for_user(uuid, text) from anon, authenticated;

comment on function public.provision_org_for_user(uuid, text) is
  'Idempotent per user under an advisory lock. Service role only — the caller must already have authenticated the user.';
