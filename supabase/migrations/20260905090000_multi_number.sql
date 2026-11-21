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
