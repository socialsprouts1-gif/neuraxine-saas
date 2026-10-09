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
create policy meetings_select on public.meetings
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists meetings_insert on public.meetings;
create policy meetings_insert on public.meetings
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists meetings_update on public.meetings;
create policy meetings_update on public.meetings
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
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
create policy transactions_select on public.transactions
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists transactions_delete on public.transactions;
create policy transactions_delete on public.transactions
  for delete to authenticated using (public.is_org_member(org_id));
