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
create policy whatsapp_flows_select on public.whatsapp_flows
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists whatsapp_flows_insert on public.whatsapp_flows;
create policy whatsapp_flows_insert on public.whatsapp_flows
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists whatsapp_flows_update on public.whatsapp_flows;
create policy whatsapp_flows_update on public.whatsapp_flows
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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
create policy flow_sends_select on public.flow_sends
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists flow_sends_insert on public.flow_sends;
create policy flow_sends_insert on public.flow_sends
  for insert to authenticated with check (public.is_org_member(org_id));
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
create policy flow_responses_select on public.flow_responses
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists flow_responses_delete on public.flow_responses;
create policy flow_responses_delete on public.flow_responses
  for delete to authenticated using (public.is_org_member(org_id));
-- No insert policy for members: responses are written by the webhook with
-- the service role. A member forging a submission would corrupt the record
-- of what a customer actually said.

notify pgrst, 'reload schema';
