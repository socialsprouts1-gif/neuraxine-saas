-- =====================================================================
-- Staff links — firing an event without writing any code
-- =====================================================================
--
-- The events API assumed somebody else's software would call it. For a
-- business that already has a till or a booking panel, that is right. For
-- the restaurant that has a WhatsApp number and a notebook, it is a pipe
-- with nothing at the other end — and that is most of them.
--
-- A staff link is the other end. One web address, no login, big buttons:
-- type the customer's number, tap "Bill paid", and the automation runs.
-- A waiter opens it once on their phone and keeps it open all evening.
--
-- No login is the whole point, so the token carries the authority. Twenty
-- four random bytes, revocable, one per workspace — and it can only do
-- the one thing: fire events this workspace has already written rules
-- for. It cannot read a contact, a message or anything else.

create table if not exists public.staff_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,

  -- What it is for, so a revoked one can be told from a live one:
  -- "Front counter", "Rahul's phone".
  name text not null default 'Staff link',

  token text not null unique,

  -- Optional, and the reason this is a table rather than a column. A
  -- workspace can hand the counter one link and the delivery staff
  -- another, and take either back without disturbing the other.
  created_by uuid references auth.users (id) on delete set null,
  last_used_at timestamptz,
  uses integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists staff_links_org_idx on public.staff_links (org_id);

alter table public.staff_links enable row level security;

-- Only the workspace sees its own links. The page that uses one reads it
-- with the service role, having been given the token in the URL — the
-- same shape as the public invoice page, and for the same reason: a
-- policy permissive enough to allow an anonymous token lookup is also
-- permissive enough to allow listing every link on the platform.
drop policy if exists staff_links_own_org on public.staff_links;
create policy staff_links_own_org on public.staff_links
  for all using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  ) with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

notify pgrst, 'reload schema';
