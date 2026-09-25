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
create policy org_invites_select on public.org_invites
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());

drop policy if exists org_invites_insert on public.org_invites;
create policy org_invites_insert on public.org_invites
  for insert to authenticated
  with check (public.is_org_member(org_id) or public.is_platform_admin());

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
