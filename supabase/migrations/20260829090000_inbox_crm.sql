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
create policy conversation_notes_select on public.conversation_notes
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists conversation_notes_insert on public.conversation_notes;
create policy conversation_notes_insert on public.conversation_notes
  for insert to authenticated with check (public.is_org_member(org_id));
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
create policy conversation_events_select on public.conversation_events
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists conversation_events_insert on public.conversation_events;
create policy conversation_events_insert on public.conversation_events
  for insert to authenticated with check (public.is_org_member(org_id));
