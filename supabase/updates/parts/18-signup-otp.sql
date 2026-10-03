-- =========================================================================
-- Sign-up codes — proving a WhatsApp number belongs to the person
-- =========================================================================
-- Sign-up asks for a WhatsApp number so the platform can message its own
-- customers. Before this it simply believed the number: anybody could type
-- a stranger's into the form and the stranger got the messages. That is a
-- spam vector, and it is the kind of thing a business's own WhatsApp
-- number gets blocked for.
--
-- So a six-digit code goes to the number over WhatsApp first, and nothing
-- is written onto an account until it comes back.
--
-- One row per number, rewritten each time a code is asked for. The code
-- itself is never here — an HMAC of it is, keyed to the number and to the
-- app's TOKEN_ENCRYPTION_KEY, so a copy of this table without the server's
-- key is not a list of working codes.
create table if not exists public.signup_otps (
  id uuid primary key default gen_random_uuid(),
  -- The number in Meta's own form: digits only, country code included.
  wa_id text not null unique,
  code_hash text not null,
  expires_at timestamptz not null,
  -- Wrong guesses on the current code. Reset when a new code is sent.
  attempts integer not null default 0,
  -- Codes sent to this number inside the current window.
  sends integer not null default 1,
  last_sent_at timestamptz not null default now(),
  -- When the send tally started, so the daily limit is a rolling window
  -- rather than a midnight reset somebody can wait out.
  window_started_at timestamptz not null default now(),
  -- How the code was delivered. WhatsApp is the point of the exercise;
  -- email is the fallback for when Meta has not approved a code template
  -- yet, and it is recorded because the two prove different things — a
  -- code read in an inbox says nothing about who holds the phone.
  channel text not null default 'whatsapp',
  verified_at timestamptz,
  -- Handed to the browser once the code is right, and exchanged for an
  -- account. Long, random, single-use: it is the only proof the sign-up
  -- form has that the number in it was verified.
  verification_token text unique,
  consumed_at timestamptz,
  -- What was typed on the first step, kept only so the welcome message can
  -- greet them by name. Not identity, and not trusted as any.
  name text,
  email text,
  -- Kept for one purpose: capping how many different numbers one visitor
  -- can have codes sent to. Rows are short-lived and swept below.
  requested_ip text,
  created_at timestamptz not null default now()
);

-- Added separately as well, so a database that already has this table from
-- an earlier run of this file gets the column too.
alter table public.signup_otps
  add column if not exists channel text not null default 'whatsapp';

alter table public.signup_otps
  drop constraint if exists signup_otps_channel_check;
alter table public.signup_otps
  add constraint signup_otps_channel_check check (channel in ('whatsapp', 'email'));

create index if not exists signup_otps_last_sent_idx
  on public.signup_otps(last_sent_at desc);

create index if not exists signup_otps_ip_idx
  on public.signup_otps(requested_ip, last_sent_at desc)
  where requested_ip is not null;

-- No tenant reads or writes this table, ever. Everything that touches it
-- runs as the service role: the people using it have no account yet, so
-- there is no "your own row" to scope a policy to, and a readable
-- verification token is somebody else's half-made account.
alter table public.signup_otps enable row level security;

drop policy if exists signup_otps_no_access on public.signup_otps;
create policy signup_otps_no_access on public.signup_otps
  for all to authenticated
  using (false)
  with check (false);

-- Housekeeping. A verified row is kept a day so a second sign-up attempt
-- on the same number is recognised as already used; an unverified one is
-- rubbish an hour after its code expired. Safe to run at any time, and
-- safe never to run — nothing here is load-bearing, the limits are all
-- time-based.
create or replace function public.sweep_signup_otps()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.signup_otps
  where (verified_at is null and expires_at < now() - interval '1 hour')
     or (verified_at is not null and verified_at < now() - interval '1 day');

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.sweep_signup_otps() from public;
revoke all on function public.sweep_signup_otps() from anon, authenticated;
