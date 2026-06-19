-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  plan text not null default 'starter' check (plan in ('starter','growth','scale','enterprise')),
  stripe_customer_id text,
  stripe_subscription_id text,
  is_bfsi boolean not null default false,
  dlt_entity_id text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  role text not null default 'agent' check (role in ('owner','admin','agent')),
  full_name text,
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PHONE NUMBERS
-- ============================================================
create table phone_numbers (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  e164 text not null,
  provider text not null default 'mock' check (provider in ('plivo','exotel','mock')),
  capabilities text[] not null default '{voice}',
  status text not null default 'active' check (status in ('active','inactive','porting')),
  series text not null default 'regular' check (series in ('regular','140','1600')),
  dlt_entity_id text,
  dlt_status text not null default 'pending' check (dlt_status in ('pending','submitted','approved','rejected')),
  inbound_agent_id uuid,
  created_at timestamptz not null default now()
);

-- ============================================================
-- AGENTS
-- ============================================================
create table agents (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  direction text not null default 'outbound' check (direction in ('inbound','outbound','both')),
  voice_id text not null default 'mock-emma-f',
  language text not null default 'en' check (language in ('en','hi','hinglish','ta','te','bn')),
  system_prompt text not null default '',
  first_message text not null default '',
  llm_model text not null default 'gemini-2.0-flash',
  temperature numeric(3,2) not null default 0.7,
  tools jsonb not null default '[]',
  end_call_phrases text[] not null default '{}',
  max_duration_sec integer not null default 300,
  status text not null default 'draft' check (status in ('active','inactive','draft')),
  disclosure_enabled boolean not null default true,
  disclosure_text text,
  bolna_agent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- KNOWLEDGE SOURCES
-- ============================================================
create table knowledge_sources (
  id uuid primary key default uuid_generate_v4(),
  agent_id uuid not null references agents(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in ('url','file','text')),
  name text not null,
  content text,
  url text,
  file_path text,
  embedding_status text not null default 'pending' check (embedding_status in ('pending','processing','done','error')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- CONTACTS
-- ============================================================
create table contacts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  e164 text not null,
  email text,
  attributes jsonb not null default '{}',
  tags text[] not null default '{}',
  consent_given boolean not null default false,
  consent_source text,
  consent_at timestamptz,
  dnd boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CONTACT LISTS
-- ============================================================
create table contact_lists (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  contact_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table contact_list_members (
  id uuid primary key default uuid_generate_v4(),
  list_id uuid not null references contact_lists(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (list_id, contact_id)
);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references agents(id),
  name text not null,
  contact_list_id uuid not null references contact_lists(id),
  schedule_start timestamptz,
  schedule_end timestamptz,
  calling_hours_start time not null default '09:00',
  calling_hours_end time not null default '21:00',
  calling_days int[] not null default '{1,2,3,4,5}',
  concurrency integer not null default 5,
  retry_policy jsonb not null default '{"max_attempts":3,"delay_minutes":60,"on_statuses":["no_answer","busy"]}',
  call_category text not null default 'transactional' check (call_category in ('promotional','transactional','service')),
  dlt_template_id text,
  from_number_id uuid references phone_numbers(id),
  status text not null default 'draft' check (status in ('draft','running','paused','done','failed')),
  calls_total integer not null default 0,
  calls_completed integer not null default 0,
  calls_failed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CALLS
-- ============================================================
create table calls (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid references agents(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  from_e164 text not null,
  to_e164 text not null,
  status text not null default 'queued' check (status in ('queued','initiating','ringing','answered','in_progress','ended','failed','no_answer','busy','cancelled')),
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  recording_url text,
  cost numeric(10,4),
  disposition text check (disposition in ('completed','interested','not_interested','callback','voicemail','no_answer','busy','failed')),
  summary text,
  sentiment text check (sentiment in ('positive','negative','neutral')),
  structured_data jsonb not null default '{}',
  provider_call_id text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CALL EVENTS
-- ============================================================
create table call_events (
  id uuid primary key default uuid_generate_v4(),
  call_id uuid not null references calls(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  ts timestamptz not null default now()
);

-- ============================================================
-- TRANSCRIPTS
-- ============================================================
create table transcripts (
  id uuid primary key default uuid_generate_v4(),
  call_id uuid not null references calls(id) on delete cascade,
  role text not null check (role in ('agent','caller')),
  text text not null,
  ts timestamptz not null default now(),
  seq integer not null default 0
);

-- ============================================================
-- WEBHOOKS
-- ============================================================
create table webhooks (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  url text not null,
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  events text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- USAGE LEDGER
-- ============================================================
create table usage_ledger (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  period text not null,
  minutes_used numeric(10,2) not null default 0,
  calls_count integer not null default 0,
  cost numeric(10,4) not null default 0,
  unique (org_id, period)
);

-- ============================================================
-- API KEYS
-- ============================================================
create table api_keys (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  hashed_key text not null unique,
  label text not null,
  last_used timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index on calls (org_id, created_at desc);
create index on calls (campaign_id);
create index on calls (contact_id);
create index on calls (status);
create index on transcripts (call_id, seq);
create index on call_events (call_id, ts);
create index on contacts (org_id, e164);
create index on contact_list_members (list_id);
create index on campaigns (org_id, status);

-- ============================================================
-- RLS POLICIES
-- ============================================================
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table phone_numbers enable row level security;
alter table agents enable row level security;
alter table knowledge_sources enable row level security;
alter table contacts enable row level security;
alter table contact_lists enable row level security;
alter table contact_list_members enable row level security;
alter table campaigns enable row level security;
alter table calls enable row level security;
alter table call_events enable row level security;
alter table transcripts enable row level security;
alter table webhooks enable row level security;
alter table usage_ledger enable row level security;
alter table api_keys enable row level security;

-- Helper function: get the org_id for the current auth user
create or replace function auth_org_id() returns uuid language sql stable security definer as $$
  select org_id from profiles where id = auth.uid()
$$;

-- Organizations: members can read their own org
create policy "org_select" on organizations for select using (id = auth_org_id());
create policy "org_update_owner" on organizations for update using (
  id = auth_org_id() and exists(select 1 from profiles where id = auth.uid() and role = 'owner')
);

-- Profiles: users see own org's profiles
create policy "profiles_select" on profiles for select using (org_id = auth_org_id());
create policy "profiles_update_self" on profiles for update using (id = auth.uid());

-- All other tables: org_id = caller's org
create policy "phone_numbers_select" on phone_numbers for select using (org_id = auth_org_id());
create policy "phone_numbers_insert" on phone_numbers for insert with check (org_id = auth_org_id());
create policy "phone_numbers_update" on phone_numbers for update using (org_id = auth_org_id());
create policy "phone_numbers_delete" on phone_numbers for delete using (org_id = auth_org_id());

create policy "agents_select" on agents for select using (org_id = auth_org_id());
create policy "agents_insert" on agents for insert with check (org_id = auth_org_id());
create policy "agents_update" on agents for update using (org_id = auth_org_id());
create policy "agents_delete" on agents for delete using (org_id = auth_org_id());

create policy "knowledge_sources_select" on knowledge_sources for select using (org_id = auth_org_id());
create policy "knowledge_sources_insert" on knowledge_sources for insert with check (org_id = auth_org_id());
create policy "knowledge_sources_delete" on knowledge_sources for delete using (org_id = auth_org_id());

create policy "contacts_select" on contacts for select using (org_id = auth_org_id());
create policy "contacts_insert" on contacts for insert with check (org_id = auth_org_id());
create policy "contacts_update" on contacts for update using (org_id = auth_org_id());
create policy "contacts_delete" on contacts for delete using (org_id = auth_org_id());

create policy "contact_lists_select" on contact_lists for select using (org_id = auth_org_id());
create policy "contact_lists_insert" on contact_lists for insert with check (org_id = auth_org_id());
create policy "contact_lists_update" on contact_lists for update using (org_id = auth_org_id());
create policy "contact_lists_delete" on contact_lists for delete using (org_id = auth_org_id());

create policy "contact_list_members_select" on contact_list_members for select using (
  exists(select 1 from contact_lists l where l.id = list_id and l.org_id = auth_org_id())
);
create policy "contact_list_members_insert" on contact_list_members for insert with check (
  exists(select 1 from contact_lists l where l.id = list_id and l.org_id = auth_org_id())
);
create policy "contact_list_members_delete" on contact_list_members for delete using (
  exists(select 1 from contact_lists l where l.id = list_id and l.org_id = auth_org_id())
);

create policy "campaigns_select" on campaigns for select using (org_id = auth_org_id());
create policy "campaigns_insert" on campaigns for insert with check (org_id = auth_org_id());
create policy "campaigns_update" on campaigns for update using (org_id = auth_org_id());
create policy "campaigns_delete" on campaigns for delete using (org_id = auth_org_id());

create policy "calls_select" on calls for select using (org_id = auth_org_id());
create policy "calls_insert" on calls for insert with check (org_id = auth_org_id());
create policy "calls_update" on calls for update using (org_id = auth_org_id());

create policy "call_events_select" on call_events for select using (
  exists(select 1 from calls c where c.id = call_id and c.org_id = auth_org_id())
);

create policy "transcripts_select" on transcripts for select using (
  exists(select 1 from calls c where c.id = call_id and c.org_id = auth_org_id())
);

create policy "webhooks_select" on webhooks for select using (org_id = auth_org_id());
create policy "webhooks_insert" on webhooks for insert with check (org_id = auth_org_id());
create policy "webhooks_update" on webhooks for update using (org_id = auth_org_id());
create policy "webhooks_delete" on webhooks for delete using (org_id = auth_org_id());

create policy "usage_ledger_select" on usage_ledger for select using (org_id = auth_org_id());

create policy "api_keys_select" on api_keys for select using (org_id = auth_org_id());
create policy "api_keys_insert" on api_keys for insert with check (org_id = auth_org_id());
create policy "api_keys_delete" on api_keys for delete using (org_id = auth_org_id());

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger agents_updated_at before update on agents for each row execute function set_updated_at();
create trigger campaigns_updated_at before update on campaigns for each row execute function set_updated_at();

-- ============================================================
-- TRIGGER: auto-update contact_list count
-- ============================================================
create or replace function update_list_contact_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update contact_lists set contact_count = contact_count + 1 where id = new.list_id;
  elsif tg_op = 'DELETE' then
    update contact_lists set contact_count = contact_count - 1 where id = old.list_id;
  end if;
  return null;
end;
$$;
create trigger contact_list_member_count after insert or delete on contact_list_members for each row execute function update_list_contact_count();
