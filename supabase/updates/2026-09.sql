-- Neura Chat — database update for 2026-09
--
-- The migrations added in 2026-09, and nothing else. Paste this into the
-- Supabase SQL editor and press Run.
--
-- Safe to run more than once, and safe to run out of order with other
-- months: tables use "if not exists", columns use "add column if not
-- exists", functions use "create or replace", and every policy is dropped
-- before being recreated.
--
-- If this is a brand new database, run supabase/setup.sql instead — it
-- contains every migration from the beginning.
--
-- Regenerate with: node scripts/build-setup-sql.mjs


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
