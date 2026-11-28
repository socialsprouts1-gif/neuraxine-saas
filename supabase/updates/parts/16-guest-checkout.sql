-- =========================================================================
-- Guest checkout — paying before there is an account
-- =========================================================================
-- The pricing page opens the payment window straight away, and the
-- workspace is created afterwards from the details the payment collected.
-- orders.org_id is not null, correctly, so a payment with no workspace yet
-- cannot live there. It lives here until it has one.
--
-- The claim token is what makes this safe: money arrives before anybody
-- has proved who they are, so the payment has to be recoverable by them
-- and only by them. It is spent the moment it is used.
create table if not exists public.guest_checkouts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete restrict,
  -- 32 hex characters from crypto-quality randomness.
  claim_token text not null unique,
  amount_cents integer not null default 0,
  currency text not null default 'INR',
  billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'yearly')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'claimed', 'expired')),
  provider text,
  -- The gateway's own order id, which is what a payment is matched on.
  provider_reference text,
  provider_payment_id text,
  -- Collected by the gateway before it takes the card, and used to
  -- prefill the sign-up form. Never trusted as identity.
  contact_name text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  claimed_at timestamptz,
  claimed_org_id uuid references public.organizations(id) on delete set null
);

create index if not exists guest_checkouts_reference_idx
  on public.guest_checkouts(provider_reference)
  where provider_reference is not null;

create index if not exists guest_checkouts_status_idx
  on public.guest_checkouts(status, created_at desc);

-- No tenant ever reads or writes this table. Everything that touches it
-- runs as the service role, because a row here is a payment that does not
-- belong to a workspace yet — there is no "your own" to scope it to, and
-- a readable claim token is a free workspace for whoever reads it.
alter table public.guest_checkouts enable row level security;

drop policy if exists guest_checkouts_no_access on public.guest_checkouts;
create policy guest_checkouts_no_access on public.guest_checkouts
  for all to authenticated
  using (false)
  with check (false);
