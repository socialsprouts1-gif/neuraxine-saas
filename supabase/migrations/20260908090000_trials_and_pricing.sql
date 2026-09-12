-- =========================================================================
-- Trials, and the real price list
--
-- Two gaps. Signing up gave a workspace and no subscription at all, so every
-- account sat in an undefined billing state until staff assigned a plan by
-- hand — nothing on screen said a trial existed, when it ended, or what to
-- do next. And the seeded catalogue was placeholder pricing with no yearly
-- option.
-- =========================================================================

-- How long a new workspace gets before it has to pay. Kept in settings
-- rather than hardcoded in the trigger so it can be changed without a
-- migration.
insert into public.platform_settings (key, value, description)
values (
  'billing',
  '{"trial_days":14}'::jsonb,
  'Length of the free trial given to a new workspace, in days'
)
on conflict (key) do nothing;

-- =========================================================================
-- Price list. Monthly ₹1,000 / ₹1,500 / ₹2,000, yearly ₹8,000 / ₹10,000 /
-- ₹12,000. price_cents is paise, so ₹1,000 is 100000.
-- =========================================================================
update public.plans set price_cents = 100000, sort_order = 1 where slug = 'starter';
update public.plans set price_cents = 150000, sort_order = 2 where slug = 'growth';
update public.plans set price_cents = 200000, sort_order = 3 where slug = 'scale';

insert into public.plans
  (name, slug, description, price_cents, currency, billing_interval,
   message_limit, contact_limit, seat_limit, features, sort_order)
values
  ('Starter', 'starter-yearly', 'For teams getting started on WhatsApp', 800000, 'INR', 'yearly',
   1000, 500, 2,
   '["1,000 messages/mo","500 contacts","2 team seats","1 WhatsApp number","2 months free"]'::jsonb, 4),
  ('Growth', 'growth-yearly', 'For growing teams running campaigns', 1000000, 'INR', 'yearly',
   10000, 5000, 10,
   '["10,000 messages/mo","5,000 contacts","10 team seats","Campaigns & automations","7 months free"]'::jsonb, 5),
  ('Scale', 'scale-yearly', 'High volume, multiple numbers', 1200000, 'INR', 'yearly',
   100000, 50000, 50,
   '["100,000 messages/mo","50,000 contacts","50 team seats","Priority support","12 months free"]'::jsonb, 6)
on conflict (slug) do nothing;

-- =========================================================================
-- Every workspace starts on a trial.
-- =========================================================================
create or replace function public.trial_days()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    1,
    coalesce((select (value ->> 'trial_days')::integer from public.platform_settings
              where key = 'billing'), 14)
  );
$$;

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

  -- The trial. Without a row here the workspace has no billing state at all,
  -- and no screen can tell "hasn't started paying yet" from "lapsed".
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

-- Workspaces that predate this get the same trial, counted from now rather
-- than from signup: nobody should find themselves already expired because a
-- migration ran.
insert into public.subscriptions (org_id, status, current_period_start, current_period_end)
select o.id, 'trialing', now(), now() + make_interval(days => public.trial_days())
from public.organizations o
where not exists (select 1 from public.subscriptions s where s.org_id = o.id)
on conflict (org_id) do nothing;

notify pgrst, 'reload schema';
