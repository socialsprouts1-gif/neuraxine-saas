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

create policy canned_messages_select on public.canned_messages
  for select to authenticated using (public.is_org_member(org_id));
create policy canned_messages_insert on public.canned_messages
  for insert to authenticated with check (public.is_org_member(org_id));
create policy canned_messages_update on public.canned_messages
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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

create policy contact_groups_select on public.contact_groups
  for select to authenticated using (public.is_org_member(org_id));
create policy contact_groups_insert on public.contact_groups
  for insert to authenticated with check (public.is_org_member(org_id));
create policy contact_groups_update on public.contact_groups
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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

create policy contact_group_members_select on public.contact_group_members
  for select to authenticated using (public.is_org_member(org_id));
create policy contact_group_members_insert on public.contact_group_members
  for insert to authenticated with check (public.is_org_member(org_id));
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

create policy contact_columns_select on public.contact_columns
  for select to authenticated using (public.is_org_member(org_id));
create policy contact_columns_insert on public.contact_columns
  for insert to authenticated with check (public.is_org_member(org_id));
create policy contact_columns_update on public.contact_columns
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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
