-- =========================================================================
-- Email templates, audiences, and the switches for what sends by itself
-- =========================================================================
-- Three things that were hard-coded and are now the operator's to decide.
--
-- What the messages say. Every email this product sends was a function in
-- the source — which is correct for a payment receipt and wrong for a
-- trial follow-up, because the wording of a follow-up is a marketing
-- decision and the person making it cannot deploy. A row here replaces the
-- built-in wording for that kind of message, and deleting the row puts the
-- built-in back. Nothing is copied at save time, so an edit is always one
-- row and the default is never lost.
--
-- Who gets a one-off. A group is a list of workspaces with a name, and it
-- exists because "send to everyone" is the only audience the product had.
-- An operator who wants to write to the eleven customers whose trial ended
-- last month should not have to choose between eleven and four hundred.
--
-- The templates seeded at the bottom are starting points, not fixtures.
-- They are ordinary rows: edit them, rename them, delete them.

-- --- what the messages say -----------------------------------------------

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  -- Stable across renames, which is what a link to a template holds.
  slug text not null unique,
  name text not null,
  subject text not null,
  -- Paragraphs separated by a blank line. Not HTML: the shell around it —
  -- the banner, the button, the footer, the table scaffolding Outlook
  -- needs — is built in code, and a template that could inject markup
  -- into that shell would be a template that can break every client it is
  -- rendered in.
  body text not null,
  action_label text,
  -- Relative to the app's own URL, so a template survives the deployment
  -- moving domain. '/billing', not 'https://…/billing'.
  action_path text,
  -- When set, this replaces the built-in wording of that automatic
  -- message. Null means it is a template for one-off sends.
  overrides_kind text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One override per kind. Two rows claiming to be the trial follow-up is a
-- coin toss over what a customer receives.
create unique index if not exists email_templates_override_idx
  on public.email_templates (overrides_kind)
  where overrides_kind is not null;

-- --- who gets a one-off --------------------------------------------------

create table if not exists public.email_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.email_group_members (
  group_id uuid not null references public.email_groups(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, org_id)
);

-- --- the record of a one-off send ----------------------------------------
--
-- email_log already holds every message. This holds the send that produced
-- a batch of them, which is the unit a person thinks in: "the October
-- offer went to 38 people on the 9th". The id is also what keys each
-- message's dedupe, which is what makes a second send of the same template
-- actually go out — the guard that stops a cron sending twice must not
-- stop a human sending deliberately.

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.email_templates(id) on delete set null,
  subject text not null,
  audience text not null,
  audience_label text not null,
  sent integer not null default 0,
  skipped integer not null default 0,
  failed integer not null default 0,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists email_campaigns_created_idx
  on public.email_campaigns (created_at desc);

-- --- locked to the server ------------------------------------------------
--
-- Platform-wide, not a tenant's. Every read and write goes through the
-- service role behind a platform-admin check; enabling RLS with no policy
-- at all is what makes that true rather than merely intended.

alter table public.email_templates enable row level security;
alter table public.email_groups enable row level security;
alter table public.email_group_members enable row level security;
alter table public.email_campaigns enable row level security;

-- --- starting points -----------------------------------------------------
--
-- on conflict do nothing, so running this file again does not undo an edit.

insert into public.email_templates (slug, name, subject, body, action_label, action_path)
values
  (
    'announcement',
    'Something new',
    'New in {{brand}}: a feature worth two minutes',
    E'Hi {{workspace}},\n\nWe have just shipped something we think you will use.\n\nWrite what it does in one sentence here, then what it saves the reader. Keep it to three short paragraphs — an email that needs scrolling gets archived.\n\nAny questions, just reply to this message.',
    'See what is new',
    '/overview'
  ),
  (
    'offer',
    'A limited offer',
    'A month on us, if you come back this week',
    E'Hi {{workspace}},\n\nYour workspace is still exactly as you left it — the contacts, the chat history, the bots you built.\n\nIf price was the reason you stopped, say so by replying and we will sort something out. Otherwise this is the nudge: plans start at {{price}} and you can cancel any time.',
    'See plans',
    '/billing'
  ),
  (
    'check-in',
    'Checking in',
    'How is WhatsApp going for you?',
    E'Hi {{workspace}},\n\nYou set {{brand}} up a little while ago and I wanted to ask how it is going.\n\nIf something is in the way — a number that will not connect, a template Meta keeps rejecting, a bot that answers the wrong thing — reply to this and I will look at it myself.\n\nIf it is working, I would love to hear that too.',
    'Open the dashboard',
    '/overview'
  ),
  (
    'maintenance',
    'Planned maintenance',
    'Short maintenance window this weekend',
    E'Hi {{workspace}},\n\nWe are doing some planned work on Sunday between 2am and 4am IST.\n\nIncoming WhatsApp messages are queued and delivered afterwards, so nothing from a customer is lost. The dashboard may be briefly unavailable during the window.\n\nNothing is needed from you.',
    null,
    null
  ),
  (
    'payment-nudge',
    'Payment reminder',
    'Your {{brand}} invoice is waiting',
    E'Hi {{workspace}},\n\nThis is a reminder that there is an unpaid invoice on your account.\n\nOnce it is settled everything carries on as normal. If the payment has already gone out, ignore this — it can take a day to show up on our side.',
    'Pay now',
    '/billing'
  )
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
