-- Platform administration and billing layer.
--
-- Everything above this migration is tenant-scoped: a user reaches rows only
-- through org_members. This layer adds a second, orthogonal axis — platform
-- staff who operate the service itself and can see across every tenant.
-- That privilege is granted by a row in platform_admins and nothing else.

-- =========================================================================
-- platform_admins
-- =========================================================================
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- security definer so policies can call it without recursing through
-- platform_admins' own RLS.
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins a where a.user_id = auth.uid()
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

alter table public.platform_admins enable row level security;

-- Readable so the app can decide whether to show the admin nav. Deliberately
-- no insert/update/delete policy for `authenticated`: promoting a platform
-- admin is done out-of-band (SQL editor / service role), never from the app,
-- so an admin account cannot be created by anything the browser can reach.
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- =========================================================================
-- plans — subscription catalogue
-- =========================================================================
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'INR',
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'yearly')),
  message_limit integer,
  contact_limit integer,
  seat_limit integer,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;

-- The catalogue is public to signed-in users (pricing page, upgrade flow);
-- only platform staff can change it.
create policy plans_select on public.plans
  for select to authenticated using (true);
create policy plans_insert on public.plans
  for insert to authenticated with check (public.is_platform_admin());
create policy plans_update on public.plans
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy plans_delete on public.plans
  for delete to authenticated using (public.is_platform_admin());

-- =========================================================================
-- add_ons — optional paid extras
-- =========================================================================
create table if not exists public.add_ons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'INR',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.add_ons enable row level security;

create policy add_ons_select on public.add_ons
  for select to authenticated using (true);
create policy add_ons_insert on public.add_ons
  for insert to authenticated with check (public.is_platform_admin());
create policy add_ons_update on public.add_ons
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy add_ons_delete on public.add_ons
  for delete to authenticated using (public.is_platform_admin());

-- =========================================================================
-- subscriptions — one active plan per org
-- =========================================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_plan_id_idx on public.subscriptions(plan_id);

alter table public.subscriptions enable row level security;

-- Members see their own org's subscription; only platform staff mutate it,
-- so a tenant cannot promote itself onto a higher plan.
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
create policy subscriptions_insert on public.subscriptions
  for insert to authenticated with check (public.is_platform_admin());
create policy subscriptions_update on public.subscriptions
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy subscriptions_delete on public.subscriptions
  for delete to authenticated using (public.is_platform_admin());

-- =========================================================================
-- org_add_ons
-- =========================================================================
create table if not exists public.org_add_ons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  add_on_id uuid not null references public.add_ons(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (org_id, add_on_id)
);

create index if not exists org_add_ons_org_id_idx on public.org_add_ons(org_id);

alter table public.org_add_ons enable row level security;

create policy org_add_ons_select on public.org_add_ons
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
create policy org_add_ons_insert on public.org_add_ons
  for insert to authenticated with check (public.is_platform_admin());
create policy org_add_ons_update on public.org_add_ons
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy org_add_ons_delete on public.org_add_ons
  for delete to authenticated using (public.is_platform_admin());

