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
create policy campaign_steps_select on public.campaign_steps
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists campaign_steps_insert on public.campaign_steps;
create policy campaign_steps_insert on public.campaign_steps
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists campaign_steps_update on public.campaign_steps;
create policy campaign_steps_update on public.campaign_steps
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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
