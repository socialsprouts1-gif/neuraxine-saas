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

create policy ai_assistants_select on public.ai_assistants
  for select to authenticated using (public.is_org_member(org_id));
create policy ai_assistants_insert on public.ai_assistants
  for insert to authenticated with check (public.is_org_member(org_id));
create policy ai_assistants_update on public.ai_assistants
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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

create policy chatbot_flows_select on public.chatbot_flows
  for select to authenticated using (public.is_org_member(org_id));
create policy chatbot_flows_insert on public.chatbot_flows
  for insert to authenticated with check (public.is_org_member(org_id));
create policy chatbot_flows_update on public.chatbot_flows
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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

create policy faq_entries_select on public.faq_entries
  for select to authenticated using (public.is_org_member(org_id));
create policy faq_entries_insert on public.faq_entries
  for insert to authenticated with check (public.is_org_member(org_id));
create policy faq_entries_update on public.faq_entries
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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

create policy reminders_select on public.reminders
  for select to authenticated using (public.is_org_member(org_id));
create policy reminders_insert on public.reminders
  for insert to authenticated with check (public.is_org_member(org_id));
create policy reminders_update on public.reminders
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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

create policy org_integrations_select on public.org_integrations
  for select to authenticated using (public.is_org_member(org_id));
-- Writes hold third-party credentials, so restrict to owners/admins.
create policy org_integrations_insert on public.org_integrations
  for insert to authenticated with check (public.is_org_admin(org_id));
create policy org_integrations_update on public.org_integrations
  for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
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

create policy api_keys_select on public.api_keys
  for select to authenticated using (public.is_org_member(org_id));
create policy api_keys_insert on public.api_keys
  for insert to authenticated with check (public.is_org_admin(org_id));
create policy api_keys_update on public.api_keys
  for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
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

create policy outgoing_webhooks_select on public.outgoing_webhooks
  for select to authenticated using (public.is_org_member(org_id));
create policy outgoing_webhooks_insert on public.outgoing_webhooks
  for insert to authenticated with check (public.is_org_admin(org_id));
create policy outgoing_webhooks_update on public.outgoing_webhooks
  for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
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

create policy media_assets_select on public.media_assets
  for select to authenticated using (public.is_org_member(org_id));
create policy media_assets_insert on public.media_assets
  for insert to authenticated with check (public.is_org_member(org_id));
create policy media_assets_update on public.media_assets
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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

create policy products_select on public.products
  for select to authenticated using (public.is_org_member(org_id));
create policy products_insert on public.products
  for insert to authenticated with check (public.is_org_member(org_id));
create policy products_update on public.products
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy products_delete on public.products
  for delete to authenticated using (public.is_org_member(org_id));
