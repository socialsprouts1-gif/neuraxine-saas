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
