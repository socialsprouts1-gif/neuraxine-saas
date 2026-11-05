-- =====================================================================
-- How many Instagram accounts a plan may connect
-- =====================================================================
--
-- The same shape as number_limit, and for the same reason: a tier that
-- does not differ from the one below it is a price, not a plan.
--
-- Null means unlimited, which is what a workspace with no plan gets —
-- somebody waiting on billing should not be locked out of the thing
-- they are evaluating.

alter table public.plans
  add column if not exists instagram_limit integer;

comment on column public.plans.instagram_limit is
  'How many Instagram accounts this plan may connect. Null is unlimited.';

update public.plans set instagram_limit = 1 where slug in ('starter', 'starter-yearly');
update public.plans set instagram_limit = 2 where slug in ('growth', 'growth-yearly');
update public.plans set instagram_limit = 3 where slug in ('scale', 'scale-yearly');

-- The feature lists are what the pricing page shows, so a limit that is
-- enforced and not mentioned reads as the product losing a feature.
update public.plans
set features = features || '["1 Instagram account"]'::jsonb
where slug in ('starter', 'starter-yearly')
  and not features @> '["1 Instagram account"]'::jsonb;

update public.plans
set features = features || '["2 Instagram accounts"]'::jsonb
where slug in ('growth', 'growth-yearly')
  and not features @> '["2 Instagram accounts"]'::jsonb;

update public.plans
set features = features || '["3 Instagram accounts"]'::jsonb
where slug in ('scale', 'scale-yearly')
  and not features @> '["3 Instagram accounts"]'::jsonb;

notify pgrst, 'reload schema';
