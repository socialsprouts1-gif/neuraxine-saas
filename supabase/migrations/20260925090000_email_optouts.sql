-- People who have asked not to receive the nudges.
--
-- Needed before a List-Unsubscribe header can honestly be put on a
-- message: claiming one-click unsubscribe and then carrying on sending is
-- worse than not offering it, and Gmail checks by sending the request.
--
-- Account mail is deliberately not covered. A receipt, a welcome and a
-- "your subscription ended" are things that happened to somebody's
-- account, and suppressing those would hide money moving.

create table if not exists email_optouts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- Kept for support ("who unsubscribed and when"), and null when somebody
  -- unsubscribes from a link without us knowing which workspace they are.
  org_id uuid references organizations(id) on delete set null,
  source text not null default 'link',
  created_at timestamptz not null default now()
);

-- Lowercased, so Foo@x.com and foo@x.com cannot both be on the list with
-- only one of them ever matching.
create unique index if not exists email_optouts_email_idx
  on email_optouts (lower(email));

alter table email_optouts enable row level security;

-- Written by the unsubscribe route and read by the sender, both of which
-- use the service role. No tenant has a reason to read this through the
-- API, and it holds addresses belonging to other workspaces.
drop policy if exists "email_optouts service only" on email_optouts;
create policy "email_optouts service only" on email_optouts
  for all using (false) with check (false);

notify pgrst, 'reload schema';
