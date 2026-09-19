-- Neura Chat — complete database setup
--
-- Generated from supabase/migrations/*.sql in filename order.
-- Paste this whole file into the Supabase SQL editor and press Run.
--
-- Safe to run more than once: tables use "if not exists", functions use
-- "create or replace", and every policy is dropped before being recreated,
-- so a partial earlier run does not block this.
--
-- Source of truth remains the individual files in supabase/migrations/.
-- Regenerate with: node scripts/build-setup-sql.mjs


-- ========================================================================
-- 20260818120000_schema.sql
-- ========================================================================

-- Neura Chat foundation schema
-- Multi-tenant WhatsApp automation SaaS: organizations, WABA connections,
-- contacts/conversations/messages, templates, campaigns, automations.

create extension if not exists pgcrypto with schema extensions;

-- =========================================================================
-- organizations
-- =========================================================================
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- org_members — links auth.users to organizations with a role
-- =========================================================================
create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists org_members_user_id_idx on public.org_members(user_id);

-- =========================================================================
-- waba_connections — one row per WhatsApp Business Account / phone number
-- connected to an org via the Meta Cloud API.
-- =========================================================================
create table if not exists public.waba_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  waba_id text not null,
  phone_number_id text not null,
  meta_app_id text not null,
  access_token_encrypted text not null,
  webhook_verify_token text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- phone_number_id is how inbound webhooks are routed back to an org, and
-- webhook_verify_token is how the GET verification handshake finds the
-- right connection — both must be globally unique.
create unique index if not exists waba_connections_phone_number_id_key on public.waba_connections(phone_number_id);
create unique index if not exists waba_connections_webhook_verify_token_key on public.waba_connections(webhook_verify_token);
create index if not exists waba_connections_org_id_idx on public.waba_connections(org_id);

-- =========================================================================
-- contacts
-- =========================================================================
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wa_id text not null,
  name text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, wa_id)
);

create index if not exists contacts_org_id_idx on public.contacts(org_id);
create index if not exists contacts_tags_idx on public.contacts using gin (tags);

-- =========================================================================
-- conversations — one running thread per contact
-- =========================================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  last_message_at timestamptz,
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  unique (org_id, contact_id)
);

create index if not exists conversations_org_id_idx on public.conversations(org_id);
create index if not exists conversations_last_message_at_idx on public.conversations(org_id, last_message_at desc);

-- =========================================================================
-- messages
-- org_id is denormalized from conversations (see trigger below) purely so
-- RLS policies can check it directly without a join on every row.
-- =========================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  type text not null,
  content jsonb not null default '{}'::jsonb,
  wa_message_id text,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'read', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages(conversation_id, created_at);
create index if not exists messages_org_id_idx on public.messages(org_id);
create unique index if not exists messages_wa_message_id_key on public.messages(wa_message_id) where wa_message_id is not null;

-- Keep messages.org_id in sync with its conversation, regardless of what a
-- client supplies, so the RLS check below can never be bypassed by sending
-- a mismatched org_id.
create or replace function public.set_message_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select org_id into new.org_id from public.conversations where id = new.conversation_id;
  if new.org_id is null then
    raise exception 'conversation % does not exist', new.conversation_id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_set_org_id on public.messages;
create trigger messages_set_org_id
  before insert or update of conversation_id on public.messages
  for each row execute function public.set_message_org_id();

-- =========================================================================
-- message_templates — mirrors Meta's WhatsApp template model
-- =========================================================================
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'UTILITY' check (category in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'disabled')),
  language text not null default 'en_US',
  components_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name, language)
);

create index if not exists message_templates_org_id_idx on public.message_templates(org_id);

-- =========================================================================
-- campaigns
-- =========================================================================
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid references public.message_templates(id) on delete set null,
  segment_filter jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'running', 'completed', 'cancelled', 'failed')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_org_id_idx on public.campaigns(org_id);

-- =========================================================================
-- campaign_recipients
-- org_id is denormalized from campaigns for the same reason as messages.
-- =========================================================================
create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index if not exists campaign_recipients_campaign_id_idx on public.campaign_recipients(campaign_id);
create index if not exists campaign_recipients_org_id_idx on public.campaign_recipients(org_id);

create or replace function public.set_campaign_recipient_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select org_id into new.org_id from public.campaigns where id = new.campaign_id;
  if new.org_id is null then
    raise exception 'campaign % does not exist', new.campaign_id;
  end if;
  return new;
end;
$$;

drop trigger if exists campaign_recipients_set_org_id on public.campaign_recipients;
create trigger campaign_recipients_set_org_id
  before insert or update of campaign_id on public.campaign_recipients
  for each row execute function public.set_campaign_recipient_org_id();

-- =========================================================================
-- automation_flows
-- =========================================================================
create table if not exists public.automation_flows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  actions_json jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_flows_org_id_idx on public.automation_flows(org_id);

-- ========================================================================
-- 20260818120100_rls_policies.sql
-- ========================================================================

-- RLS for every Neura Chat table, scoped by org membership.
--
-- Baseline rule (as specified): a user may read/write a row only if its
-- org_id belongs to an org they are a member of (org_members).
--
-- Two deliberate exceptions to that baseline, called out explicitly for
-- review:
--   * org_members  — write access (insert/update/delete) is restricted to
--     org owners/admins. Under the plain "any member" rule, any member
--     could grant themselves or an arbitrary user_id the 'owner' role in
--     their own org (privilege escalation), or remove other members.
--     Read access still follows the plain rule. Members may still delete
--     their own membership row (leave the org).
--   * waba_connections — write access is restricted to owners/admins,
--     since this table holds encrypted Meta access tokens and the webhook
--     verify token. Read access still follows the plain rule (any member
--     can see connection status).
-- Every other table (contacts, conversations, messages, message_templates,
-- campaigns, campaign_recipients, automation_flows) uses the plain rule
-- uniformly for select/insert/update/delete.

-- =========================================================================
-- Helper functions (security definer to avoid RLS recursion on org_members)
-- =========================================================================
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- =========================================================================
-- organizations
-- =========================================================================
alter table public.organizations enable row level security;

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- No insert/delete policy for the authenticated role: orgs are created by
-- the handle_new_user trigger (security definer, runs as table owner and
-- bypasses RLS) and are not deletable from the app in this stage.

-- =========================================================================
-- org_members
-- =========================================================================
alter table public.org_members enable row level security;

drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists org_members_insert on public.org_members;
create policy org_members_insert on public.org_members
  for insert to authenticated
  with check (public.is_org_admin(org_id));

drop policy if exists org_members_update on public.org_members;
create policy org_members_update on public.org_members
  for update to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

drop policy if exists org_members_delete_admin on public.org_members;
create policy org_members_delete_admin on public.org_members
  for delete to authenticated
  using (public.is_org_admin(org_id));

drop policy if exists org_members_delete_self on public.org_members;
create policy org_members_delete_self on public.org_members
  for delete to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- waba_connections
-- =========================================================================
alter table public.waba_connections enable row level security;

drop policy if exists waba_connections_select on public.waba_connections;
create policy waba_connections_select on public.waba_connections
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists waba_connections_insert on public.waba_connections;
create policy waba_connections_insert on public.waba_connections
  for insert to authenticated
  with check (public.is_org_admin(org_id));

drop policy if exists waba_connections_update on public.waba_connections;
create policy waba_connections_update on public.waba_connections
  for update to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

drop policy if exists waba_connections_delete on public.waba_connections;
create policy waba_connections_delete on public.waba_connections
  for delete to authenticated
  using (public.is_org_admin(org_id));

-- =========================================================================
-- contacts
-- =========================================================================
alter table public.contacts enable row level security;

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (public.is_org_member(org_id));

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- conversations
-- =========================================================================
alter table public.conversations enable row level security;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (public.is_org_member(org_id));

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- messages
-- =========================================================================
alter table public.messages enable row level security;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (public.is_org_member(org_id));

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- message_templates
-- =========================================================================
alter table public.message_templates enable row level security;

drop policy if exists message_templates_select on public.message_templates;
create policy message_templates_select on public.message_templates
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists message_templates_insert on public.message_templates;
create policy message_templates_insert on public.message_templates
  for insert to authenticated
  with check (public.is_org_member(org_id));

drop policy if exists message_templates_update on public.message_templates;
create policy message_templates_update on public.message_templates
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists message_templates_delete on public.message_templates;
create policy message_templates_delete on public.message_templates
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- campaigns
-- =========================================================================
alter table public.campaigns enable row level security;

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns
  for insert to authenticated
  with check (public.is_org_member(org_id));

drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- campaign_recipients
-- =========================================================================
alter table public.campaign_recipients enable row level security;

drop policy if exists campaign_recipients_select on public.campaign_recipients;
create policy campaign_recipients_select on public.campaign_recipients
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists campaign_recipients_insert on public.campaign_recipients;
create policy campaign_recipients_insert on public.campaign_recipients
  for insert to authenticated
  with check (public.is_org_member(org_id));

drop policy if exists campaign_recipients_update on public.campaign_recipients;
create policy campaign_recipients_update on public.campaign_recipients
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists campaign_recipients_delete on public.campaign_recipients;
create policy campaign_recipients_delete on public.campaign_recipients
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- automation_flows
-- =========================================================================
alter table public.automation_flows enable row level security;

drop policy if exists automation_flows_select on public.automation_flows;
create policy automation_flows_select on public.automation_flows
  for select to authenticated
  using (public.is_org_member(org_id));

drop policy if exists automation_flows_insert on public.automation_flows;
create policy automation_flows_insert on public.automation_flows
  for insert to authenticated
  with check (public.is_org_member(org_id));

drop policy if exists automation_flows_update on public.automation_flows;
create policy automation_flows_update on public.automation_flows
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists automation_flows_delete on public.automation_flows;
create policy automation_flows_delete on public.automation_flows
  for delete to authenticated
  using (public.is_org_member(org_id));

-- ========================================================================
-- 20260818120200_auth_signup_trigger.sql
-- ========================================================================

-- On every new auth.users row (email/password or Google OAuth), create an
-- organization and make the new user its owner. The trigger runs inside
-- the same transaction as the auth.users insert, so both writes are
-- atomic with account creation — if either insert fails, the user is
-- never created either.
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

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========================================================================
-- 20260820100000_admin_billing.sql
-- ========================================================================

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
drop policy if exists platform_admins_select on public.platform_admins;
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
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
  for select to authenticated using (true);
drop policy if exists plans_insert on public.plans;
create policy plans_insert on public.plans
  for insert to authenticated with check (public.is_platform_admin());
drop policy if exists plans_update on public.plans;
create policy plans_update on public.plans
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists plans_delete on public.plans;
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

drop policy if exists add_ons_select on public.add_ons;
create policy add_ons_select on public.add_ons
  for select to authenticated using (true);
drop policy if exists add_ons_insert on public.add_ons;
create policy add_ons_insert on public.add_ons
  for insert to authenticated with check (public.is_platform_admin());
drop policy if exists add_ons_update on public.add_ons;
create policy add_ons_update on public.add_ons
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists add_ons_delete on public.add_ons;
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
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
drop policy if exists subscriptions_insert on public.subscriptions;
create policy subscriptions_insert on public.subscriptions
  for insert to authenticated with check (public.is_platform_admin());
drop policy if exists subscriptions_update on public.subscriptions;
create policy subscriptions_update on public.subscriptions
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists subscriptions_delete on public.subscriptions;
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

drop policy if exists org_add_ons_select on public.org_add_ons;
create policy org_add_ons_select on public.org_add_ons
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
drop policy if exists org_add_ons_insert on public.org_add_ons;
create policy org_add_ons_insert on public.org_add_ons
  for insert to authenticated with check (public.is_platform_admin());
drop policy if exists org_add_ons_update on public.org_add_ons;
create policy org_add_ons_update on public.org_add_ons
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists org_add_ons_delete on public.org_add_ons;
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
drop policy if exists coupons_all on public.coupons;
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

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert to authenticated with check (public.is_platform_admin());
drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists orders_delete on public.orders;
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

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
-- Tenants raise their own tickets…
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets
  for insert to authenticated
  with check (public.is_org_member(org_id));
-- …but only staff change status or priority.
drop policy if exists support_tickets_update on public.support_tickets;
create policy support_tickets_update on public.support_tickets
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists support_tickets_delete on public.support_tickets;
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

drop policy if exists support_ticket_messages_select on public.support_ticket_messages;
create policy support_ticket_messages_select on public.support_ticket_messages
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());
drop policy if exists support_ticket_messages_insert on public.support_ticket_messages;
create policy support_ticket_messages_insert on public.support_ticket_messages
  for insert to authenticated
  with check (public.is_org_member(org_id) or public.is_platform_admin());
drop policy if exists support_ticket_messages_delete on public.support_ticket_messages;
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
drop policy if exists webhook_logs_select on public.webhook_logs;
create policy webhook_logs_select on public.webhook_logs
  for select to authenticated
  using ((org_id is not null and public.is_org_member(org_id)) or public.is_platform_admin());
drop policy if exists webhook_logs_delete on public.webhook_logs;
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

drop policy if exists platform_settings_all on public.platform_settings;
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

-- ========================================================================
-- 20260820180000_portal_modules.sql
-- ========================================================================

-- Portal modules: chatbot, AI assistants, FAQ bot, reminders, integrations,
-- API keys, outgoing webhooks, media gallery and commerce.
--
-- Every table follows the tenancy rule established in the first migration:
-- org-scoped, RLS on, readable and writable only by members of that org via
-- is_org_member(). Tables holding credentials narrow writes to owners/admins
-- through is_org_admin(), matching how waba_connections is handled.

-- =========================================================================
-- ai_assistants — the "AI Assistant" screen: name / role / model
-- =========================================================================
create table if not exists public.ai_assistants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  role text not null default 'Support agent',
  model text not null default 'claude-sonnet-5',
  system_prompt text not null default '',
  temperature numeric(3,2) not null default 0.7 check (temperature >= 0 and temperature <= 2),
  handoff_keywords text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_assistants_org_id_idx on public.ai_assistants(org_id);
alter table public.ai_assistants enable row level security;

drop policy if exists ai_assistants_select on public.ai_assistants;
create policy ai_assistants_select on public.ai_assistants
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists ai_assistants_insert on public.ai_assistants;
create policy ai_assistants_insert on public.ai_assistants
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists ai_assistants_update on public.ai_assistants;
create policy ai_assistants_update on public.ai_assistants
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists ai_assistants_delete on public.ai_assistants;
create policy ai_assistants_delete on public.ai_assistants
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- chatbot_flows — visual bot builder. Nodes are stored as a graph document
-- so the builder can gain node types without a schema change.
-- =========================================================================
create table if not exists public.chatbot_flows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null default 'keyword'
    check (trigger_type in ('keyword', 'welcome', 'fallback', 'menu', 'business_hours')),
  trigger_value text,
  nodes jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chatbot_flows_org_id_idx on public.chatbot_flows(org_id);
-- Only one bot may own a given keyword, or an inbound message would match
-- two flows with no defined winner.
create unique index if not exists chatbot_flows_trigger_key
  on public.chatbot_flows(org_id, trigger_type, trigger_value)
  where trigger_value is not null and is_active;

alter table public.chatbot_flows enable row level security;

drop policy if exists chatbot_flows_select on public.chatbot_flows;
create policy chatbot_flows_select on public.chatbot_flows
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists chatbot_flows_insert on public.chatbot_flows;
create policy chatbot_flows_insert on public.chatbot_flows
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists chatbot_flows_update on public.chatbot_flows;
create policy chatbot_flows_update on public.chatbot_flows
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists chatbot_flows_delete on public.chatbot_flows;
create policy chatbot_flows_delete on public.chatbot_flows
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- faq_entries — FAQ Bot knowledge base
-- =========================================================================
create table if not exists public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  question text not null,
  answer text not null,
  keywords text[] not null default '{}',
  category text,
  hit_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists faq_entries_org_id_idx on public.faq_entries(org_id);
create index if not exists faq_entries_keywords_idx on public.faq_entries using gin (keywords);

alter table public.faq_entries enable row level security;

drop policy if exists faq_entries_select on public.faq_entries;
create policy faq_entries_select on public.faq_entries
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists faq_entries_insert on public.faq_entries;
create policy faq_entries_insert on public.faq_entries
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists faq_entries_update on public.faq_entries;
create policy faq_entries_update on public.faq_entries
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists faq_entries_delete on public.faq_entries;
create policy faq_entries_delete on public.faq_entries
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- reminders — scheduled follow-ups against a contact
-- =========================================================================
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  body text,
  remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists reminders_org_due_idx on public.reminders(org_id, remind_at)
  where status = 'pending';

alter table public.reminders enable row level security;

drop policy if exists reminders_select on public.reminders;
create policy reminders_select on public.reminders
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists reminders_insert on public.reminders;
create policy reminders_insert on public.reminders
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists reminders_update on public.reminders;
create policy reminders_update on public.reminders
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists reminders_delete on public.reminders;
create policy reminders_delete on public.reminders
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- org_integrations — one row per connected third-party provider.
-- The provider catalogue itself lives in code (lib/integrations.ts); only
-- the connection state and its secrets belong in the database.
-- =========================================================================
create table if not exists public.org_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error', 'pending')),
  -- Encrypted with TOKEN_ENCRYPTION_KEY, same as WABA tokens. Never select
  -- this into a client component.
  credentials_encrypted text,
  config jsonb not null default '{}'::jsonb,
  last_error text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);

create index if not exists org_integrations_org_id_idx on public.org_integrations(org_id);

alter table public.org_integrations enable row level security;

drop policy if exists org_integrations_select on public.org_integrations;
create policy org_integrations_select on public.org_integrations
  for select to authenticated using (public.is_org_member(org_id));
-- Writes hold third-party credentials, so restrict to owners/admins.
drop policy if exists org_integrations_insert on public.org_integrations;
create policy org_integrations_insert on public.org_integrations
  for insert to authenticated with check (public.is_org_admin(org_id));
drop policy if exists org_integrations_update on public.org_integrations;
create policy org_integrations_update on public.org_integrations
  for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
drop policy if exists org_integrations_delete on public.org_integrations;
create policy org_integrations_delete on public.org_integrations
  for delete to authenticated using (public.is_org_admin(org_id));

-- =========================================================================
-- api_keys — for the "API Endpoints" screen.
-- Only a hash is stored; the plaintext key is shown once at creation.
-- =========================================================================
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  -- Displayed in the UI so a key is identifiable without revealing it.
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{messages:send,contacts:read}',
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_org_id_idx on public.api_keys(org_id);
create index if not exists api_keys_hash_idx on public.api_keys(key_hash) where revoked_at is null;

alter table public.api_keys enable row level security;

drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists api_keys_insert on public.api_keys;
create policy api_keys_insert on public.api_keys
  for insert to authenticated with check (public.is_org_admin(org_id));
drop policy if exists api_keys_update on public.api_keys;
create policy api_keys_update on public.api_keys
  for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
drop policy if exists api_keys_delete on public.api_keys;
create policy api_keys_delete on public.api_keys
  for delete to authenticated using (public.is_org_admin(org_id));

-- =========================================================================
-- outgoing_webhooks — push events to Zapier / Make / n8n / any URL.
-- This is what makes "integrate with anything" real without each provider
-- needing bespoke code.
-- =========================================================================
create table if not exists public.outgoing_webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  target_url text not null,
  events text[] not null default '{message.received}',
  secret text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists outgoing_webhooks_org_id_idx on public.outgoing_webhooks(org_id);

alter table public.outgoing_webhooks enable row level security;

drop policy if exists outgoing_webhooks_select on public.outgoing_webhooks;
create policy outgoing_webhooks_select on public.outgoing_webhooks
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists outgoing_webhooks_insert on public.outgoing_webhooks;
create policy outgoing_webhooks_insert on public.outgoing_webhooks
  for insert to authenticated with check (public.is_org_admin(org_id));
drop policy if exists outgoing_webhooks_update on public.outgoing_webhooks;
create policy outgoing_webhooks_update on public.outgoing_webhooks
  for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
drop policy if exists outgoing_webhooks_delete on public.outgoing_webhooks;
create policy outgoing_webhooks_delete on public.outgoing_webhooks
  for delete to authenticated using (public.is_org_admin(org_id));

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.outgoing_webhooks(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  event text not null,
  status_code integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_webhook_idx
  on public.webhook_deliveries(webhook_id, created_at desc);

alter table public.webhook_deliveries enable row level security;

drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries
  for select to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- media_assets — the Gallery screen
-- =========================================================================
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  url text not null,
  media_type text not null default 'image'
    check (media_type in ('image', 'video', 'document', 'audio')),
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists media_assets_org_id_idx on public.media_assets(org_id, created_at desc);

alter table public.media_assets enable row level security;

drop policy if exists media_assets_select on public.media_assets;
create policy media_assets_select on public.media_assets
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists media_assets_insert on public.media_assets;
create policy media_assets_insert on public.media_assets
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists media_assets_update on public.media_assets;
create policy media_assets_update on public.media_assets
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists media_assets_delete on public.media_assets;
create policy media_assets_delete on public.media_assets
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- products — the Commerce screen / WhatsApp catalogue
-- =========================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'INR',
  image_url text,
  stock integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, sku)
);

create index if not exists products_org_id_idx on public.products(org_id);

alter table public.products enable row level security;

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to authenticated using (public.is_org_member(org_id));

-- ========================================================================
-- 20260821100000_message_runner.sql
-- ========================================================================

-- Message runner: the piece that turns stored bot configuration into
-- replies on real inbound WhatsApp messages.
--
-- Two things are needed beyond what already exists:
--   1. per-conversation bot state, so a multi-step chatbot flow can
--      remember where it is and a human handoff can silence the bot;
--   2. an audit trail, so "why did the bot say that?" has an answer.

-- =========================================================================
-- conversations — bot state columns
-- =========================================================================

-- Whether automated replies are allowed on this thread. Set false on a
-- handoff so an agent taking over is not talked over by the bot.
alter table public.conversations
  add column if not exists bot_enabled boolean not null default true;

-- Position inside a multi-step chatbot flow. Null means no flow in
-- progress and the next inbound message is matched from scratch.
alter table public.conversations
  add column if not exists bot_flow_id uuid references public.chatbot_flows(id) on delete set null;
alter table public.conversations
  add column if not exists bot_node_id text;

-- Timestamp of the customer's most recent inbound message. WhatsApp only
-- permits free-form (non-template) sends within 24 hours of it, so the
-- send helper reads this column rather than scanning the message table on
-- every send.
alter table public.conversations
  add column if not exists last_inbound_at timestamptz;

-- =========================================================================
-- bot_runs — one row per inbound message the runner considered
-- =========================================================================
create table if not exists public.bot_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  -- Meta's message id for the inbound message that triggered this run.
  -- Unique so a webhook redelivery cannot make the bot reply twice.
  inbound_wa_message_id text,
  inbound_text text,
  -- Which subsystem produced the reply, and which row of it.
  matched_kind text not null default 'none'
    check (matched_kind in ('flow_step', 'chatbot', 'faq', 'automation', 'assistant', 'handoff', 'none')),
  matched_id uuid,
  matched_label text,
  reply_text text,
  outcome text not null default 'skipped'
    check (outcome in ('replied', 'skipped', 'handoff', 'failed')),
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists bot_runs_org_idx on public.bot_runs(org_id, created_at desc);
create index if not exists bot_runs_conversation_idx on public.bot_runs(conversation_id, created_at desc);

-- The dedupe guard. Meta retries a webhook delivery whenever it does not
-- get a prompt 200, and a retried delivery carries the same message id —
-- without this, one customer message could be answered several times.
create unique index if not exists bot_runs_inbound_wa_message_id_key
  on public.bot_runs(inbound_wa_message_id)
  where inbound_wa_message_id is not null;

alter table public.bot_runs enable row level security;

-- Read-only to tenants: rows are written by the webhook handler through
-- the service-role client, which bypasses RLS. Deliberately no insert,
-- update or delete policy for `authenticated` — an audit trail a tenant
-- can rewrite is not an audit trail.
drop policy if exists bot_runs_select on public.bot_runs;
create policy bot_runs_select on public.bot_runs
  for select to authenticated using (public.is_org_member(org_id));

-- ========================================================================
-- 20260822090000_flow_builder.sql
-- ========================================================================

-- Visual flow builder: the chatbot becomes a graph rather than a list of
-- nodes, so the canvas needs somewhere to keep the connections between them
-- and the runtime needs somewhere to keep its place inside a running flow.

-- =========================================================================
-- chatbot_flows — the graph
-- =========================================================================

-- Edges are stored separately from nodes because the canvas edits them
-- independently: dragging a connection changes no node.
alter table public.chatbot_flows
  add column if not exists edges jsonb not null default '[]'::jsonb;

-- The node the trigger fires from. Null falls back to the first node, which
-- is what flows built in the old simple form rely on.
alter table public.chatbot_flows
  add column if not exists entry_node_id text;

-- =========================================================================
-- conversations — per-conversation flow state
-- =========================================================================

-- Answers collected by Ask nodes, addressable as {{variable}} in later
-- nodes. Scoped to the conversation rather than the contact: a flow run is
-- the unit that collects them.
alter table public.conversations
  add column if not exists bot_variables jsonb not null default '{}'::jsonb;

-- Set by a Delay node longer than the inline threshold. Nothing resumes
-- these yet — the scheduler is not built — so the column exists to make
-- that state visible rather than to pretend it is handled.
alter table public.conversations
  add column if not exists bot_resume_at timestamptz;

create index if not exists conversations_bot_resume_idx
  on public.conversations(bot_resume_at)
  where bot_resume_at is not null;

-- =========================================================================
-- bot_runs — record which node produced the reply
-- =========================================================================
alter table public.bot_runs
  add column if not exists node_id text;
alter table public.bot_runs
  add column if not exists node_kind text;

-- ========================================================================
-- 20260822140000_manage_workspace.sql
-- ========================================================================

-- The Manage workspace: the day-to-day tools that sit between a contact
-- list and a campaign. Each table is org-scoped and RLS'd the same way as
-- the rest of the tenant schema.

-- =========================================================================
-- canned_messages — saved replies an agent can drop into a conversation
-- =========================================================================
create table if not exists public.canned_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Typed as /shortcut in the composer, so it must be unique per org.
  shortcut text not null,
  title text not null,
  body text not null,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, shortcut)
);

create index if not exists canned_messages_org_idx on public.canned_messages(org_id);
alter table public.canned_messages enable row level security;

drop policy if exists canned_messages_select on public.canned_messages;
create policy canned_messages_select on public.canned_messages
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists canned_messages_insert on public.canned_messages;
create policy canned_messages_insert on public.canned_messages
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists canned_messages_update on public.canned_messages;
create policy canned_messages_update on public.canned_messages
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists canned_messages_delete on public.canned_messages;
create policy canned_messages_delete on public.canned_messages
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- contact_groups — named segments, maintained by hand
-- =========================================================================
create table if not exists public.contact_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  colour text not null default '#00FF87',
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists contact_groups_org_idx on public.contact_groups(org_id);
alter table public.contact_groups enable row level security;

drop policy if exists contact_groups_select on public.contact_groups;
create policy contact_groups_select on public.contact_groups
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists contact_groups_insert on public.contact_groups;
create policy contact_groups_insert on public.contact_groups
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists contact_groups_update on public.contact_groups;
create policy contact_groups_update on public.contact_groups
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists contact_groups_delete on public.contact_groups;
create policy contact_groups_delete on public.contact_groups
  for delete to authenticated using (public.is_org_member(org_id));

create table if not exists public.contact_group_members (
  group_id uuid not null references public.contact_groups(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, contact_id)
);

create index if not exists contact_group_members_contact_idx
  on public.contact_group_members(contact_id);
alter table public.contact_group_members enable row level security;

drop policy if exists contact_group_members_select on public.contact_group_members;
create policy contact_group_members_select on public.contact_group_members
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists contact_group_members_insert on public.contact_group_members;
create policy contact_group_members_insert on public.contact_group_members
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists contact_group_members_delete on public.contact_group_members;
create policy contact_group_members_delete on public.contact_group_members
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- contact_columns — custom fields on a contact
-- =========================================================================
create table if not exists public.contact_columns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The key used in contacts.custom_fields and in {{variables}}.
  key text not null,
  label text not null,
  field_type text not null default 'text'
    check (field_type in ('text', 'number', 'date', 'select', 'boolean')),
  options text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create index if not exists contact_columns_org_idx on public.contact_columns(org_id);
alter table public.contact_columns enable row level security;

drop policy if exists contact_columns_select on public.contact_columns;
create policy contact_columns_select on public.contact_columns
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists contact_columns_insert on public.contact_columns;
create policy contact_columns_insert on public.contact_columns
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists contact_columns_update on public.contact_columns;
create policy contact_columns_update on public.contact_columns
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists contact_columns_delete on public.contact_columns;
create policy contact_columns_delete on public.contact_columns
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- contacts — custom field values and consent
-- =========================================================================
alter table public.contacts
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

-- Consent is not a tag. A tag can be removed by accident and nothing
-- notices; an opt-out has to be enforceable, so it gets its own column and
-- its own timestamp for the audit question "when did they ask?".
alter table public.contacts
  add column if not exists opted_out boolean not null default false;
alter table public.contacts
  add column if not exists opted_out_at timestamptz;
alter table public.contacts
  add column if not exists opt_out_reason text;

create index if not exists contacts_opted_out_idx on public.contacts(org_id)
  where opted_out;

-- ========================================================================
-- 20260824090000_connection_health.sql
-- ========================================================================

-- =========================================================================
-- Connection health
--
-- When Meta rejects a send because the stored access token is dead, the only
-- place that failure surfaced was the bot_runs row for whichever customer
-- happened to message first. That means the operator learns their number is
-- broken from a customer, which is the wrong way round. Record the last
-- credential-level rejection on the connection itself so Integrations can say
-- so before the next message arrives.
--
-- Deliberately NOT a status change: the row stays 'active' so sends keep
-- being attempted and start working the instant a valid token is pasted in.
-- =========================================================================

alter table public.waba_connections
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz;

comment on column public.waba_connections.last_error is
  'Plain-English description of the most recent credential-level rejection from Meta. Cleared on the next successful send or on reconnect.';

-- ========================================================================
-- 20260826090000_media_storage.sql
-- ========================================================================

-- =========================================================================
-- Gallery uploads
--
-- The Gallery could only hold URLs that already existed somewhere else,
-- which meant anyone wanting to send an image first had to find their own
-- host. A media library that cannot store media is a bookmark list.
--
-- Files go to a Supabase Storage bucket, uploaded straight from the browser
-- rather than through a route handler: serverless request bodies are capped
-- at 4.5 MB on Vercel, which is smaller than a phone photo.
-- =========================================================================

-- Public-read so the URL can be handed to Meta, which fetches media from an
-- anonymous GET and would fail against a signed or private object. Writes
-- stay locked to org members by the policies below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  104857600, -- 100 MB; WhatsApp's own ceiling is well under this per type
  null       -- enforced in the app, where the message can name the type
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Objects are keyed <org_id>/<uuid>-<filename>, so the first path segment
-- decides who may write. is_org_member is SECURITY DEFINER, so it sees the
-- membership rows the caller cannot select directly.
-- Reads. A public bucket serves files over its public URL without touching
-- RLS, which is why this was missed — but the Storage API still needs SELECT
-- to list a folder, and supabase-js checks whether an object exists before
-- uploading with upsert:false. Without this, uploads are rejected outright.
drop policy if exists media_objects_select on storage.objects;
drop policy if exists media_objects_select on storage.objects;
create policy media_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists media_objects_insert on storage.objects;
drop policy if exists media_objects_insert on storage.objects;
create policy media_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists media_objects_update on storage.objects;
drop policy if exists media_objects_update on storage.objects;
create policy media_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists media_objects_delete on storage.objects;
drop policy if exists media_objects_delete on storage.objects;
create policy media_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- Deleting a gallery row has to delete the file too, or storage fills with
-- objects nothing references and no screen can reach.
alter table public.media_assets
  add column if not exists storage_path text;

comment on column public.media_assets.storage_path is
  'Object key inside the media bucket. Null for assets added by pasting an external URL, which we do not own and must not delete.';

-- ========================================================================
-- 20260827090000_assistant_providers.sql
-- ========================================================================

-- =========================================================================
-- AI Assistant: bring-your-own provider + knowledge base + agent rules
--
-- Until now an assistant was always Claude on the platform's own
-- ANTHROPIC_API_KEY. A tenant can now pick the provider, paste their own
-- key (encrypted at rest, same AES-256-GCM envelope as WhatsApp tokens),
-- attach knowledge the assistant may quote, and set the rules that decide
-- when it answers at all.
-- =========================================================================

alter table public.ai_assistants
  -- Which API the reply goes to. 'custom' is any OpenAI-compatible
  -- endpoint (OpenRouter, Groq, Together, a local Ollama), which is why it
  -- is the only one that also needs api_base_url.
  add column if not exists provider text not null default 'anthropic',
  add column if not exists api_key_encrypted text,
  add column if not exists api_base_url text,
  add column if not exists max_tokens integer not null default 1024,
  -- Which role card the prompt came from, so the editor can re-select it.
  -- 'custom' means the business wrote the prompt themselves.
  add column if not exists prompt_preset text not null default 'custom',

  -- --- agent rules: memory & knowledge ---------------------------------
  add column if not exists memory_turns integer not null default 20,
  add column if not exists use_knowledge_base boolean not null default true,
  add column if not exists stop_on_human boolean not null default true,

  -- --- agent rules: working hours --------------------------------------
  -- Times are 'HH:MM' text, not `time`. Postgres renders `time` as
  -- '09:00:00', which an <input type="time"> round-trips inconsistently.
  add column if not exists working_hours_enabled boolean not null default false,
  add column if not exists working_hours_timezone text not null default 'UTC',
  add column if not exists working_hours_start text not null default '09:00',
  add column if not exists working_hours_end text not null default '18:00',
  -- 0 = Sunday … 6 = Saturday, matching JavaScript's getDay().
  add column if not exists working_days integer[] not null default '{1,2,3,4,5}',
  add column if not exists off_hours_message text not null default '',

  -- --- agent rules: follow-up ------------------------------------------
  add column if not exists followup_enabled boolean not null default false,
  add column if not exists followup_delay_minutes integer not null default 60,
  add column if not exists followup_message text not null default '',
  add column if not exists max_followups integer not null default 1;

alter table public.ai_assistants drop constraint if exists ai_assistants_provider_check;
alter table public.ai_assistants add constraint ai_assistants_provider_check
  check (provider in ('anthropic', 'openai', 'google', 'custom'));

alter table public.ai_assistants drop constraint if exists ai_assistants_max_tokens_check;
alter table public.ai_assistants add constraint ai_assistants_max_tokens_check
  check (max_tokens between 64 and 8192);

alter table public.ai_assistants drop constraint if exists ai_assistants_memory_turns_check;
alter table public.ai_assistants add constraint ai_assistants_memory_turns_check
  check (memory_turns between 0 and 100);

alter table public.ai_assistants drop constraint if exists ai_assistants_followup_check;
alter table public.ai_assistants add constraint ai_assistants_followup_check
  check (followup_delay_minutes between 1 and 10080 and max_followups between 0 and 10);

-- =========================================================================
-- assistant_knowledge — what the assistant is allowed to know.
--
-- assistant_id null means the entry is shared by every assistant in the
-- org, which is the common case: one product sheet, several assistants.
-- =========================================================================
create table if not exists public.assistant_knowledge (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid references public.ai_assistants(id) on delete cascade,
  title text not null,
  content text not null default '',
  source_type text not null default 'text'
    check (source_type in ('text', 'faq', 'url', 'file')),
  source_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_knowledge_org_id_idx
  on public.assistant_knowledge(org_id);
create index if not exists assistant_knowledge_assistant_id_idx
  on public.assistant_knowledge(assistant_id);

alter table public.assistant_knowledge enable row level security;

drop policy if exists assistant_knowledge_select on public.assistant_knowledge;
drop policy if exists assistant_knowledge_select on public.assistant_knowledge;
create policy assistant_knowledge_select on public.assistant_knowledge
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists assistant_knowledge_insert on public.assistant_knowledge;
drop policy if exists assistant_knowledge_insert on public.assistant_knowledge;
create policy assistant_knowledge_insert on public.assistant_knowledge
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists assistant_knowledge_update on public.assistant_knowledge;
drop policy if exists assistant_knowledge_update on public.assistant_knowledge;
create policy assistant_knowledge_update on public.assistant_knowledge
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists assistant_knowledge_delete on public.assistant_knowledge;
drop policy if exists assistant_knowledge_delete on public.assistant_knowledge;
create policy assistant_knowledge_delete on public.assistant_knowledge
  for delete to authenticated using (public.is_org_member(org_id));

-- ========================================================================
-- 20260828090000_inbox.sql
-- ========================================================================

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
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.shares_org_with(user_id));

drop policy if exists profiles_update on public.profiles;
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

-- ========================================================================
-- 20260829090000_inbox_crm.sql
-- ========================================================================

-- =========================================================================
-- Inbox: AI modes, lead qualification, internal notes and a timeline
--
-- Everything here exists so the inbox can answer six questions at a glance —
-- who is messaging, what they want, whether they are worth chasing, who is
-- handling it, whether AI is on, and what to do next — without the agent
-- reading the whole thread.
-- =========================================================================

alter table public.conversations
  -- Who is allowed to answer. 'ai' is the default: this is an automation
  -- product, and a bot that waits for a human before every reply is not
  -- automating anything. 'copilot' and 'human' are chosen per conversation.
  add column if not exists ai_mode text not null default 'ai',
  add column if not exists priority text not null default 'normal',
  -- Set when a human closes the thread; closed threads leave the active list.
  add column if not exists closed_at timestamptz,
  -- Raised by the analyser when the conversation is past what AI should
  -- handle — an angry customer, a refund, a request for a person.
  add column if not exists needs_human boolean not null default false,
  add column if not exists needs_human_reason text,
  -- The analyser's output, cached so opening a thread is not a model call.
  add column if not exists ai_summary text,
  add column if not exists ai_next_action text,
  add column if not exists ai_intent text,
  add column if not exists ai_sentiment text,
  add column if not exists ai_analyzed_at timestamptz,
  -- Which message the cached analysis was computed from, so it can be shown
  -- as stale rather than silently describing an older conversation.
  add column if not exists ai_analyzed_message_id uuid;

alter table public.conversations drop constraint if exists conversations_ai_mode_check;
alter table public.conversations add constraint conversations_ai_mode_check
  check (ai_mode in ('ai', 'copilot', 'human'));

alter table public.conversations drop constraint if exists conversations_priority_check;
alter table public.conversations add constraint conversations_priority_check
  check (priority in ('normal', 'medium', 'high', 'urgent'));

create index if not exists conversations_open_idx
  on public.conversations(org_id, last_message_at desc)
  where closed_at is null;

alter table public.contacts
  add column if not exists lead_stage text not null default 'new',
  -- 0-100, written by the analyser. Null means never analysed, which is a
  -- different thing from a score of zero.
  add column if not exists lead_score integer,
  add column if not exists lead_score_reasons text[] not null default '{}',
  add column if not exists source text,
  add column if not exists campaign text,
  add column if not exists deal_value numeric(12, 2);

alter table public.contacts drop constraint if exists contacts_lead_stage_check;
alter table public.contacts add constraint contacts_lead_stage_check
  check (lead_stage in ('new', 'contacted', 'qualified', 'demo', 'proposal', 'won', 'lost'));

alter table public.contacts drop constraint if exists contacts_lead_score_check;
alter table public.contacts add constraint contacts_lead_score_check
  check (lead_score is null or lead_score between 0 and 100);

-- Reminders were per-contact; the inbox sets them from a thread.
alter table public.reminders
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

create index if not exists reminders_conversation_idx
  on public.reminders(conversation_id, remind_at);

-- =========================================================================
-- conversation_notes — what the team says to itself.
--
-- Deliberately its own table rather than a message with a flag: a note that
-- can be confused for a message is a note that eventually gets sent to the
-- customer.
-- =========================================================================
create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists conversation_notes_conversation_idx
  on public.conversation_notes(conversation_id, created_at);

alter table public.conversation_notes enable row level security;

drop policy if exists conversation_notes_select on public.conversation_notes;
drop policy if exists conversation_notes_select on public.conversation_notes;
create policy conversation_notes_select on public.conversation_notes
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists conversation_notes_insert on public.conversation_notes;
drop policy if exists conversation_notes_insert on public.conversation_notes;
create policy conversation_notes_insert on public.conversation_notes
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists conversation_notes_delete on public.conversation_notes;
drop policy if exists conversation_notes_delete on public.conversation_notes;
create policy conversation_notes_delete on public.conversation_notes
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- conversation_events — the activity timeline.
--
-- Append-only. No update or delete policy: a timeline you can edit is not
-- a record of what happened.
-- =========================================================================
create table if not exists public.conversation_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  kind text not null,
  label text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists conversation_events_conversation_idx
  on public.conversation_events(conversation_id, created_at desc);

alter table public.conversation_events enable row level security;

drop policy if exists conversation_events_select on public.conversation_events;
drop policy if exists conversation_events_select on public.conversation_events;
create policy conversation_events_select on public.conversation_events
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists conversation_events_insert on public.conversation_events;
drop policy if exists conversation_events_insert on public.conversation_events;
create policy conversation_events_insert on public.conversation_events
  for insert to authenticated with check (public.is_org_member(org_id));

-- ========================================================================
-- 20260830090000_realtime_messages.sql
-- ========================================================================

-- =========================================================================
-- Realtime on messages, so the inbox can hear an incoming message.
--
-- Without this the panel only learns about a message when someone reloads
-- the page, which is why it could never make a sound. Postgres changes are
-- still filtered by RLS, so a subscriber only receives rows for orgs they
-- are a member of.
-- =========================================================================

do $$
begin
  -- add table is not idempotent — it errors if the table is already
  -- published, which would take the whole migration down on a re-run.
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

-- The payload carries only the changed row's columns by default, which is
-- all the inbox needs: org_id to know it is ours, conversation_id to know
-- where it landed, and direction to know whether to make a sound.

-- ========================================================================
-- 20260831090000_flow_resume.sql
-- ========================================================================

-- =========================================================================
-- Where a delayed flow picks back up.
--
-- bot_resume_at recorded when to continue but never where, so a flow that
-- parked on a Delay had nothing to resume from — it simply stopped, and the
-- rest of the flow was never sent.
-- =========================================================================

alter table public.conversations
  add column if not exists bot_resume_node_id text;

-- The scheduler scans on this, so it wants both halves.
create index if not exists conversations_resume_idx
  on public.conversations(bot_resume_at)
  where bot_resume_at is not null and bot_resume_node_id is not null;

-- ========================================================================
-- 20260901090000_ai_active_default.sql
-- ========================================================================

-- =========================================================================
-- AI Active is the default, not Copilot.
--
-- Copilot was the cautious choice: AI drafts, a human sends. But a WhatsApp
-- automation product whose bots do not answer until someone presses a button
-- is not doing the thing it was bought for. A tenant who wants a human in
-- the loop can still pick Copilot per conversation.
-- =========================================================================

alter table public.conversations
  alter column ai_mode set default 'ai';

-- Conversations still sitting on the old default have never had a mode
-- chosen for them — nobody picked Copilot, it was picked for them. Move
-- those over, and only those: a conversation someone deliberately set to
-- 'human' stays where they put it.
--
-- bot_enabled is what the message runner actually reads, so the two have to
-- agree or the mode becomes a label over the wrong behaviour.
update public.conversations
set ai_mode = 'ai',
    bot_enabled = true
where ai_mode = 'copilot'
  and bot_enabled = true;

-- ========================================================================
-- 20260902090000_leads_meetings_transactions.sql
-- ========================================================================

-- =========================================================================
-- Meetings and customer transactions.
--
-- The Leads board and Lead Status screens need no new tables: lead_stage,
-- lead_score and source already live on contacts. These two do.
-- =========================================================================

-- =========================================================================
-- meetings — an appointment with a contact.
--
-- Separate from reminders: a reminder nudges you, a meeting is a commitment
-- to somebody else, with a duration and an outcome.
-- =========================================================================
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null,
  notes text,
  location text,
  starts_at timestamptz not null,
  duration_minutes integer not null default 30,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meetings_org_idx on public.meetings(org_id, starts_at);
create index if not exists meetings_contact_idx on public.meetings(contact_id);

alter table public.meetings enable row level security;

drop policy if exists meetings_select on public.meetings;
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists meetings_insert on public.meetings;
drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists meetings_update on public.meetings;
drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists meetings_delete on public.meetings;
drop policy if exists meetings_delete on public.meetings;
create policy meetings_delete on public.meetings
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- transactions — money between the business and its customers.
--
-- Not to be confused with public.orders, which is what the tenant pays the
-- platform. This is what the tenant's own customers pay the tenant.
-- =========================================================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  -- Stored in the smallest unit so no arithmetic here ever meets a float.
  amount_cents bigint not null default 0,
  currency text not null default 'INR',
  direction text not null default 'in' check (direction in ('in', 'out')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded')),
  method text,
  reference text,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists transactions_org_idx on public.transactions(org_id, occurred_at desc);
create index if not exists transactions_contact_idx on public.transactions(contact_id);

alter table public.transactions enable row level security;

drop policy if exists transactions_select on public.transactions;
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists transactions_insert on public.transactions;
drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists transactions_update on public.transactions;
drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists transactions_delete on public.transactions;
drop policy if exists transactions_delete on public.transactions;
create policy transactions_delete on public.transactions
  for delete to authenticated using (public.is_org_member(org_id));

-- ========================================================================
-- 20260903090000_templates_campaigns.sql
-- ========================================================================

-- =========================================================================
-- Templates that can be built, and campaigns that can be sent.
--
-- message_templates held a name and a components blob, which was enough to
-- send an already-approved template and not enough to build one. campaigns
-- held a segment filter and no way to say who, with what, or when.
-- =========================================================================

alter table public.message_templates
  -- Meta's own id, and the status it reports back after review.
  add column if not exists waba_template_id text,
  add column if not exists rejected_reason text,
  add column if not exists last_synced_at timestamptz,
  -- The parts, kept separately so the builder can reopen a template rather
  -- than reverse-engineering it out of the components array.
  add column if not exists header_format text not null default 'NONE',
  add column if not exists header_text text not null default '',
  add column if not exists header_media_url text not null default '',
  add column if not exists body_text text not null default '',
  add column if not exists footer_text text not null default '',
  add column if not exists buttons jsonb not null default '[]'::jsonb,
  add column if not exists variable_samples text[] not null default '{}';

alter table public.message_templates drop constraint if exists message_templates_header_format_check;
alter table public.message_templates add constraint message_templates_header_format_check
  check (header_format in ('NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'));

-- Meta reports more states than the original four.
alter table public.message_templates drop constraint if exists message_templates_status_check;
alter table public.message_templates add constraint message_templates_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected', 'disabled', 'paused', 'in_appeal'));

create index if not exists message_templates_waba_idx
  on public.message_templates(org_id, waba_template_id);

alter table public.campaigns
  add column if not exists name text not null default 'Untitled campaign',
  -- Values for the template's {{1}}, {{2}} … Fixed per campaign; a
  -- per-recipient merge would need a column mapping, which is the next step.
  add column if not exists variables text[] not null default '{}',
  -- How the audience was chosen, kept so the campaign can be reopened and
  -- audited: { kind: 'all' | 'tag' | 'group' | 'numbers', value: ... }
  add column if not exists audience jsonb not null default '{}'::jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists last_error text,
  -- A drip is a campaign whose steps fire on a delay after the first send.
  add column if not exists is_drip boolean not null default false;

alter table public.campaign_recipients
  -- Denormalised so a send does not need a contact join, and so a number
  -- pasted in or imported can be dispatched before it becomes a contact.
  add column if not exists wa_id text,
  add column if not exists wa_message_id text,
  add column if not exists error text,
  -- Which drip step this row is for. 0 is the campaign's own first send.
  add column if not exists step_index integer not null default 0,
  add column if not exists send_after timestamptz;

-- contact_id has to allow null now: a pasted number is dispatchable before
-- it exists as a contact, and forcing one would create junk contacts for
-- numbers that turn out to be unreachable.
alter table public.campaign_recipients
  alter column contact_id drop not null;

-- Who this row is for, as one value: a contact when there is one, the raw
-- number when there is not. A generated column rather than an expression
-- index because ON CONFLICT can only name real columns — PostgREST's
-- on_conflict= takes column names, and an expression index would make
-- every upsert fail with "no unique or exclusion constraint matching".
alter table public.campaign_recipients
  add column if not exists recipient_key text
  generated always as (coalesce(contact_id::text, wa_id)) stored;

-- Every row must identify somebody, or the key above would be null and two
-- empty rows would both be allowed through.
alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_has_target;
alter table public.campaign_recipients
  add constraint campaign_recipients_has_target
  check (contact_id is not null or wa_id is not null) not valid;

-- The old key assumed one row per contact per campaign. A drip needs one
-- per step.
alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_campaign_id_contact_id_key;
drop index if exists public.campaign_recipients_step_key;
create unique index if not exists campaign_recipients_step_key
  on public.campaign_recipients(campaign_id, recipient_key, step_index);

create index if not exists campaign_recipients_due_idx
  on public.campaign_recipients(status, send_after)
  where status = 'pending';

-- =========================================================================
-- campaign_steps — the drip sequence.
--
-- Step 0 is the campaign's own message. Anything beyond is sent this many
-- hours after the step before it, to the recipients who got the last one.
-- =========================================================================
create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  template_id uuid references public.message_templates(id) on delete set null,
  step_index integer not null,
  delay_hours integer not null default 24,
  variables text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (campaign_id, step_index)
);

create index if not exists campaign_steps_campaign_idx
  on public.campaign_steps(campaign_id, step_index);

alter table public.campaign_steps enable row level security;

drop policy if exists campaign_steps_select on public.campaign_steps;
drop policy if exists campaign_steps_select on public.campaign_steps;
create policy campaign_steps_select on public.campaign_steps
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists campaign_steps_insert on public.campaign_steps;
drop policy if exists campaign_steps_insert on public.campaign_steps;
create policy campaign_steps_insert on public.campaign_steps
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists campaign_steps_update on public.campaign_steps;
drop policy if exists campaign_steps_update on public.campaign_steps;
create policy campaign_steps_update on public.campaign_steps
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists campaign_steps_delete on public.campaign_steps;
drop policy if exists campaign_steps_delete on public.campaign_steps;
create policy campaign_steps_delete on public.campaign_steps
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- campaign_progress — how far along each campaign is.
--
-- A view rather than counters on the campaign row: counters drift the first
-- time a dispatch run dies between sending and incrementing, and this is
-- read far less often than recipients are written. security_invoker keeps
-- the caller's RLS on campaign_recipients in force, so a member only ever
-- counts their own org's rows.
-- =========================================================================
create or replace view public.campaign_progress
with (security_invoker = on) as
select
  campaign_id,
  org_id,
  count(*)::bigint as total,
  count(*) filter (where status in ('sent', 'delivered', 'read'))::bigint as sent,
  count(*) filter (where status = 'failed')::bigint as failed,
  count(*) filter (where status = 'pending')::bigint as pending
from public.campaign_recipients
group by campaign_id, org_id;

grant select on public.campaign_progress to authenticated;

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260904090000_whatsapp_flows.sql
-- ========================================================================

-- =========================================================================
-- WhatsApp Flows — forms that open inside the chat.
--
-- A flow lives in two places: the editable document here, and the published
-- copy at Meta that customers actually open. They are kept apart on purpose
-- — Meta's copy is immutable once published, so editing has to happen
-- against a local draft that is uploaded as a new version.
-- =========================================================================

create table if not exists public.whatsapp_flows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  -- Meta's id for the flow, once it has been created there. Null while the
  -- form exists only here.
  meta_flow_id text,
  categories text[] not null default '{LEAD_GENERATION}',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'deprecated', 'blocked', 'throttled')),
  -- The editor's own model: screens, each with its components. Built into
  -- Flow JSON on save rather than stored as Flow JSON, so the builder can
  -- reopen a form without parsing its own output back.
  screens jsonb not null default '[]'::jsonb,
  -- What Meta said when it last refused the document, kept so the author
  -- can see it beside the field that caused it.
  validation_errors jsonb not null default '[]'::jsonb,
  preview_url text,
  preview_expires_at timestamptz,
  last_synced_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_flows_org_idx
  on public.whatsapp_flows(org_id, created_at desc);
create unique index if not exists whatsapp_flows_meta_idx
  on public.whatsapp_flows(org_id, meta_flow_id)
  where meta_flow_id is not null;

alter table public.whatsapp_flows enable row level security;

drop policy if exists whatsapp_flows_select on public.whatsapp_flows;
drop policy if exists whatsapp_flows_select on public.whatsapp_flows;
create policy whatsapp_flows_select on public.whatsapp_flows
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists whatsapp_flows_insert on public.whatsapp_flows;
drop policy if exists whatsapp_flows_insert on public.whatsapp_flows;
create policy whatsapp_flows_insert on public.whatsapp_flows
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists whatsapp_flows_update on public.whatsapp_flows;
drop policy if exists whatsapp_flows_update on public.whatsapp_flows;
create policy whatsapp_flows_update on public.whatsapp_flows
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists whatsapp_flows_delete on public.whatsapp_flows;
drop policy if exists whatsapp_flows_delete on public.whatsapp_flows;
create policy whatsapp_flows_delete on public.whatsapp_flows
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- flow_sends — one row per form handed to one person.
--
-- The flow token is how a submission finds its way back: Meta echoes it
-- verbatim in the reply, and it is the only thing tying an answer to the
-- person who gave it.
-- =========================================================================
create table if not exists public.flow_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  flow_id uuid not null references public.whatsapp_flows(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  wa_id text not null,
  flow_token text not null unique,
  wa_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists flow_sends_flow_idx on public.flow_sends(flow_id, created_at desc);

alter table public.flow_sends enable row level security;

drop policy if exists flow_sends_select on public.flow_sends;
drop policy if exists flow_sends_select on public.flow_sends;
create policy flow_sends_select on public.flow_sends
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists flow_sends_insert on public.flow_sends;
drop policy if exists flow_sends_insert on public.flow_sends;
create policy flow_sends_insert on public.flow_sends
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists flow_sends_delete on public.flow_sends;
drop policy if exists flow_sends_delete on public.flow_sends;
create policy flow_sends_delete on public.flow_sends
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- flow_responses — what people actually filled in.
-- =========================================================================
create table if not exists public.flow_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  flow_id uuid references public.whatsapp_flows(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  wa_id text,
  flow_token text,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists flow_responses_flow_idx
  on public.flow_responses(flow_id, created_at desc);
create index if not exists flow_responses_org_idx
  on public.flow_responses(org_id, created_at desc);

alter table public.flow_responses enable row level security;

drop policy if exists flow_responses_select on public.flow_responses;
drop policy if exists flow_responses_select on public.flow_responses;
create policy flow_responses_select on public.flow_responses
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists flow_responses_delete on public.flow_responses;
drop policy if exists flow_responses_delete on public.flow_responses;
create policy flow_responses_delete on public.flow_responses
  for delete to authenticated using (public.is_org_member(org_id));
-- No insert policy for members: responses are written by the webhook with
-- the service role. A member forging a submission would corrupt the record
-- of what a customer actually said.

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260905090000_multi_number.sql
-- ========================================================================

-- =========================================================================
-- More than one WhatsApp number per workspace.
--
-- Every lookup in the app asked for "the org's active connection" and took
-- the single row back. The moment a second number was connected that query
-- returned two rows, maybeSingle() answered with an error instead of a
-- connection, and the app said "connect a WhatsApp number first" to an org
-- that had just connected two. This migration gives a workspace a real set
-- of numbers, with one marked default, and ties each conversation to the
-- number it actually happened on.
-- =========================================================================

alter table public.waba_connections
  -- What Meta calls the number, so screens can show +91 92724 47307 rather
  -- than the 15-digit phone_number_id nobody recognises.
  add column if not exists display_phone_number text,
  add column if not exists verified_name text,
  add column if not exists quality_rating text,
  -- The operator's own name for it: "Support", "Sales", "Test number".
  add column if not exists label text,
  -- Which number is used when nothing more specific applies.
  add column if not exists is_default boolean not null default false,
  add column if not exists last_checked_at timestamptz;

-- One default per workspace. A partial index rather than a constraint so
-- the rule only binds the rows claiming to be default.
drop index if exists public.waba_connections_one_default;
create unique index waba_connections_one_default
  on public.waba_connections(org_id)
  where is_default;

-- Promote the oldest active number in each workspace, so an org that
-- connected numbers before this migration still has a default and nothing
-- has to be chosen by hand before sending works again.
update public.waba_connections w
set is_default = true
where w.id in (
  select distinct on (org_id) id
  from public.waba_connections
  where status = 'active'
  order by org_id, created_at
)
and not exists (
  select 1 from public.waba_connections other
  where other.org_id = w.org_id and other.is_default
);

-- =========================================================================
-- Conversations belong to a number, not just to a workspace.
--
-- Without this a customer who messages two of your numbers lands in one
-- thread, and the reply goes out from whichever number the lookup happened
-- to pick — visibly the wrong sender, to the customer.
-- =========================================================================
alter table public.conversations
  add column if not exists connection_id uuid
    references public.waba_connections(id) on delete set null;

update public.conversations c
set connection_id = (
  select id from public.waba_connections w
  where w.org_id = c.org_id and w.is_default
  limit 1
)
where c.connection_id is null;

create index if not exists conversations_connection_idx
  on public.conversations(connection_id, last_message_at desc);

-- One thread per person per number. NULLS NOT DISTINCT so a pair of rows
-- that both predate a connection still collide rather than duplicating.
alter table public.conversations
  drop constraint if exists conversations_org_id_contact_id_key;
drop index if exists public.conversations_org_contact_connection_key;
create unique index conversations_org_contact_connection_key
  on public.conversations(org_id, contact_id, connection_id)
  nulls not distinct;

-- =========================================================================
-- Automations can be scoped to one number.
--
-- Null means "any number", which is what every existing row wants: a
-- workspace that has only ever had one number should not have to go and
-- attach it to each bot before anything replies again.
-- =========================================================================
alter table public.chatbot_flows
  add column if not exists connection_id uuid
    references public.waba_connections(id) on delete set null;

alter table public.ai_assistants
  add column if not exists connection_id uuid
    references public.waba_connections(id) on delete set null;

alter table public.automation_flows
  add column if not exists connection_id uuid
    references public.waba_connections(id) on delete set null;

alter table public.campaigns
  add column if not exists connection_id uuid
    references public.waba_connections(id) on delete set null;

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260906090000_template_account.sql
-- ========================================================================

-- Templates belong to a WhatsApp Business Account, not to a workspace.
--
-- message_templates was unique on (org_id, name, language), which is only
-- correct while a workspace has one account. With two connected, a template
-- named "marketing_" on each account collapses into a single row: syncing
-- overwrites one account's template with the other's, and the list gives no
-- way to tell which account anything belongs to.

alter table public.message_templates
  add column if not exists waba_id text not null default '';

-- Existing rows were all created against whichever account resolved as the
-- default, so attribute them there rather than leaving them unowned.
update public.message_templates t
set waba_id = c.waba_id
from public.waba_connections c
where t.waba_id = ''
  and c.org_id = t.org_id
  and c.is_default;

update public.message_templates t
set waba_id = c.waba_id
from public.waba_connections c
where t.waba_id = ''
  and c.org_id = t.org_id;

alter table public.message_templates
  drop constraint if exists message_templates_org_id_name_language_key;

-- A plain column index, not an expression: PostgREST's on_conflict can only
-- name real columns, so an expression index here would be unusable from the
-- client and every upsert would fail.
create unique index if not exists message_templates_account_identity_idx
  on public.message_templates(org_id, waba_id, name, language);

create index if not exists message_templates_waba_idx
  on public.message_templates(org_id, waba_id);

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260907090000_site_content.sql
-- ========================================================================

-- =========================================================================
-- Editable landing page
--
-- Every word on the marketing site lived in ten React components, so a price
-- change or a new headline was a code change and a deploy. This holds the
-- content instead.
--
-- Separate from platform_settings on purpose: that table is admin-read-only,
-- and the landing page is served to anonymous visitors. A public SELECT here
-- is deliberate — this is published marketing copy, not configuration.
-- =========================================================================

create table if not exists public.site_content (
  -- One row per section: brand, hero, features, pricing, faq, footer …
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.site_content enable row level security;

-- Anyone may read: this is the public website.
drop policy if exists site_content_select on public.site_content;
drop policy if exists site_content_select on public.site_content;
create policy site_content_select on public.site_content
  for select to anon, authenticated
  using (true);

-- Only platform staff may write.
drop policy if exists site_content_write on public.site_content;
drop policy if exists site_content_write on public.site_content;
create policy site_content_write on public.site_content
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Brand assets — logo, favicon, OG image — go in their own public bucket
-- rather than the tenant `media` bucket, which is keyed by org id and
-- readable only by that org's members.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 5242880, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists brand_objects_select on storage.objects;
drop policy if exists brand_objects_select on storage.objects;
create policy brand_objects_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'brand');

drop policy if exists brand_objects_write on storage.objects;
drop policy if exists brand_objects_write on storage.objects;
create policy brand_objects_write on storage.objects
  for all to authenticated
  using (bucket_id = 'brand' and public.is_platform_admin())
  with check (bucket_id = 'brand' and public.is_platform_admin());

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260908090000_trials_and_pricing.sql
-- ========================================================================

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

-- ========================================================================
-- 20260909090000_public_pricing.sql
-- ========================================================================

-- =========================================================================
-- Let the website read the price list
--
-- plans_select was `to authenticated`, so the landing page — served to
-- anonymous visitors — could not read the catalogue at all. It carried its
-- own hardcoded copy instead, which is how the site ended up advertising
-- prices in dollars that no subscription had ever charged.
--
-- Two narrow grants, both read-only and both limited to what is already
-- published on the website.
-- =========================================================================

-- The catalogue, but only what is on sale. A plan taken off sale disappears
-- from the website, which is the whole point of the is_active flag.
drop policy if exists plans_public_select on public.plans;
drop policy if exists plans_public_select on public.plans;
create policy plans_public_select on public.plans
  for select to anon
  using (is_active);

-- The trial length, and nothing else in this table. platform_settings holds
-- configuration, so this is keyed to the one row the pricing section needs
-- rather than opened wholesale.
drop policy if exists platform_settings_public_billing on public.platform_settings;
drop policy if exists platform_settings_public_billing on public.platform_settings;
create policy platform_settings_public_billing on public.platform_settings
  for select to anon
  using (key = 'billing');

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260910090000_crm_sync.sql
-- ========================================================================

-- =========================================================================
-- CRM sync
--
-- The HubSpot, Zoho and Salesforce entries in the catalogue stored
-- credentials and did nothing with them. Now contacts are pushed for real,
-- which needs two things the schema did not have: somewhere to remember
-- which record in the CRM a contact became, and a record of what happened.
--
-- Without the first, every sync creates a duplicate. Without the second, a
-- failed push is invisible — the customer is simply missing from the CRM and
-- nobody finds out until somebody goes looking for them.
-- =========================================================================

alter table public.contacts
  -- {"hubspot":"12345","zoho-crm":"6543..."} — the id this contact has in
  -- each CRM. Keyed by provider slug because a workspace can connect more
  -- than one, and the same person is a different record in each.
  add column if not exists crm_refs jsonb not null default '{}'::jsonb,
  add column if not exists crm_synced_at timestamptz;

-- The bulk sync orders on this, oldest first, so that running it twice
-- carries on rather than starting over.
create index if not exists contacts_crm_synced_idx
  on public.contacts(org_id, crm_synced_at nulls first);

-- =========================================================================
-- crm_sync_log — one row per contact per provider per attempt.
-- =========================================================================
create table if not exists public.crm_sync_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  -- Kept when the contact is deleted: "we pushed this and then lost track of
  -- it" is exactly the case somebody will need the log for.
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null check (status in ('created', 'updated', 'skipped', 'failed')),
  external_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists crm_sync_log_org_idx
  on public.crm_sync_log(org_id, created_at desc);
create index if not exists crm_sync_log_failed_idx
  on public.crm_sync_log(org_id, created_at desc)
  where status = 'failed';

alter table public.crm_sync_log enable row level security;

drop policy if exists crm_sync_log_select on public.crm_sync_log;
drop policy if exists crm_sync_log_select on public.crm_sync_log;
create policy crm_sync_log_select on public.crm_sync_log
  for select to authenticated using (public.is_org_member(org_id));

-- Written by the server on the org's behalf, so the insert is a member
-- insert rather than a service-role one: the webhook path runs as the org.
drop policy if exists crm_sync_log_insert on public.crm_sync_log;
drop policy if exists crm_sync_log_insert on public.crm_sync_log;
create policy crm_sync_log_insert on public.crm_sync_log
  for insert to authenticated with check (public.is_org_member(org_id));

drop policy if exists crm_sync_log_delete on public.crm_sync_log;
drop policy if exists crm_sync_log_delete on public.crm_sync_log;
create policy crm_sync_log_delete on public.crm_sync_log
  for delete to authenticated using (public.is_org_member(org_id));

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260911090000_appointments.sql
-- ========================================================================

-- =========================================================================
-- Appointment booking
--
-- Meetings already existed, but only as something a person typed in after
-- the fact. This is the other half: what the business offers, when it is
-- free, and a booking conversation the customer can complete on WhatsApp
-- without anyone on the business's side touching it.
--
-- Four new tables. Availability is a weekly pattern rather than a list of
-- slots — storing every slot would mean generating them ahead of time,
-- regenerating them whenever the hours changed, and still being wrong the
-- moment somebody booked one.
-- =========================================================================

-- =========================================================================
-- appointment_types — what can be booked.
--
-- "Multiple options" in the customer's list: a clinic offers consultation
-- and follow-up, a salon offers a dozen services at different lengths.
-- Length lives here rather than in settings because that is the whole point
-- of having more than one.
-- =========================================================================
create table if not exists public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 30
    check (duration_minutes between 5 and 1440),
  -- Smallest currency unit, as everywhere else. Zero means it is not priced
  -- on the menu, which is different from being free.
  price_cents integer not null default 0 check (price_cents >= 0),
  location text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointment_types_org_idx
  on public.appointment_types(org_id, sort_order);

alter table public.appointment_types enable row level security;

drop policy if exists appointment_types_select on public.appointment_types;
drop policy if exists appointment_types_select on public.appointment_types;
create policy appointment_types_select on public.appointment_types
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists appointment_types_insert on public.appointment_types;
drop policy if exists appointment_types_insert on public.appointment_types;
create policy appointment_types_insert on public.appointment_types
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists appointment_types_update on public.appointment_types;
drop policy if exists appointment_types_update on public.appointment_types;
create policy appointment_types_update on public.appointment_types
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists appointment_types_delete on public.appointment_types;
drop policy if exists appointment_types_delete on public.appointment_types;
create policy appointment_types_delete on public.appointment_types
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- appointment_settings — when the business is open, and what the bot says.
--
-- One row per workspace. `hours` is a weekly pattern keyed by weekday, each
-- day holding any number of windows, so a business that shuts for lunch is
-- expressed rather than approximated:
--
--   {"mon":[{"start":"09:00","end":"13:00"},{"start":"14:00","end":"18:00"}]}
-- =========================================================================
create table if not exists public.appointment_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  is_enabled boolean not null default false,
  -- IANA name. Opening hours are meaningless without it, and a business
  -- booking customers in another country needs its own, not the server's.
  timezone text not null default 'Asia/Kolkata',
  slot_minutes integer not null default 30 check (slot_minutes between 5 and 480),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  -- Nothing is offered sooner than this. Without it the bot cheerfully
  -- offers a 9:00 appointment at 8:59.
  min_notice_minutes integer not null default 60
    check (min_notice_minutes between 0 and 20160),
  horizon_days integer not null default 14 check (horizon_days between 1 and 120),
  max_per_slot integer not null default 1 check (max_per_slot between 1 and 100),
  hours jsonb not null default '{
    "sun": [],
    "mon": [{"start":"09:00","end":"18:00"}],
    "tue": [{"start":"09:00","end":"18:00"}],
    "wed": [{"start":"09:00","end":"18:00"}],
    "thu": [{"start":"09:00","end":"18:00"}],
    "fri": [{"start":"09:00","end":"18:00"}],
    "sat": [{"start":"09:00","end":"14:00"}]
  }'::jsonb,
  -- What a customer types to start booking. Matched as a whole word, so
  -- "book" does not fire on "bookkeeping".
  trigger_keywords text[] not null default
    array['book', 'booking', 'appointment', 'appointments', 'schedule', 'slot'],
  location text,
  greeting text not null default 'Happy to book you in. What would you like to book?',
  confirmation text not null default
    'Booked. See you on {{date}} at {{time}}. Reply CANCEL if you need to change it.',
  no_slots_message text not null default
    'Sorry, there is nothing free in the next couple of weeks. Reply here and someone will sort it out with you.',
  cancelled_message text not null default 'No problem — nothing has been booked.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointment_settings enable row level security;

drop policy if exists appointment_settings_select on public.appointment_settings;
drop policy if exists appointment_settings_select on public.appointment_settings;
create policy appointment_settings_select on public.appointment_settings
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists appointment_settings_write on public.appointment_settings;
drop policy if exists appointment_settings_write on public.appointment_settings;
create policy appointment_settings_write on public.appointment_settings
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- appointment_blackouts — a holiday, a day off, an afternoon out.
--
-- Separate from the weekly pattern because it is an exception to it, and
-- editing next Tuesday's hours to close for one Tuesday would close every
-- Tuesday after it too.
-- =========================================================================
create table if not exists public.appointment_blackouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists appointment_blackouts_org_idx
  on public.appointment_blackouts(org_id, starts_at);

alter table public.appointment_blackouts enable row level security;

drop policy if exists appointment_blackouts_select on public.appointment_blackouts;
drop policy if exists appointment_blackouts_select on public.appointment_blackouts;
create policy appointment_blackouts_select on public.appointment_blackouts
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists appointment_blackouts_write on public.appointment_blackouts;
drop policy if exists appointment_blackouts_write on public.appointment_blackouts;
create policy appointment_blackouts_write on public.appointment_blackouts
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- booking_sessions — where a customer is in the booking conversation.
--
-- One per conversation. It cannot live in conversations.bot_variables: a
-- graph flow owns that, and a customer who starts booking halfway through a
-- flow would have their flow state overwritten by ours.
--
-- Expires, because a customer who is asked "which day?" and never answers
-- must not have their next unrelated message read as a date.
-- =========================================================================
create table if not exists public.booking_sessions (
  conversation_id uuid primary key
    references public.conversations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  step text not null check (step in ('type', 'date', 'time')),
  appointment_type_id uuid references public.appointment_types(id) on delete set null,
  -- "2026-09-11" as the business reads it, not as UTC does.
  chosen_date text,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_sessions_expiry_idx
  on public.booking_sessions(expires_at);

alter table public.booking_sessions enable row level security;

drop policy if exists booking_sessions_select on public.booking_sessions;
drop policy if exists booking_sessions_select on public.booking_sessions;
create policy booking_sessions_select on public.booking_sessions
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists booking_sessions_write on public.booking_sessions;
drop policy if exists booking_sessions_write on public.booking_sessions;
create policy booking_sessions_write on public.booking_sessions
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- meetings gains what a booking needs.
-- =========================================================================
alter table public.meetings
  add column if not exists appointment_type_id uuid
    references public.appointment_types(id) on delete set null,
  -- 'whatsapp' means the customer booked it themselves. Worth knowing: those
  -- are the ones nobody on the business's side has seen yet.
  add column if not exists source text not null default 'manual',
  add column if not exists reminder_sent_at timestamptz;

alter table public.meetings drop constraint if exists meetings_source_check;
alter table public.meetings add constraint meetings_source_check
  check (source in ('manual', 'whatsapp', 'api'));

-- Counting what is already taken at a given time is the query the slot
-- generator runs for every request, so it wants an index that answers it.
create index if not exists meetings_org_scheduled_idx
  on public.meetings(org_id, starts_at)
  where status = 'scheduled';

-- =========================================================================
-- A booking is a bot outcome like any other, and the Automations log has to
-- be able to say so.
-- =========================================================================
alter table public.bot_runs drop constraint if exists bot_runs_matched_kind_check;
alter table public.bot_runs add constraint bot_runs_matched_kind_check
  check (matched_kind in
    ('flow_step', 'chatbot', 'faq', 'automation', 'assistant', 'handoff', 'booking', 'none'));

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260912090000_appointment_reminders.sql
-- ========================================================================

-- =========================================================================
-- Appointment reminders, and where a booking went in the calendar
--
-- meetings.reminder_sent_at existed and nothing ever wrote to it. This adds
-- the settings a reminder needs and the column that records where the
-- booking ended up outside this system.
-- =========================================================================

alter table public.appointment_settings
  -- How long before the appointment to remind the customer. 0 turns it off.
  add column if not exists reminder_hours integer not null default 3
    check (reminder_hours between 0 and 168),
  -- A reminder usually falls outside WhatsApp's 24-hour service window, and
  -- outside it Meta accepts nothing but an approved template. Free-form is
  -- attempted only when this is blank, and then only when the window is
  -- genuinely open — otherwise the reminder is recorded as skipped rather
  -- than failing silently.
  add column if not exists reminder_template text,
  add column if not exists reminder_template_language text not null default 'en',
  add column if not exists reminder_message text not null default
    'Reminder: your appointment is at {{time}} today. Reply here if you need to change it.';

alter table public.meetings
  -- The event id in whatever calendar this was pushed to, so a second push
  -- updates the event rather than creating a duplicate.
  add column if not exists calendar_event_id text,
  add column if not exists calendar_synced_at timestamptz,
  add column if not exists calendar_error text;

-- The reminder sweep scans on exactly this.
create index if not exists meetings_reminder_due_idx
  on public.meetings(starts_at)
  where status = 'scheduled' and reminder_sent_at is null;

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260913090000_commerce_orders.sql
-- ========================================================================

-- =========================================================================
-- Commerce: imported products, the Meta catalogue, and customer orders
--
-- The Commerce screen held a product list nobody could do anything with:
-- no way to get products in except typing them, and no record of what a
-- customer ordered. This adds all three sides of that.
--
-- The distinction that matters and is easy to lose: public.orders is what a
-- tenant pays *us*. These are what a tenant's own customers pay *them*.
-- Same word, opposite direction, so they are separate tables with separate
-- names rather than a `kind` column somebody will forget to filter on.
-- =========================================================================

alter table public.products
  -- The shop's own id, "shopify:12345". What makes a re-import update a
  -- product rather than adding a second copy of it.
  add column if not exists external_id text,
  -- The SKU as Meta's commerce catalogue knows it. Not the same thing as
  -- `sku`: a business can keep its own codes and still have Meta assign
  -- content ids, and a product message must carry Meta's.
  add column if not exists retailer_id text,
  add column if not exists category text,
  add column if not exists updated_at timestamptz not null default now();

-- One row per external product per org. Partial, because a hand-typed
-- product has no external id and several of those must be allowed.
create unique index if not exists products_external_idx
  on public.products(org_id, external_id)
  where external_id is not null;

create unique index if not exists products_retailer_idx
  on public.products(org_id, retailer_id)
  where retailer_id is not null;

-- =========================================================================
-- The Meta commerce catalogue attached to the WABA.
--
-- Product messages need a catalog_id, and it is a property of the WhatsApp
-- Business Account rather than of the phone number. Cached here because it
-- is asked for on every send and never changes.
-- =========================================================================
alter table public.waba_connections
  add column if not exists catalog_id text,
  add column if not exists catalog_name text,
  -- Whether the storefront icon and the cart are switched on for this
  -- number. Read back from Meta rather than assumed: a catalogue that exists
  -- but is not visible looks identical to one that is, until a customer
  -- cannot find it.
  add column if not exists is_catalog_visible boolean,
  add column if not exists is_cart_enabled boolean;

-- =========================================================================
-- store_orders — what a customer ordered.
--
-- `reference` is ours and short, because it is what goes into a WhatsApp
-- order_details message (Meta caps reference_id at 35 characters) and into
-- the gateway's own reference field, so a payment webhook can be matched
-- back to an order without a lookup table.
-- =========================================================================
create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  reference text not null,
  status text not null default 'pending'
    check (status in (
      'pending',        -- the customer sent a cart; nobody has been asked to pay
      'awaiting_payment', -- an order_details message or a payment link went out
      'paid',
      'confirmed',
      'shipped',
      'delivered',
      'cancelled',
      'refunded'
    )),
  currency text not null default 'INR',
  -- Smallest currency unit throughout, so no arithmetic here meets a float.
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  shipping_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  total_cents bigint not null default 0,
  -- 'whatsapp' is Meta's native payment flow; the rest are payment links.
  payment_provider text,
  payment_link_url text,
  -- The gateway's or Meta's own id, for reconciling a webhook.
  payment_reference text,
  payment_status text,
  paid_at timestamptz,
  -- The order_details message we sent, so an order_status update can refer
  -- to the right one.
  wa_order_message_id text,
  catalog_id text,
  address text,
  notes text,
  -- Shiprocket's air waybill, for "where is my order?".
  awb text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference)
);

create index if not exists store_orders_org_idx
  on public.store_orders(org_id, created_at desc);
create index if not exists store_orders_contact_idx on public.store_orders(contact_id);
create index if not exists store_orders_payment_idx
  on public.store_orders(payment_reference)
  where payment_reference is not null;

alter table public.store_orders enable row level security;

drop policy if exists store_orders_select on public.store_orders;
drop policy if exists store_orders_select on public.store_orders;
create policy store_orders_select on public.store_orders
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists store_orders_write on public.store_orders;
drop policy if exists store_orders_write on public.store_orders;
create policy store_orders_write on public.store_orders
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- store_order_items — the lines of an order.
--
-- name and unit price are copied rather than joined to products: a product
-- renamed or repriced next month must not silently rewrite what somebody
-- was charged last month.
-- =========================================================================
create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  -- Nullable: an item can arrive from a Meta catalogue we never imported.
  product_id uuid references public.products(id) on delete set null,
  retailer_id text,
  name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents bigint not null default 0,
  currency text not null default 'INR',
  created_at timestamptz not null default now()
);

create index if not exists store_order_items_order_idx
  on public.store_order_items(order_id);

alter table public.store_order_items enable row level security;

-- Reached through its order, so membership is checked there. Writing the
-- check this way means an item cannot be attached to another tenant's order
-- even by id.
drop policy if exists store_order_items_select on public.store_order_items;
drop policy if exists store_order_items_select on public.store_order_items;
create policy store_order_items_select on public.store_order_items
  for select to authenticated using (
    exists (
      select 1 from public.store_orders o
      where o.id = order_id and public.is_org_member(o.org_id)
    )
  );

drop policy if exists store_order_items_write on public.store_order_items;
drop policy if exists store_order_items_write on public.store_order_items;
create policy store_order_items_write on public.store_order_items
  for all to authenticated using (
    exists (
      select 1 from public.store_orders o
      where o.id = order_id and public.is_org_member(o.org_id)
    )
  ) with check (
    exists (
      select 1 from public.store_orders o
      where o.id = order_id and public.is_org_member(o.org_id)
    )
  );

-- =========================================================================
-- Payment settings per workspace.
--
-- Which gateway to ask with, and whether Meta's native payment flow is
-- available on this WABA — which it only is once a payment configuration has
-- been approved in WhatsApp Manager, something we cannot do from here and
-- must not pretend to.
-- =========================================================================
create table if not exists public.payment_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  -- 'link' sends a gateway payment link. 'whatsapp' sends Meta's
  -- order_details message and lets the customer pay inside the chat.
  method text not null default 'link' check (method in ('link', 'whatsapp')),
  -- Which gateway a link is created with.
  link_provider text,
  -- The name of the payment configuration set up in WhatsApp Manager. Meta
  -- rejects an order_details message that names one it does not have.
  wa_payment_configuration text,
  -- 'razorpay' or 'payu' — which gateway that configuration is wired to.
  wa_payment_gateway text,
  -- Physical goods get a shipping stage in the order status; digital do not.
  goods_type text not null default 'physical'
    check (goods_type in ('physical', 'digital')),
  -- Minutes an unpaid order stays payable.
  payment_expiry_minutes integer not null default 1440
    check (payment_expiry_minutes between 10 and 20160),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  -- Free shipping above this. 0 means never.
  free_shipping_above_cents bigint not null default 0,
  order_received_message text not null default
    'Thanks for your order. Here is what we have: {{items}}. Total {{total}}.',
  payment_request_message text not null default
    'Your order comes to {{total}}. Tap to pay: {{link}}',
  payment_received_message text not null default
    'Payment received — thank you. Your order {{reference}} is confirmed.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_settings enable row level security;

drop policy if exists payment_settings_select on public.payment_settings;
drop policy if exists payment_settings_select on public.payment_settings;
create policy payment_settings_select on public.payment_settings
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists payment_settings_write on public.payment_settings;
drop policy if exists payment_settings_write on public.payment_settings;
create policy payment_settings_write on public.payment_settings
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260914090000_invoicing.sql
-- ========================================================================

-- =========================================================================
-- Invoicing
--
-- The Invoice section of the sidebar was three items marked "soon". This is
-- the whole of it: what the business is, the invoices themselves, and the
-- schedules that raise them again next month.
--
-- An invoice is not a receipt. It is a document somebody files, so two
-- things here are stricter than they would otherwise be:
--
--   * Numbering is claimed atomically. Indian GST requires consecutive
--     serial numbers, and max(number)+1 races the moment two invoices are
--     raised in the same second — which is exactly what a recurring run
--     does.
--   * The customer's details are copied onto the invoice rather than joined
--     to the contact. Renaming a customer next year must not rewrite what
--     was issued to them last year.
-- =========================================================================

-- =========================================================================
-- invoice_settings — who is issuing, and how the numbers run.
-- =========================================================================
create table if not exists public.invoice_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,

  -- The legal identity on the document. Deliberately separate from the
  -- organisation's display name: "umm clothing" is a workspace label, and
  -- an invoice needs the registered name.
  business_name text,
  address text,
  city text,
  state text,
  postal_code text,
  country text not null default 'India',
  -- Fifteen characters. Validated in the app, because a typo here goes onto
  -- every invoice issued from then on.
  gstin text,
  pan text,
  email text,
  phone text,
  logo_url text,
  signature_url text,

  -- How the customer pays outside the app.
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_name text,
  upi_id text,

  -- Numbering. next_number is the one the *next* invoice will take, so a
  -- fresh workspace starts at 1 and the claim below hands it out and steps.
  number_prefix text not null default 'INV',
  next_number integer not null default 1 check (next_number > 0),
  number_padding integer not null default 4 check (number_padding between 1 and 10),

  default_terms_days integer not null default 15
    check (default_terms_days between 0 and 365),
  default_tax_percent numeric(5,2) not null default 18
    check (default_tax_percent between 0 and 100),
  -- Indian invoices conventionally round to the rupee and show the
  -- difference as its own line.
  round_to_rupee boolean not null default true,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',

  notes text,
  terms_text text not null default
    'Payment due within the terms shown. Goods once sold are not returnable.',
  -- What goes in the WhatsApp message when an invoice is sent.
  send_message text not null default
    'Invoice {{number}} for {{total}} is ready. View and pay here: {{link}}',
  payment_received_message text not null default
    'Payment received for invoice {{number}}. Thank you.',
  reminder_message text not null default
    'A reminder that invoice {{number}} for {{total}} was due on {{due}}. {{link}}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoice_settings enable row level security;

drop policy if exists invoice_settings_select on public.invoice_settings;
drop policy if exists invoice_settings_select on public.invoice_settings;
create policy invoice_settings_select on public.invoice_settings
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists invoice_settings_write on public.invoice_settings;
drop policy if exists invoice_settings_write on public.invoice_settings;
create policy invoice_settings_write on public.invoice_settings
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- recurring_invoices — the schedules.
--
-- Declared before invoices so the foreign key from an invoice back to the
-- schedule that raised it can be created in the same pass.
-- =========================================================================
create table if not exists public.recurring_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  interval text not null default 'monthly'
    check (interval in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  -- A date, not an instant: nobody's billing cycle turns on a timezone.
  next_run_on date not null,
  last_run_on date,
  -- Null runs forever. A number stops after that many invoices, which is
  -- what a fixed-term contract needs.
  occurrences_limit integer check (occurrences_limit is null or occurrences_limit > 0),
  occurrences_done integer not null default 0,
  is_active boolean not null default true,
  -- Off, the run raises a draft for somebody to look at before it goes.
  auto_send boolean not null default false,
  terms_days integer not null default 15 check (terms_days between 0 and 365),
  notes text,
  -- The lines to raise each time, as they would be typed into the builder.
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_invoices_org_idx
  on public.recurring_invoices(org_id, next_run_on);
-- The sweep scans on exactly this.
create index if not exists recurring_invoices_due_idx
  on public.recurring_invoices(next_run_on)
  where is_active;

alter table public.recurring_invoices enable row level security;

drop policy if exists recurring_invoices_select on public.recurring_invoices;
drop policy if exists recurring_invoices_select on public.recurring_invoices;
create policy recurring_invoices_select on public.recurring_invoices
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists recurring_invoices_write on public.recurring_invoices;
drop policy if exists recurring_invoices_write on public.recurring_invoices;
create policy recurring_invoices_write on public.recurring_invoices
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- invoices
--
-- `overdue` is not a status. It is due_on being in the past with money still
-- owed, and storing it would mean something has to sweep every invoice at
-- midnight to keep it true.
-- =========================================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  recurring_id uuid references public.recurring_invoices(id) on delete set null,

  -- Assigned when the invoice is issued, not when the draft is created: a
  -- draft that is deleted must not leave a hole in the sequence.
  number text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partly_paid', 'paid', 'cancelled')),

  issued_on date,
  due_on date,

  -- The customer as they were at the time. Copied, not joined.
  customer_name text,
  customer_gstin text,
  customer_address text,
  customer_state text,
  customer_phone text,
  customer_email text,

  currency text not null default 'INR',
  -- True when the sale crossed a state line, which decides IGST versus
  -- CGST+SGST. Stored because it is a property of the sale, and recomputing
  -- it later from GSTINs that have since changed would rewrite history.
  inter_state boolean not null default false,

  -- Smallest currency unit throughout.
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  taxable_cents bigint not null default 0,
  cgst_cents bigint not null default 0,
  sgst_cents bigint not null default 0,
  igst_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  round_off_cents bigint not null default 0,
  total_cents bigint not null default 0,
  -- Part payment is ordinary on an invoice, unlike on a cart.
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  paid_at timestamptz,

  notes text,
  terms_text text,

  payment_provider text,
  payment_link_url text,
  payment_reference text,

  -- What goes in the link sent to the customer. Random and unguessable,
  -- because the page it opens needs no login.
  public_token text not null default encode(gen_random_bytes(18), 'hex'),
  sent_at timestamptz,
  last_reminded_at timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A number is unique per workspace once assigned. Partial, because drafts
-- have no number and several of those must be allowed.
create unique index if not exists invoices_number_idx
  on public.invoices(org_id, number)
  where number is not null;

create unique index if not exists invoices_token_idx on public.invoices(public_token);
create index if not exists invoices_org_idx on public.invoices(org_id, created_at desc);
create index if not exists invoices_contact_idx on public.invoices(contact_id);
create index if not exists invoices_due_idx
  on public.invoices(org_id, due_on)
  where status in ('sent', 'partly_paid');
create index if not exists invoices_payment_idx
  on public.invoices(payment_reference)
  where payment_reference is not null;

alter table public.invoices enable row level security;

drop policy if exists invoices_select on public.invoices;
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists invoices_write on public.invoices;
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- No anonymous policy, deliberately. The public invoice page is server
-- rendered and reads with the service role after matching the token: a
-- `to anon` select policy permissive enough to allow a token lookup is also
-- permissive enough to allow listing every invoice on the platform.

-- =========================================================================
-- invoice_items
--
-- Description and unit price are copied rather than joined to products, for
-- the same reason as the customer details: repricing a product next month
-- must not rewrite what was billed last month.
-- =========================================================================
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  -- HSN for goods, SAC for services.
  hsn_code text,
  -- Fractional, because an hour and a half of work is a real line.
  quantity numeric(12,3) not null default 1 check (quantity >= 0),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  discount_percent numeric(5,2) not null default 0
    check (discount_percent between 0 and 100),
  -- The computed figures, stored so the document cannot change under the
  -- customer if the arithmetic is ever adjusted.
  taxable_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx
  on public.invoice_items(invoice_id, sort_order);

alter table public.invoice_items enable row level security;

-- Reached through the invoice, so membership is checked there. Written this
-- way, a line cannot be attached to another tenant's invoice even by id.
drop policy if exists invoice_items_select on public.invoice_items;
drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items
  for select to authenticated using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and public.is_org_member(i.org_id)
    )
  );

drop policy if exists invoice_items_write on public.invoice_items;
drop policy if exists invoice_items_write on public.invoice_items;
create policy invoice_items_write on public.invoice_items
  for all to authenticated using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and public.is_org_member(i.org_id)
    )
  ) with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and public.is_org_member(i.org_id)
    )
  );

-- =========================================================================
-- Claiming an invoice number.
--
-- GST requires consecutive serial numbers, so this has to be a single
-- statement that both reads and steps the counter. `update ... returning`
-- takes a row lock, which means two invoices raised in the same instant get
-- different numbers and neither gets a gap — the thing max(number)+1
-- cannot promise, and the thing a recurring run raising twenty invoices at
-- once will absolutely exercise.
--
-- security definer so it can step the counter for a workspace the caller is
-- a member of without needing update rights on the settings row itself.
-- =========================================================================
create or replace function public.claim_invoice_number(target_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer;
begin
  if not public.is_org_member(target_org) then
    raise exception 'Not a member of this workspace';
  end if;

  -- A workspace that has never opened the settings screen still needs a
  -- counter to step.
  insert into public.invoice_settings (org_id)
  values (target_org)
  on conflict (org_id) do nothing;

  update public.invoice_settings
     set next_number = next_number + 1,
         updated_at = now()
   where org_id = target_org
  returning next_number - 1 into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_invoice_number(uuid) from public;
grant execute on function public.claim_invoice_number(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ========================================================================
-- 20260915090000_assistant_forms.sql
-- ========================================================================

-- =========================================================================
-- Forms an AI assistant is allowed to open.
--
-- Deliberately a list the business chooses rather than "any published form".
-- The assistant decides when to send one, and a model that can reach every
-- form in the workspace will eventually hand a customer the wrong one — an
-- internal survey, a form for a different product line. An empty list is
-- the default and means the assistant sends no forms at all.
--
-- Stored as ids rather than names so renaming a form does not silently
-- detach it from every assistant that offers it.
-- =========================================================================

alter table public.ai_assistants
  add column if not exists form_ids uuid[] not null default '{}'::uuid[];

comment on column public.ai_assistants.form_ids is
  'whatsapp_flows the assistant may offer. Empty means none.';

-- A short line the assistant is told alongside the form's name, so it knows
-- when the form is the right answer. Without it the model has only the name
-- to go on, and "Form 2" tells it nothing.
alter table public.whatsapp_flows
  add column if not exists description text;

comment on column public.whatsapp_flows.description is
  'What this form is for, in one line. Shown to the AI assistant so it knows when to offer it.';

-- The message and button that go out with the form when a bot sends it.
-- Kept on the form rather than typed again at every call site: the same
-- form sent from the inbox, a chatbot and the assistant should introduce
-- itself the same way.
alter table public.whatsapp_flows
  add column if not exists invitation text;
alter table public.whatsapp_flows
  add column if not exists button_text text not null default 'Open form';

comment on column public.whatsapp_flows.invitation is
  'The message body sent above the form. Falls back to a generic line.';

-- How the form reached this person. "inbox" for an agent sending it by
-- hand, "chatbot" from a flow node, "assistant" from the AI. Worth knowing
-- when a form suddenly starts going out far more often than it used to.
alter table public.flow_sends
  add column if not exists source text not null default 'inbox';

-- ========================================================================
-- 20260916090000_feature_access.sql
-- ========================================================================

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

-- ========================================================================
-- 20260917090000_landing_claims.sql
-- ========================================================================

-- =========================================================================
-- Clear the invented social proof out of the saved landing page.
--
-- The claims were taken out of the code, but the landing page reads its
-- content from site_content and falls back to the code only for keys the
-- saved row does not have. A row written from the admin editor before the
-- code changed still carried "4.9/5", "Trusted by 50,000+ businesses
-- worldwide" and the invented stat bar — so the claims were still live on
-- the site while the repository looked clean.
--
-- Removing the keys rather than rewriting them puts the defaults back in
-- charge. The editor still works: real numbers can be entered whenever
-- there are any.
-- =========================================================================

update public.site_content
set
  value = value - 'showSocialProof' - 'rating' - 'socialProofText' - 'stats',
  updated_at = now()
where key = 'hero'
  and value ?| array['showSocialProof', 'rating', 'socialProofText', 'stats'];

-- ========================================================================
-- 20260918090000_invites_checkout.sql
-- ========================================================================

-- =========================================================================
-- Team invitations.
--
-- Everything multi-user was already built — conversations are assigned,
-- notes are attributed, the lead board groups by owner, plans sell seats —
-- and none of it could be used, because org_members was only ever written
-- by the signup trigger and the admin panel. There was no way to put a
-- second person in a workspace.
--
-- The token is the capability: whoever holds it can join, so it is long,
-- random, single-use and expiring. Nothing else about the invitation is
-- secret, which is why the accept page can be read by an anonymous visitor
-- while everything else here needs membership.
-- =========================================================================

create table if not exists public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Lower-cased on write. "Anita@Example.com" inviting and
  -- "anita@example.com" signing up has to be one person.
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  -- 32 bytes of base64url. Long enough that guessing is not a strategy.
  token text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists org_invites_org_idx
  on public.org_invites(org_id, created_at desc);
-- One live invitation per address per workspace. Re-inviting somebody
-- should replace the old link rather than leave two working.
create unique index if not exists org_invites_live_key
  on public.org_invites(org_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.org_invites enable row level security;

-- Members of the workspace manage its invitations. The accept path does
-- not go through these policies at all — it runs as the service role,
-- because the person accepting is by definition not a member yet.
drop policy if exists org_invites_select on public.org_invites;
drop policy if exists org_invites_select on public.org_invites;
create policy org_invites_select on public.org_invites
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());

drop policy if exists org_invites_insert on public.org_invites;
drop policy if exists org_invites_insert on public.org_invites;
create policy org_invites_insert on public.org_invites
  for insert to authenticated
  with check (public.is_org_member(org_id) or public.is_platform_admin());

drop policy if exists org_invites_update on public.org_invites;
drop policy if exists org_invites_update on public.org_invites;
create policy org_invites_update on public.org_invites
  for update to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin())
  with check (public.is_org_member(org_id) or public.is_platform_admin());

-- =========================================================================
-- Self-serve checkout.
--
-- subscriptions could only be written by platform staff, which is correct
-- as a default — a tenant must not be able to promote itself onto a higher
-- plan — and is why buying one needed a human in the admin panel. The
-- payment webhook writes it instead, using the service role, only after a
-- gateway signature has been verified. So the policy stays shut and the
-- money is what opens it.
-- =========================================================================

-- Which gateway took the payment, and the id it gave back. orders already
-- had provider and provider_reference; this is the link the customer
-- follows, kept so a half-finished checkout can be resumed rather than
-- restarted.
alter table public.orders
  add column if not exists payment_link_url text;
alter table public.orders
  add column if not exists billing_interval text;

comment on column public.orders.payment_link_url is
  'The gateway link for a pending order, so an abandoned checkout can be resumed.';

-- What the coupon actually took off, in the smallest currency unit. Stored
-- rather than recomputed: a coupon edited or deleted later must not change
-- what an old order says the customer paid.
alter table public.orders
  add column if not exists discount_cents integer not null default 0;

comment on column public.orders.discount_cents is
  'Discount applied at the time of purchase. Never recomputed — an edited coupon must not rewrite history.';

-- =========================================================================
-- Counting a coupon's redemptions without losing one.
--
-- times_redeemed += 1 read in the application and written back loses a
-- redemption whenever two people pay at the same moment, which is exactly
-- when a launch discount is being used. Incremented in the database under
-- the row's own lock instead.
-- =========================================================================
create or replace function public.redeem_coupon(target_coupon uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  update public.coupons
  set times_redeemed = times_redeemed + 1
  where id = target_coupon
    and is_active
    and (expires_at is null or expires_at > now())
    and (max_redemptions is null or times_redeemed < max_redemptions)
  returning true into ok;

  -- False when the coupon ran out between the customer seeing the price
  -- and paying it. The caller has already taken the money, so this is a
  -- note on the order rather than a refusal.
  return coalesce(ok, false);
end;
$$;

revoke all on function public.redeem_coupon(uuid) from public;
revoke all on function public.redeem_coupon(uuid) from anon, authenticated;

comment on function public.redeem_coupon(uuid) is
  'Atomic redemption count. Service role only; returns false if the coupon ran out first.';

-- =========================================================================
-- Which gateway takes the platform's own money.
--
-- A tenant paying for Neura Chat must not be charged through their own
-- Razorpay account, or the money goes to them. So checkout uses the
-- platform's credentials, named here: the workspace whose Integrations
-- hold them, and which provider to use.
--
-- Empty until staff fill it in, and checkout says so plainly rather than
-- failing with a gateway error nobody can act on.
-- =========================================================================
insert into public.platform_settings (key, value, description)
values (
  'platform_payment_org',
  '{}'::jsonb,
  'Whose gateway takes payment for Neura Chat itself: {"org_id": "...", "provider": "razorpay|cashfree|stripe"}. Connect the credentials under Integrations on that workspace.'
)
on conflict (key) do nothing;
