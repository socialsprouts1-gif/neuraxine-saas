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
create policy bot_runs_select on public.bot_runs
  for select to authenticated using (public.is_org_member(org_id));
