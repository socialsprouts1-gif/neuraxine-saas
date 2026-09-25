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
create policy crm_sync_log_select on public.crm_sync_log
  for select to authenticated using (public.is_org_member(org_id));

-- Written by the server on the org's behalf, so the insert is a member
-- insert rather than a service-role one: the webhook path runs as the org.
drop policy if exists crm_sync_log_insert on public.crm_sync_log;
create policy crm_sync_log_insert on public.crm_sync_log
  for insert to authenticated with check (public.is_org_member(org_id));

drop policy if exists crm_sync_log_delete on public.crm_sync_log;
create policy crm_sync_log_delete on public.crm_sync_log
  for delete to authenticated using (public.is_org_member(org_id));

notify pgrst, 'reload schema';
