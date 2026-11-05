-- =========================================================================
-- Instagram: direct messages and comment replies
-- =========================================================================
-- A second channel into the same automation. Everything that decides what
-- to reply with — keyword bots, flows, the FAQ, the AI assistant, handoff
-- — already works on a conversation and a connection rather than on a
-- phone number, so Instagram is a new way in rather than a second product.
--
-- Two things it needs that WhatsApp did not.
--
-- The conversation has to remember which channel it came from. Without it
-- the reply goes out of whichever door was hardcoded, and an Instagram DM
-- is answered on WhatsApp — to a number that does not exist, because an
-- Instagram-scoped user id is not a phone number.
--
-- And comments are not messages. A comment is public, belongs to a post,
-- and is answered either in public or by a private reply that may only be
-- sent within seven days and is addressed to the comment rather than to
-- the person. That does not fit in `messages`, so it gets its own table.

-- --- the connection ------------------------------------------------------
--
-- Deliberately not a row in waba_connections. That table is shaped like a
-- WhatsApp number — waba_id, phone_number_id, quality_rating — and
-- stretching it to cover a channel with none of those produces a table
-- where half the columns are null and nobody can tell which half matters.

create table if not exists public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The Instagram-scoped id of the professional account.
  ig_user_id text not null,
  username text,
  account_name text,
  profile_picture_url text,
  -- Encrypted with TOKEN_ENCRYPTION_KEY, exactly like the WhatsApp token.
  -- A long-lived Instagram token lasts 60 days and is refreshed, so the
  -- expiry is stored rather than guessed at.
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  -- Proves an inbound webhook came from Meta, same as the WhatsApp side.
  webhook_verify_token text not null,
  status text not null default 'active',
  is_default boolean not null default false,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One workspace cannot connect the same Instagram account twice, and two
-- workspaces cannot both claim one — whichever connected it owns it,
-- because otherwise an inbound DM has two possible destinations.
create unique index if not exists instagram_connections_account_idx
  on public.instagram_connections (ig_user_id);

create index if not exists instagram_connections_org_idx
  on public.instagram_connections (org_id);

-- --- which door a conversation came through ------------------------------
--
-- Defaulting to 'whatsapp' is what makes this safe to run on a live
-- database: every conversation that already exists came from there, and
-- saying so explicitly beats leaving a null for the sender to interpret.

alter table public.conversations
  add column if not exists channel text not null default 'whatsapp';

alter table public.conversations
  add column if not exists instagram_connection_id uuid
  references public.instagram_connections(id) on delete set null;

alter table public.messages
  add column if not exists channel text not null default 'whatsapp';

create index if not exists conversations_ig_connection_idx
  on public.conversations (instagram_connection_id);

-- --- the contact's Instagram identity ------------------------------------
--
-- An Instagram-scoped user id is per-app and is not a phone number, so it
-- cannot live in wa_id without making every phone-number lookup wrong.

alter table public.contacts
  add column if not exists ig_user_id text,
  add column if not exists ig_username text;

create index if not exists contacts_ig_user_idx on public.contacts (org_id, ig_user_id);

-- --- comment automation --------------------------------------------------
--
-- A rule is "when somebody comments X on a post, send them Y". The reply
-- is a private one by default: a public thread full of identical bot
-- replies is what makes an account look automated, and the DM is the
-- thing worth having anyway.

create table if not exists public.instagram_comment_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.instagram_connections(id) on delete cascade,
  name text not null,
  -- Empty means every comment, which is a real setting and not a mistake:
  -- "DM everybody who comments on this post" is the common campaign.
  keywords text[] not null default '{}',
  -- Null means any post. A specific id scopes the rule to one post.
  media_id text,
  -- The DM. Null means do not DM.
  dm_message text,
  -- An optional public reply under the comment.
  public_reply text,
  is_active boolean not null default true,
  -- How many times it has fired, so a rule that is doing nothing is
  -- visible rather than assumed to be working.
  sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists instagram_comment_rules_org_idx
  on public.instagram_comment_rules (org_id, is_active);

-- --- what a comment rule did ---------------------------------------------
--
-- One row per comment handled, keyed on the comment id so a redelivered
-- webhook cannot DM the same person twice. Meta retries, and a customer
-- receiving the same automated DM four times is worse than missing one.

create table if not exists public.instagram_comment_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.instagram_connections(id) on delete cascade,
  rule_id uuid references public.instagram_comment_rules(id) on delete set null,
  comment_id text not null,
  media_id text,
  from_username text,
  comment_text text,
  outcome text not null,
  error text,
  created_at timestamptz not null default now()
);

create unique index if not exists instagram_comment_events_comment_idx
  on public.instagram_comment_events (comment_id);

create index if not exists instagram_comment_events_org_idx
  on public.instagram_comment_events (org_id, created_at desc);

-- --- who can see it ------------------------------------------------------
--
-- A workspace's own rows, readable by its members. The token column is
-- never selected by anything the browser can reach, and writes go through
-- the service role behind a server action.

alter table public.instagram_connections enable row level security;
alter table public.instagram_comment_rules enable row level security;
alter table public.instagram_comment_events enable row level security;

drop policy if exists instagram_connections_read on public.instagram_connections;
create policy instagram_connections_read on public.instagram_connections
  for select using (public.is_org_member(org_id));

drop policy if exists instagram_comment_rules_rw on public.instagram_comment_rules;
create policy instagram_comment_rules_rw on public.instagram_comment_rules
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

drop policy if exists instagram_comment_events_read on public.instagram_comment_events;
create policy instagram_comment_events_read on public.instagram_comment_events
  for select using (public.is_org_member(org_id));

notify pgrst, 'reload schema';
