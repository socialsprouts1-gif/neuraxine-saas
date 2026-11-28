-- =====================================================================
-- Instagram sending limits and a master switch
-- =====================================================================
--
-- An automation that answers every comment had no cap of any kind. On a
-- quiet week that is fine. On a reel that takes off it is a business
-- account sending hundreds of unsolicited messages to strangers in an
-- hour, which is what Instagram restricts accounts for — and the account
-- it restricts is the customer's, not ours.
--
-- Worse, a refused send was retried on the next matching comment as if
-- nothing had happened. Repeated refusals are themselves a signal to
-- Meta's integrity systems, so an automation that was already failing
-- made the situation worse the longer it ran.
--
-- Three things here:
--
--   * a count of what has actually been sent, so a limit can be real
--     rather than a guess
--   * limits per account, with conservative defaults, because the right
--     number for a corner shop is not the right number for a brand
--   * one switch that stops everything, instantly, without having to
--     find and turn off each automation in turn

create table if not exists public.instagram_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid not null references public.instagram_connections (id) on delete cascade,

  -- What it was, so a limit can treat a reply to a comment differently
  -- from an answer to somebody who wrote in first. The second is a
  -- conversation; only the first is unsolicited.
  kind text not null default 'dm'
    check (kind in ('dm', 'private_reply', 'comment_reply', 'followup')),

  created_at timestamptz not null default now()
);

-- The only query this table has: how many in the last hour, and today.
create index if not exists instagram_sends_window_idx
  on public.instagram_sends (connection_id, created_at desc);

alter table public.instagram_connections
  -- Conservative on purpose. An automation nobody is watching should
  -- stop early and be raised deliberately, rather than run until
  -- somebody at Meta decides it has gone too far.
  add column if not exists sends_per_hour integer not null default 30,
  add column if not exists sends_per_day integer not null default 150,

  -- The master switch. Set means every automation on this account is
  -- off, whatever each one says, and the reason is shown on screen.
  add column if not exists automation_paused_at timestamptz,
  add column if not exists automation_paused_reason text;

alter table public.instagram_sends enable row level security;

drop policy if exists instagram_sends_own_org on public.instagram_sends;
create policy instagram_sends_own_org on public.instagram_sends
  for select using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

notify pgrst, 'reload schema';