-- =========================================================================
-- coupons
-- =========================================================================
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null default 'percent' check (discount_type in ('percent', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  max_redemptions integer,
  times_redeemed integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.coupons enable row level security;

-- Not readable by tenants at all: listing coupons would let any signed-in
-- user enumerate every discount code. Redemption is validated server-side.
create policy coupons_all on public.coupons
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- =========================================================================
-- orders — payment records, including onboarding fees
-- =========================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  coupon_id uuid references public.coupons(id) on delete set null,
  kind text not null default 'subscription' check (kind in ('subscription', 'onboarding_fee', 'add_on', 'other')),
  description text,
  amount_cents integer not null default 0,
  currency text not null default 'INR',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists orders_org_id_idx on public.orders(org_id, created_at desc);

alter table public.orders enable row level security;

create policy orders_select on public.orders
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
create policy orders_insert on public.orders
  for insert to authenticated with check (public.is_platform_admin());
create policy orders_update on public.orders
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy orders_delete on public.orders
  for delete to authenticated using (public.is_platform_admin());

-- =========================================================================
-- support_tickets
-- =========================================================================
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_org_id_idx on public.support_tickets(org_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status);

alter table public.support_tickets enable row level security;

create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
-- Tenants raise their own tickets…
create policy support_tickets_insert on public.support_tickets
  for insert to authenticated
  with check (public.is_org_member(org_id));
-- …but only staff change status or priority.
create policy support_tickets_update on public.support_tickets
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy support_tickets_delete on public.support_tickets
  for delete to authenticated using (public.is_platform_admin());

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages(ticket_id, created_at);

-- Same denormalisation trick as messages: copy org_id from the parent ticket
-- so RLS checks it without a join, and overwrite whatever the client sent.
create or replace function public.set_ticket_message_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select org_id into new.org_id from public.support_tickets where id = new.ticket_id;
  if new.org_id is null then
    raise exception 'support ticket % does not exist', new.ticket_id;
  end if;
  return new;
end;
$$;

drop trigger if exists support_ticket_messages_set_org_id on public.support_ticket_messages;
create trigger support_ticket_messages_set_org_id
  before insert or update of ticket_id on public.support_ticket_messages
  for each row execute function public.set_ticket_message_org_id();

alter table public.support_ticket_messages enable row level security;

create policy support_ticket_messages_select on public.support_ticket_messages
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
create policy support_ticket_messages_insert on public.support_ticket_messages
  for insert to authenticated
  with check (public.is_org_member(org_id) or public.is_platform_admin());
create policy support_ticket_messages_delete on public.support_ticket_messages
  for delete to authenticated using (public.is_platform_admin());

-- =========================================================================
-- webhook_logs — inbound Meta deliveries, for debugging
-- =========================================================================
create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  phone_number_id text,
  event_type text,
  signature_valid boolean not null default false,
  payload jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists webhook_logs_created_at_idx on public.webhook_logs(created_at desc);
create index if not exists webhook_logs_org_id_idx on public.webhook_logs(org_id, created_at desc);

alter table public.webhook_logs enable row level security;

-- Rows with a null org_id are deliveries we could not attribute to a tenant
-- (unknown phone_number_id, bad signature) — staff-only by construction.
create policy webhook_logs_select on public.webhook_logs
  for select to authenticated
  using ((org_id is not null and public.is_org_member(org_id)) or public.is_platform_admin());
create policy webhook_logs_delete on public.webhook_logs
  for delete to authenticated using (public.is_platform_admin());
-- No insert policy: only the webhook route writes here, via the service role.

-- =========================================================================
-- platform_settings — global key/value config
-- =========================================================================
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.platform_settings enable row level security;

create policy platform_settings_all on public.platform_settings
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- =========================================================================
-- Seed the plan catalogue so the billing screens aren't empty on first run.
-- =========================================================================
insert into public.plans (name, slug, description, price_cents, billing_interval, message_limit, contact_limit, seat_limit, features, sort_order)
values
  ('Starter', 'starter', 'For teams getting started on WhatsApp', 99900, 'monthly', 1000, 500, 2,
   '["1,000 messages/mo","500 contacts","2 team seats","1 WhatsApp number"]'::jsonb, 1),
  ('Growth', 'growth', 'For growing teams running campaigns', 299900, 'monthly', 10000, 5000, 10,
   '["10,000 messages/mo","5,000 contacts","10 team seats","Campaigns & automations"]'::jsonb, 2),
  ('Scale', 'scale', 'High volume, multiple numbers', 799900, 'monthly', 100000, 50000, 50,
   '["100,000 messages/mo","50,000 contacts","50 team seats","Priority support"]'::jsonb, 3)
on conflict (slug) do nothing;

insert into public.add_ons (name, slug, description, price_cents)
values
  ('Extra WhatsApp number', 'extra-number', 'Connect an additional phone number', 49900),
  ('Onboarding & setup', 'onboarding', 'Guided Meta Cloud API setup', 999900),
  ('Priority support', 'priority-support', '4-hour response SLA', 199900)
on conflict (slug) do nothing;

insert into public.platform_settings (key, value, description)
values
  ('branding', '{"product_name":"Neura Chat","support_email":"support@neuraxine.com"}'::jsonb, 'Product name and support contact'),
  ('signups', '{"enabled":true,"require_onboarding_fee":false}'::jsonb, 'Control new tenant signups')
on conflict (key) do nothing;
