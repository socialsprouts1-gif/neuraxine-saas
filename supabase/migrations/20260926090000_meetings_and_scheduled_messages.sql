-- Meetings that say where they are, and messages that go out later.
--
-- Two changes that belong together because they are the same idea: a
-- commitment made now that has to reach the customer at the right moment.

-- ---------------------------------------------------------------------
-- Meetings: where it happens, on which number, and whether the customer
-- has been told.
-- ---------------------------------------------------------------------

alter table public.meetings
  -- google_meet, zoom, calendly, phone, in_person, other. Text rather than
  -- an enum so adding one is a deploy, not a migration and a deploy.
  add column if not exists platform text,
  -- The joining link. Separate from `location`, which is free text and is
  -- what somebody types for an office address.
  add column if not exists meeting_url text,
  -- Which WhatsApp number the confirmation goes out on. A workspace with
  -- two numbers has two, and a confirmation arriving from the one the
  -- customer has never messaged reads as a scam.
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmation_error text;

comment on column public.meetings.platform is
  'Where the meeting happens: google_meet, zoom, calendly, phone, in_person, other';
comment on column public.meetings.meeting_url is
  'The joining link, when the platform has one';

-- ---------------------------------------------------------------------
-- Scheduled messages
-- ---------------------------------------------------------------------

-- Writing a message now and having it delivered later.
--
-- The case this exists for: a follow-up that should land tomorrow morning,
-- written today because tomorrow morning is not a time anybody is
-- reliably at a keyboard.
--
-- Deliberately its own table rather than a campaign of one. A campaign
-- carries an audience, a template and a dispatch policy; this carries one
-- message to one person at one time, and modelling it as a campaign would
-- mean every screen about campaigns had to explain the degenerate case.
create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  -- Kept alongside contact_id: a contact deleted between scheduling and
  -- sending should not silently turn into a message with no recipient.
  wa_id text not null,
  connection_id uuid references public.waba_connections(id) on delete set null,
  body text not null,
  send_at timestamptz not null,
  -- pending, sent, failed, cancelled
  status text not null default 'pending',
  sent_at timestamptz,
  error text,
  wa_message_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The sweep asks "what is due, across every workspace" on every run.
create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages (status, send_at)
  where status = 'pending';

create index if not exists scheduled_messages_org_idx
  on public.scheduled_messages (org_id, send_at desc);

alter table public.scheduled_messages enable row level security;

drop policy if exists scheduled_messages_select on public.scheduled_messages;
create policy scheduled_messages_select on public.scheduled_messages
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists scheduled_messages_insert on public.scheduled_messages;
create policy scheduled_messages_insert on public.scheduled_messages
  for insert to authenticated with check (public.is_org_member(org_id));

drop policy if exists scheduled_messages_update on public.scheduled_messages;
create policy scheduled_messages_update on public.scheduled_messages
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

drop policy if exists scheduled_messages_delete on public.scheduled_messages;
create policy scheduled_messages_delete on public.scheduled_messages
  for delete to authenticated using (public.is_org_member(org_id));

notify pgrst, 'reload schema';
