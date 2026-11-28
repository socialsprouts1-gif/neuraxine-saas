-- =========================================================================
-- Unlimited messages and contacts; the number count is the real limit
-- =========================================================================
-- The tiers were priced on message and contact allowances. They are not
-- any more: every plan gets unlimited of both, and what separates them is
-- how many WhatsApp numbers and team seats you get.
--
-- That makes number_limit the one thing the plans actually differ on, so
-- it has to be enforced rather than printed on a card — three prices for
-- the same product is not a price list. connectWaba checks it now, so the
-- column has to exist before the plan rows claim it.
alter table public.plans
  add column if not exists number_limit integer;

comment on column public.plans.number_limit is
  'How many WhatsApp numbers this plan may connect. Null means unlimited.';

-- Null is unlimited everywhere else in this schema, so clearing these two
-- is the whole of "unlimited messages, unlimited contacts".
update public.plans
set message_limit = null,
    contact_limit = null
where is_active;

-- Starter: one number, one person.
update public.plans
set seat_limit = 1,
    number_limit = 1,
    features = '[
      "Unlimited messages",
      "Unlimited contacts",
      "1 WhatsApp number",
      "1 team seat",
      "AI chatbots & FAQ bot",
      "Shared inbox"
    ]'::jsonb
where slug in ('starter', 'starter-yearly');

update public.plans
set seat_limit = 5,
    number_limit = 2,
    features = '[
      "Unlimited messages",
      "Unlimited contacts",
      "2 WhatsApp numbers",
      "5 team seats",
      "Campaigns, drip & automations",
      "Commerce, catalogue & payments",
      "WhatsApp forms & appointments"
    ]'::jsonb
where slug in ('growth', 'growth-yearly');

update public.plans
set seat_limit = 15,
    number_limit = 5,
    features = '[
      "Unlimited messages",
      "Unlimited contacts",
      "5 WhatsApp numbers",
      "15 team seats",
      "Everything in Growth",
      "White label & custom domain",
      "Priority support"
    ]'::jsonb
where slug in ('scale', 'scale-yearly');

notify pgrst, 'reload schema';
