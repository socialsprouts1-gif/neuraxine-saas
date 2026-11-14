-- A workspace created by provisioning gets a trial, like every other one.
--
-- There are two ways a workspace comes into existence and only one of them
-- was starting a trial. handle_new_user, the trigger on auth.users, creates
-- the organization, the membership and the trial subscription.
-- provision_org_for_user — the advisory-locked function the app calls when
-- a signed-in user turns out to have no membership — created the first two
-- and not the third.
--
-- A workspace with no subscriptions row has no billing state at all:
-- billingState reads it as "none" and deliberately says nothing, because
-- the alternative is accusing somebody of not paying when the real cause is
-- a database that has not been migrated. So the customer saw no trial
-- banner, no countdown, and would have been sent no trial email — the
-- entire billing lifecycle silently skipped them.

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

  -- The trial, on the same terms the signup trigger gives. Both paths now
  -- produce a workspace in the same state, which is the only way the
  -- billing screens can be trusted to mean what they say.
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

-- Anyone already caught by this gets their trial now, counted from today.
-- Dating it from signup would hand somebody an expired workspace for a bug
-- that was never theirs.
insert into public.subscriptions (org_id, status, current_period_start, current_period_end)
select o.id, 'trialing', now(), now() + make_interval(days => public.trial_days())
from public.organizations o
where not exists (select 1 from public.subscriptions s where s.org_id = o.id)
on conflict (org_id) do nothing;

notify pgrst, 'reload schema';
