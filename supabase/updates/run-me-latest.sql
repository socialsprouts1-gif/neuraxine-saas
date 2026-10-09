-- Neura Chat — the latest database updates
--
-- Paste the whole file into the Supabase SQL editor and press Run.
--
-- Safe to run more than once. Every statement either creates something
-- only if it is missing, replaces a function outright, or drops a policy
-- before recreating it — so running this twice changes nothing the second
-- time, and running it when you are already up to date is a no-op.
--
-- Run it top to bottom in one go. The sections are in dependency order.
--
-- What is in here, newest last:
--
--   1. Seven-day trial                  — the trial length every new
--                                         workspace gets
--   2. Platform admin sees every org    — admin screens could only see
--                                         workspaces you belong to
--   3. Email transport columns          — records how each message was
--                                         sent and as whom
--   4. Email opt-outs                   — the unsubscribe list, needed
--                                         before unsubscribe links work
--   5. Meetings + scheduled messages    — meeting platform and link, and
--                                         the queue for messages written
--                                         now and sent later
--   6. Group sending                    — a default number per group and
--                                         a record of what was sent
--   7. Group icons and key contacts     — a picture on each group, and
--                                         a role marking who speaks for it
--   8. Invoice delivery                — records whether an invoice
--                                         reached the customer, and the
--                                         number it is sent from
--   9. Form number                      — which number a WhatsApp form
--                                         is created on
--  10. Shiprocket orders               — structured shipping address and
--                                         what Shiprocket sends back
--  11. Shipment documents              — label, invoice and pickup
--  12. FAQ number                      — which number each FAQ answers on
--  13. Cart checkout                   — ask for the money when a cart
--                                         arrives, instead of waiting for
--                                         somebody to press a button
--  14. Guest checkout                  — paying from the pricing page
--                                         before there is an account to
--                                         pay for
--  15. Plan limits                     — unlimited messages and contacts;
--                                         the WhatsApp number count is
--                                         what the tiers differ on
--  16. Sign-up codes                   — a WhatsApp code that proves the
--                                         number somebody signs up with
--                                         is really theirs
--  17. Drip campaigns                  — follow-up sequences people join
--                                         one at a time and walk through
--                                         on their own clock
--  18. Agent persona                   — the language an AI agent answers
--                                         in, and how it speaks
--  19. Message wallet                  — money in, and what each template
--                                         send takes off the balance
--  20. Email templates and audiences   — what the automatic messages say,
--                                         which of them send at all, and
--                                         named groups to write to
--  21. Site analytics                  — what visitors do before they
--                                         become customers, with no IP
--                                         address and nothing typed
--
-- Every one of them is included whether or not you have run it before.
-- They are harmless to re-run, so it does not matter which you got to.



-- =====================================================================
-- 20260922090000_trial_seven_days.sql
-- =====================================================================

-- The free trial is seven days.
--
-- It was seeded at fourteen and the number was also written into five
-- files as a fallback. Those now read a single constant, and this brings
-- the stored setting in line with it — a default that disagrees with
-- itself is worse than a wrong one, because the banner counts down from a
-- different number than the welcome email promised and neither matches
-- what the database actually gave.
--
-- Only the setting changes. Workspaces already trialling keep the end date
-- they were given: shortening somebody's trial underneath them, for a
-- change they never asked for, is not a default change — it is taking
-- something back.

update public.platform_settings
set value = jsonb_set(coalesce(value, '{}'::jsonb), '{trial_days}', '7'::jsonb),
    updated_at = now()
where key = 'billing';

insert into public.platform_settings (key, value, description)
values ('billing', '{"trial_days":7}'::jsonb, 'Length of the free trial given to a new workspace, in days')
on conflict (key) do nothing;

notify pgrst, 'reload schema';


-- =====================================================================
-- 20260923090000_platform_admin_workspaces.sql
-- =====================================================================

-- A platform admin can see and administer every workspace.
--
-- organizations and org_members were the only two tables left whose
-- policies read `is_org_member` / `is_org_admin` with no platform-admin
-- exception. Every other tenant table already has one. The effect was that
-- the admin panel showed staff their own workspaces and nobody else's:
-- /admin/organizations listed the handful the admin happened to belong to,
-- so three fresh signups appeared to have created nothing at all.
--
-- The writes failed worse than the reads. Postgres does not error on an
-- UPDATE whose rows are filtered out by RLS — it reports zero rows changed,
-- which PostgREST returns as success. So changing somebody's role, editing
-- feature overrides and suspending a workspace all came back with a green
-- confirmation and changed nothing. "It is not changing" with no error on
-- screen is exactly what that looks like from the outside.

drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.is_platform_admin());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_admin(id) or public.is_platform_admin())
  with check (public.is_org_admin(id) or public.is_platform_admin());

drop policy if exists org_members_select on public.org_members;
create policy org_members_select on public.org_members
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_platform_admin());

drop policy if exists org_members_insert on public.org_members;
create policy org_members_insert on public.org_members
  for insert to authenticated
  with check (public.is_org_admin(org_id) or public.is_platform_admin());

drop policy if exists org_members_update on public.org_members;
create policy org_members_update on public.org_members
  for update to authenticated
  using (public.is_org_admin(org_id) or public.is_platform_admin())
  with check (public.is_org_admin(org_id) or public.is_platform_admin());

drop policy if exists org_members_delete_admin on public.org_members;
create policy org_members_delete_admin on public.org_members
  for delete to authenticated
  using (public.is_org_admin(org_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------

-- What role the person who creates a workspace is given.
--
-- Settable, because it is a policy decision rather than a fact about the
-- software. It defaults to owner, and that default is deliberate: owner and
-- admin are the roles that may connect a WhatsApp number, open billing,
-- manage integrations and invite anybody. A workspace whose only member is
-- a plain member cannot be set up by the person who just signed up for it —
-- they would have to ask support before they could send a single message,
-- which is a strange way to start a seven-day trial.
--
-- Change it from Admin → Settings → New signups when that is what you want.
create or replace function public.signup_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select value ->> 'default_role'
       from public.platform_settings
      where key = 'signups'
        and value ->> 'default_role' in ('owner', 'admin', 'member')),
    'owner'
  );
$$;

grant execute on function public.signup_role() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  org_name text;
begin
  org_name := coalesce(
    new.raw_user_meta_data ->> 'org_name',
    new.raw_user_meta_data ->> 'full_name',
    split_part(new.email, '@', 1),
    'My Organization'
  );

  insert into public.organizations (name)
  values (org_name)
  returning id into new_org_id;

  insert into public.org_members (org_id, user_id, role)
  values (new_org_id, new.id, public.signup_role());

  insert into public.profiles (user_id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;

  insert into public.subscriptions (org_id, status, current_period_start, current_period_end)
  values (
    new_org_id,
    'trialing',
    now(),
    now() + make_interval(days => public.trial_days())
  )
  on conflict (org_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The repair path gives the same role as the signup trigger, so which of
-- the two happened to create a workspace is not something anybody can tell
-- from the outside.
create or replace function public.provision_org_for_user(
  target_user uuid,
  org_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing uuid;
  created uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user::text, 0));

  select org_id into existing
  from public.org_members
  where user_id = target_user
  order by created_at
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.organizations (name)
  values (coalesce(nullif(btrim(org_name), ''), 'My Organization'))
  returning id into created;

  insert into public.org_members (org_id, user_id, role)
  values (created, target_user, public.signup_role());

  insert into public.subscriptions (org_id, status, current_period_start, current_period_end)
  values (
    created,
    'trialing',
    now(),
    now() + make_interval(days => public.trial_days())
  )
  on conflict (org_id) do nothing;

  return created;
end;
$$;

revoke all on function public.provision_org_for_user(uuid, text) from public;
revoke all on function public.provision_org_for_user(uuid, text) from anon, authenticated;

notify pgrst, 'reload schema';


-- =====================================================================
-- 20260924090000_email_transport.sql
-- =====================================================================

-- Record how each message was sent, and as whom.
--
-- The log could say a message was accepted and nothing else. When one was
-- accepted and never arrived, the two facts that decide why — which
-- transport carried it, and what from address it claimed — were exactly
-- the two the log did not keep. A message sent through one provider while
-- claiming to come from another provider's domain fails DMARC at the
-- receiving server: accepted, then filed as spam or dropped. From the
-- sending end that is indistinguishable from a message that arrived.

alter table email_log
  add column if not exists transport text,
  add column if not exists from_email text;

comment on column email_log.transport is
  'resend or smtp: which way this message left';
comment on column email_log.from_email is
  'The from address claimed, which is what DMARC is checked against';

notify pgrst, 'reload schema';


-- =====================================================================
-- 20260925090000_email_optouts.sql
-- =====================================================================

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


-- =====================================================================
-- 20260926090000_meetings_and_scheduled_messages.sql
-- =====================================================================

-- Meetings that say where they are, and messages that go out later.
--
-- Two changes that belong together because they are the same idea: a
-- commitment made now that has to reach the customer at the right moment.

-- ---------------------------------------------------------------------
-- Meetings: where it happens, on which number, and whether the customer
-- has been told.
-- ---------------------------------------------------------------------

alter table public.meetings
  -- google_meet, zoom, calendly, phone, in_person, other. Text rather than
  -- an enum so adding one is a deploy, not a migration and a deploy.
  add column if not exists platform text,
  -- The joining link. Separate from `location`, which is free text and is
  -- what somebody types for an office address.
  add column if not exists meeting_url text,
  -- Which WhatsApp number the confirmation goes out on. A workspace with
  -- two numbers has two, and a confirmation arriving from the one the
  -- customer has never messaged reads as a scam.
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmation_error text;

comment on column public.meetings.platform is
  'Where the meeting happens: google_meet, zoom, calendly, phone, in_person, other';
comment on column public.meetings.meeting_url is
  'The joining link, when the platform has one';

-- ---------------------------------------------------------------------
-- Scheduled messages
-- ---------------------------------------------------------------------

-- Writing a message now and having it delivered later.
--
-- The case this exists for: a follow-up that should land tomorrow morning,
-- written today because tomorrow morning is not a time anybody is
-- reliably at a keyboard.
--
-- Deliberately its own table rather than a campaign of one. A campaign
-- carries an audience, a template and a dispatch policy; this carries one
-- message to one person at one time, and modelling it as a campaign would
-- mean every screen about campaigns had to explain the degenerate case.
create table if not exists public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  -- Kept alongside contact_id: a contact deleted between scheduling and
  -- sending should not silently turn into a message with no recipient.
  wa_id text not null,
  connection_id uuid references public.waba_connections(id) on delete set null,
  body text not null,
  send_at timestamptz not null,
  -- pending, sent, failed, cancelled
  status text not null default 'pending',
  sent_at timestamptz,
  error text,
  wa_message_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The sweep asks "what is due, across every workspace" on every run.
create index if not exists scheduled_messages_due_idx
  on public.scheduled_messages (status, send_at)
  where status = 'pending';

create index if not exists scheduled_messages_org_idx
  on public.scheduled_messages (org_id, send_at desc);

alter table public.scheduled_messages enable row level security;

drop policy if exists scheduled_messages_select on public.scheduled_messages;
create policy scheduled_messages_select on public.scheduled_messages
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists scheduled_messages_insert on public.scheduled_messages;
create policy scheduled_messages_insert on public.scheduled_messages
  for insert to authenticated with check (public.is_org_member(org_id));

drop policy if exists scheduled_messages_update on public.scheduled_messages;
create policy scheduled_messages_update on public.scheduled_messages
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

drop policy if exists scheduled_messages_delete on public.scheduled_messages;
create policy scheduled_messages_delete on public.scheduled_messages
  for delete to authenticated using (public.is_org_member(org_id));

notify pgrst, 'reload schema';


-- =====================================================================
-- 20260927090000_group_sending.sql
-- =====================================================================

-- A default number for a group, and a record of what was sent to it.
--
-- A group here is a named segment of contacts, not a WhatsApp group.
-- Meta's Cloud API has no group endpoints at all — groups exist only in
-- the consumer and Business apps, and every tool that claims otherwise is
-- driving an unofficial library that gets numbers banned. So a "broadcast"
-- is one message to each member, sent individually, which is also what
-- reaches people who have muted a group.

alter table public.contact_groups
  -- Which number this segment is usually messaged from. A default rather
  -- than a constraint: the same people can be written to from either
  -- number, and the picker on the send still decides.
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null;

comment on column public.contact_groups.connection_id is
  'Default WhatsApp number for broadcasts to this group. Not a WhatsApp group — no such API exists.';

-- What went out to a group, so a second look answers "did I already send
-- this" without counting rows in the message log.
create table if not exists public.group_broadcasts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.contact_groups(id) on delete cascade,
  connection_id uuid references public.waba_connections(id) on delete set null,
  body text not null,
  sent_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists group_broadcasts_group_idx
  on public.group_broadcasts (group_id, created_at desc);

alter table public.group_broadcasts enable row level security;

drop policy if exists group_broadcasts_select on public.group_broadcasts;
create policy group_broadcasts_select on public.group_broadcasts
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists group_broadcasts_insert on public.group_broadcasts;
create policy group_broadcasts_insert on public.group_broadcasts
  for insert to authenticated with check (public.is_org_member(org_id));

notify pgrst, 'reload schema';


-- =====================================================================
-- Done. Reload the app and the new screens will be there.
-- =====================================================================


-- =====================================================================
-- 20260928090000_group_identity.sql
-- =====================================================================

-- A group you can recognise, and the people in it who speak for the rest.
--
-- Still not a WhatsApp group. Meta's Cloud API has no group endpoints,
-- so nothing here creates one and nothing posts into one. What these
-- columns do is make a list of customers usable: a picture so a wall of
-- grey rows can be scanned, and a role so the two people who matter in a
-- group of two hundred can be told first.

alter table public.contact_groups
  -- One emoji. Rendered on a tile tinted with the group's colour when
  -- there is no uploaded logo.
  add column if not exists icon text,
  -- An https URL, usually a file uploaded to the media bucket. Takes
  -- precedence over the icon when both are set.
  add column if not exists image_url text;

comment on column public.contact_groups.icon is
  'One emoji shown on the group tile. Falls back to the name initials.';
comment on column public.contact_groups.image_url is
  'https URL of a logo. Shown instead of the icon when present.';

-- An admin here is a key contact, not a WhatsApp administrator — there is
-- nothing to administer. It marks the people who speak for the group, so
-- they can be pinned to the top of the list and messaged on their own.
alter table public.contact_group_members
  add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contact_group_members_role_check'
  ) then
    alter table public.contact_group_members
      add constraint contact_group_members_role_check
      check (role in ('admin', 'member'));
  end if;
end $$;

comment on column public.contact_group_members.role is
  'admin = key contact for this group. Not a WhatsApp group admin; no such API exists.';

create index if not exists contact_group_members_admin_idx
  on public.contact_group_members (group_id) where role = 'admin';

-- The table had select, insert and delete policies and no update policy.
-- Postgres does not raise on an update whose rows are filtered out by RLS
-- — it reports zero rows changed, which PostgREST returns as success — so
-- promoting somebody would have shown a green confirmation and changed
-- nothing at all.
drop policy if exists contact_group_members_update on public.contact_group_members;
create policy contact_group_members_update on public.contact_group_members
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

notify pgrst, 'reload schema';


-- =====================================================================
-- 20260929090000_invoice_delivery.sql
-- =====================================================================

-- Whether the invoice actually reached the customer, and from which number.
--
-- status goes draft → sent → paid, where "sent" is the accounting sense:
-- issued, a number claimed, the money owed. It is written before the
-- WhatsApp message is attempted, so an invoice whose message was refused
-- sits in the list showing "sent" and the only person who knows it never
-- arrived is the customer who did not get it.
--
-- sent_at already recorded the truth. What was missing is the reason, so
-- a refusal survives a page reload instead of living only in the toast
-- that showed it once.

alter table public.invoices
  add column if not exists delivery_error text;

comment on column public.invoices.delivery_error is
  'Why the last WhatsApp send failed. Cleared when one succeeds. sent_at null with an issued status means it never reached the customer.';

-- Which number it goes out from. Until now the sender was inferred from
-- the conversation, which is right when a conversation exists and is an
-- invisible guess when several numbers could serve.
alter table public.invoices
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null;

comment on column public.invoices.connection_id is
  'The WhatsApp number this invoice is sent from. Null means use the conversation''s number, then the workspace default.';

-- The same choice on a recurring invoice, so every generated one goes out
-- from the number the operator picked rather than whichever thread the
-- generator happened to find.
alter table public.recurring_invoices
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null;

create index if not exists invoices_undelivered_idx
  on public.invoices (org_id)
  where sent_at is null and status <> 'draft';

notify pgrst, 'reload schema';



-- =====================================================================
-- 20260930090000_flow_number.sql
-- =====================================================================

-- Which number a form is built on.
--
-- A Flow lives on a WhatsApp Business Account, not on a workspace, and
-- once Meta has created it there it cannot move. routeFlow already
-- honours that for a form it has seen before — it routes by the stamped
-- waba_id and refuses to fall back to a number on some other account.
--
-- The gap was the first moment: a brand-new form silently went to
-- whichever number happened to be the default. With four numbers on
-- three accounts that is a decision the operator could not see, and the
-- consequence — a form that only opens for customers of one account —
-- surfaces days later as "the form does not work".

alter table public.whatsapp_flows
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null;

comment on column public.whatsapp_flows.connection_id is
  'The number this form is created on. Only consulted before Meta has created the flow; after that waba_id decides and cannot change.';

notify pgrst, 'reload schema';



-- =====================================================================
-- 20261001090000_shiprocket_orders.sql
-- =====================================================================

-- Two-way Shiprocket: pushing an order out, and what comes back.
--
-- Shiprocket refuses an order without a structured address — city, state
-- and a six-digit pincode as separate fields — and the app only ever had
-- one free-text "address" box. No amount of parsing makes that reliable,
-- so the fields it needs are fields now.

alter table public.store_orders
  -- Where it is going, in the shape a courier API takes.
  add column if not exists ship_name text,
  add column if not exists ship_phone text,
  add column if not exists ship_address text,
  add column if not exists ship_city text,
  add column if not exists ship_state text,
  add column if not exists ship_pincode text,
  add column if not exists ship_country text default 'India',
  add column if not exists ship_email text,

  -- The parcel itself. Shiprocket refuses a zero on any of these, so the
  -- code substitutes a stated default rather than failing the push.
  add column if not exists weight_grams integer,
  add column if not exists length_cm numeric,
  add column if not exists breadth_cm numeric,
  add column if not exists height_cm numeric,

  -- What Shiprocket gave back.
  add column if not exists shiprocket_order_id text,
  add column if not exists shiprocket_shipment_id text,
  add column if not exists courier_name text,
  add column if not exists tracking_url text,
  add column if not exists shipped_at timestamptz,
  -- Set when the customer has been told the parcel is on its way, so a
  -- second push does not send them the same news twice.
  add column if not exists shipped_notified_at timestamptz,

  -- Which WhatsApp number shipping updates go out from. Null falls back
  -- to the conversation's number, then the workspace default.
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null;

comment on column public.store_orders.shiprocket_order_id is
  'Shiprocket''s own id, so an order is pushed once and updated after.';
comment on column public.store_orders.shipped_notified_at is
  'When the customer was told it shipped. Stops a repeat push re-announcing it.';

create index if not exists store_orders_shiprocket_idx
  on public.store_orders (org_id, shiprocket_order_id)
  where shiprocket_order_id is not null;

notify pgrst, 'reload schema';



-- =====================================================================
-- 20261002090000_shipment_documents.sql
-- =====================================================================

-- The documents a parcel needs, and when it was collected.
--
-- Label and invoice URLs are stored rather than regenerated on every
-- view: Shiprocket bills nothing for the call but it is slow, and a
-- label reprinted on each page load is a different file each time, which
-- makes "the one I already stuck on the box" unanswerable.

alter table public.store_orders
  add column if not exists label_url text,
  add column if not exists invoice_url text,
  add column if not exists pickup_scheduled_at timestamptz;

comment on column public.store_orders.label_url is
  'Shiprocket-hosted shipping label PDF. Kept so the same label is reprinted rather than a new one generated.';

notify pgrst, 'reload schema';
-- Neura Chat database update 14
-- faq-number
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Run the numbered files in order. Safe to run more than once.

-- Which number an FAQ answers on.
--
-- Every other kind of automation in this product is already scoped to a
-- number: a chatbot flow, an automation, an AI assistant all carry a
-- connection_id and the runner filters on it. The FAQ bot was the one
-- that did not, so a workspace with a clothing number and a clinic
-- number had every FAQ answering on both — "what are your opening
-- hours?" replying with the wrong shop's hours to the wrong customer,
-- with nothing on the screen to say it would.
--
-- Null keeps the old meaning: answers on every number. That is what
-- every existing row means and what a one-number workspace wants.

alter table public.faq_entries
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null;

comment on column public.faq_entries.connection_id is
  'The WhatsApp number this answer is used on. Null means every number, which is what a one-number workspace wants and what every row created before this column means.';

-- The runner reads faq_entries on every inbound message and now filters
-- on this column as well, so it is worth an index.
create index if not exists faq_entries_org_connection_idx
  on public.faq_entries (org_id, connection_id)
  where is_active;

notify pgrst, 'reload schema';
-- Neura Chat database update 15
-- cart-checkout
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Run the numbered files in order. Safe to run more than once.

-- Asking for the money when the cart arrives.
--
-- A customer browsing the catalogue in WhatsApp, adding items and sending
-- the cart got a polite "thanks for your order" and nothing else. The
-- payment request was a button somebody had to press in the dashboard,
-- which means the shop is only open while a person is watching it — and
-- the customer, who was holding their phone with their card ready, had
-- to wait. That is the moment the sale is lost.
--
-- On by default, because a checkout that does not ask for payment is not
-- a checkout. Off for businesses that confirm stock before charging.

alter table public.payment_settings
  add column if not exists auto_request_payment boolean not null default true;

comment on column public.payment_settings.auto_request_payment is
  'Send the payment request automatically when a customer sends their cart. Off for businesses that check stock before charging.';

notify pgrst, 'reload schema';
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
-- =========================================================================
-- Unlimited messages and contacts; the number count is the real limit
-- =========================================================================
-- The tiers were priced on message and contact allowances. They are not
-- any more: every plan gets unlimited of both, and what separates them is
-- how many WhatsApp numbers and team seats you get.
--
-- That makes number_limit the one thing the plans actually differ on, so
-- it has to be enforced rather than printed on a card — three prices for
-- the same product is not a price list. connectWaba checks it now, so the
-- column has to exist before the plan rows claim it.
alter table public.plans
  add column if not exists number_limit integer;

comment on column public.plans.number_limit is
  'How many WhatsApp numbers this plan may connect. Null means unlimited.';

-- Null is unlimited everywhere else in this schema, so clearing these two
-- is the whole of "unlimited messages, unlimited contacts".
update public.plans
set message_limit = null,
    contact_limit = null
where is_active;

-- Starter: one number, one person.
update public.plans
set seat_limit = 1,
    number_limit = 1,
    features = '[
      "Unlimited messages",
      "Unlimited contacts",
      "1 WhatsApp number",
      "1 team seat",
      "AI chatbots & FAQ bot",
      "Shared inbox"
    ]'::jsonb
where slug in ('starter', 'starter-yearly');

update public.plans
set seat_limit = 5,
    number_limit = 2,
    features = '[
      "Unlimited messages",
      "Unlimited contacts",
      "2 WhatsApp numbers",
      "5 team seats",
      "Campaigns, drip & automations",
      "Commerce, catalogue & payments",
      "WhatsApp forms & appointments"
    ]'::jsonb
where slug in ('growth', 'growth-yearly');

update public.plans
set seat_limit = 15,
    number_limit = 5,
    features = '[
      "Unlimited messages",
      "Unlimited contacts",
      "5 WhatsApp numbers",
      "15 team seats",
      "Everything in Growth",
      "White label & custom domain",
      "Priority support"
    ]'::jsonb
where slug in ('scale', 'scale-yearly');


-- =====================================================================
-- 18-signup-otp.sql
-- =====================================================================

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


-- =====================================================================
-- 19-drip-campaigns.sql
-- =====================================================================

-- =========================================================================
-- Drip campaigns — follow-up sequences people walk through one at a time
-- =========================================================================
-- Not the same thing as a campaign, which is why it is not a column on
-- one. A campaign picks an audience now and sends to all of them
-- together. A drip has no audience: people join it one at a time, by
-- messaging a keyword, by an agent adding them, or by an API call from a
-- website form — and each of them is at a different point in the sequence
-- at any moment.
--
-- So the unit of state is the enrolment, not the campaign. One row per
-- person per sequence, carrying which step they are on and when the next
-- one is due, and the dispatcher is a loop over rows that have come due.

create table if not exists public.drip_campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  -- How people get in.
  trigger_type text not null default 'manual'
    check (trigger_type in ('manual', 'keyword', 'api')),
  trigger_keywords text[] not null default '{}',
  -- How they get out. Two separate questions: a nurture sequence wants to
  -- stop the moment a human is talking, and a reminder sequence wants to
  -- keep going until the thing is actually done.
  exit_on_keyword boolean not null default false,
  exit_keywords text[] not null default '{}',
  exit_on_reply boolean not null default false,
  -- What to do when somebody joins after a timed step's hour has passed.
  skip_missed_steps boolean not null default false,
  time_zone text not null default 'Asia/Kolkata',
  -- Which number the whole sequence sends from. Null means the default.
  connection_id uuid references public.waba_connections(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drip_campaigns_org_idx
  on public.drip_campaigns(org_id, created_at desc);

-- The keyword trigger is matched on every inbound message, so the lookup
-- has to be cheap and scoped to the sequences that are actually running.
create index if not exists drip_campaigns_live_idx
  on public.drip_campaigns(org_id, status)
  where status = 'active';

create table if not exists public.drip_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.drip_campaigns(id) on delete cascade,
  -- 1-based, and the first one goes out the moment somebody joins.
  step_index integer not null,
  template_id uuid references public.message_templates(id) on delete set null,
  variables text[] not null default '{}',
  -- The gap *after* this step, before the next. Never read on the last
  -- one, because nothing follows it.
  wait_kind text not null default 'duration'
    check (wait_kind in ('duration', 'time_of_day')),
  wait_minutes integer not null default 1440,
  -- For a timed step: minutes past midnight in the campaign's zone.
  send_at_minutes integer not null default 600
    check (send_at_minutes >= 0 and send_at_minutes < 1440),
  send_at_days integer not null default 1,
  created_at timestamptz not null default now(),
  unique (campaign_id, step_index)
);

create index if not exists drip_steps_campaign_idx
  on public.drip_steps(campaign_id, step_index);

create table if not exists public.drip_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.drip_campaigns(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  -- Kept beside contact_id so a deleted contact cannot orphan a sequence
  -- half way through — the same reason scheduled_messages carries it.
  wa_id text not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'exited', 'failed')),
  -- The step that goes out next, and when. These two are the whole state
  -- machine: the dispatcher reads rows whose time has come and nothing else.
  next_step_index integer not null default 1,
  next_send_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text,
  exited_reason text,
  enrolled_via text not null default 'manual'
    check (enrolled_via in ('manual', 'keyword', 'api', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One run through a sequence per person. Joining twice would mean two
  -- copies of every message, which is the complaint that gets a number
  -- blocked rather than a feature anybody asked for.
  unique (campaign_id, wa_id)
);

-- The dispatcher's only query: active enrolments whose time has come.
create index if not exists drip_enrollments_due_idx
  on public.drip_enrollments(next_send_at)
  where status = 'active';

create index if not exists drip_enrollments_campaign_idx
  on public.drip_enrollments(campaign_id, status);

-- An inbound message has to find every sequence this number is in, to
-- apply the exit rules.
create index if not exists drip_enrollments_wa_idx
  on public.drip_enrollments(org_id, wa_id)
  where status = 'active';

-- --- row level security ---------------------------------------------------
-- The same shape as every other tenant table: your own workspace's rows,
-- and nobody else's. The dispatcher runs as the service role and is not
-- subject to these.

alter table public.drip_campaigns enable row level security;
alter table public.drip_steps enable row level security;
alter table public.drip_enrollments enable row level security;

drop policy if exists drip_campaigns_own on public.drip_campaigns;
create policy drip_campaigns_own on public.drip_campaigns
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists drip_steps_own on public.drip_steps;
create policy drip_steps_own on public.drip_steps
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

drop policy if exists drip_enrollments_own on public.drip_enrollments;
create policy drip_enrollments_own on public.drip_enrollments
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

-- Keeps updated_at honest without every caller remembering to set it.
create or replace function public.touch_drip_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists drip_campaigns_touch on public.drip_campaigns;
create trigger drip_campaigns_touch
  before update on public.drip_campaigns
  for each row execute function public.touch_drip_updated_at();

drop trigger if exists drip_enrollments_touch on public.drip_enrollments;
create trigger drip_enrollments_touch
  before update on public.drip_enrollments
  for each row execute function public.touch_drip_updated_at();


-- =====================================================================
-- 20-agent-persona.sql
-- =====================================================================

-- =========================================================================
-- Agent persona — the language it answers in, and how it speaks
-- =========================================================================
-- The assistant editor had a prompt box and nothing else about voice, so
-- "answer in Hindi" was something you had to remember to type into free
-- text, and nothing on screen said it was a choice at all. These three
-- columns make it one, and the prompt builder turns them into the
-- sentences the model is actually given — a language picker that only
-- coloured a label would be the worst kind of setting: visible, saved, and
-- doing nothing.

alter table public.ai_assistants
  add column if not exists primary_language text not null default 'en';

-- Whether to answer in the customer's language instead, when they write in
-- a different one. Off by default: a business that supports one language
-- would rather say so than answer in a language nobody there can read.
alter table public.ai_assistants
  add column if not exists multilingual_reply boolean not null default false;

alter table public.ai_assistants
  add column if not exists tone text not null default 'professional';


-- =====================================================================
-- 21-wallet.sql
-- =====================================================================

-- =========================================================================
-- The message wallet — money in, and what each send costs
-- =========================================================================
-- A workspace tops the wallet up, and every template that goes out takes
-- its price off the balance. The point of it is the statement: a customer
-- who can see "4,312 messages, ₹4,096" has an answer to where the money
-- went, and a customer who cannot see it assumes the worst.
--
-- Two decisions worth stating, because both are easy to get wrong in a way
-- that costs somebody real money.
--
-- The balance is a column, not a sum over the ledger. A running total
-- recomputed on every send is a table scan per message at exactly the
-- moment throughput matters, and two sends landing together both read the
-- same stale total. So the column is the truth, the ledger is the
-- explanation, and one function writes both together under a row lock.
--
-- Everything here is in micros — millionths of a currency unit. ₹1 is
-- 1,000,000.
--
-- Not paise, and the difference is not fussiness. Meta's India rates are
-- ₹0.8631 for a marketing message and ₹0.1150 for a utility one, and
-- neither is a whole number of paise. Rounding ₹0.115 up to 12 paise
-- overcharges by 4.3% on the highest-volume message type there is;
-- rounding it down undercharges by the same. Over a hundred thousand
-- messages that is hundreds of rupees wrong for no reason other than the
-- unit being too coarse to hold the price.
--
-- bigint, because ₹1 is already seven digits and a workspace that has
-- added a lakh of credit is at 10^11.

alter table public.organizations
  add column if not exists wallet_balance_micros bigint not null default 0;

alter table public.organizations
  add column if not exists wallet_currency text not null default 'INR';

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- topup: money in. debit: a message went out. refund and adjustment are
  -- us putting something right, and are deliberately distinguishable from
  -- the first two in a statement.
  kind text not null check (kind in ('topup', 'debit', 'refund', 'adjustment')),
  -- Always positive. The kind says which way it moves, so a stray minus
  -- sign cannot turn a charge into a credit.
  amount_micros bigint not null check (amount_micros >= 0),
  currency text not null default 'INR',
  -- The running balance after this row, so a statement reads top to bottom
  -- without replaying every row before it.
  balance_after_micros bigint not null,
  description text not null,
  -- What it was for: a WhatsApp message id, a payment id, an admin's note.
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_ledger_org_idx
  on public.wallet_ledger(org_id, created_at desc);

-- A debit is written once per message. The index is what makes that true
-- even when a batch is retried after a timeout: the second attempt loses
-- the insert instead of charging again.
create unique index if not exists wallet_ledger_reference_idx
  on public.wallet_ledger(org_id, kind, reference)
  where reference is not null;

alter table public.wallet_ledger enable row level security;

-- Readable by the workspace, written by nobody but the server. A ledger
-- a tenant can insert into is a wallet that tops itself up.
drop policy if exists wallet_ledger_read on public.wallet_ledger;
create policy wallet_ledger_read on public.wallet_ledger
  for select to authenticated
  using (public.is_org_member(org_id));

/**
 * Moves the balance and writes the line that explains it, together.
 *
 * Under a row lock on the organization, so two sends landing in the same
 * millisecond cannot both read the same balance and both write it back.
 * Returns the new balance, or null when the move was refused.
 *
 * p_allow_negative is the switch between "count what was spent" and
 * "stop when the money runs out". It defaults to true, because a wallet
 * that silently stops a customer's campaign the moment a rate is set
 * wrong is worse than one that goes briefly negative and says so.
 */
-- Dropped first, because changing a parameter's type creates a second
-- function rather than replacing the first — and then every call is
-- ambiguous, which Postgres reports as a function that does not exist.
drop function if exists public.wallet_move(uuid, text, integer, text, text, boolean);

create or replace function public.wallet_move(
  p_org_id uuid,
  p_kind text,
  p_amount_micros bigint,
  p_description text,
  p_reference text default null,
  p_allow_negative boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_next bigint;
  v_currency text;
begin
  if p_amount_micros is null or p_amount_micros < 0 then
    return null;
  end if;

  select wallet_balance_micros, wallet_currency
    into v_balance, v_currency
  from public.organizations
  where id = p_org_id
  for update;

  if not found then
    return null;
  end if;

  if p_kind in ('topup', 'refund') then
    v_next := v_balance + p_amount_micros;
  elsif p_kind in ('debit', 'adjustment') then
    v_next := v_balance - p_amount_micros;
  else
    return null;
  end if;

  if v_next < 0 and not p_allow_negative then
    return null;
  end if;

  -- The unique index on (org_id, kind, reference) is what makes a retried
  -- batch harmless. Losing that insert is the correct outcome, not an
  -- error: it means this message has already been charged for.
  begin
    insert into public.wallet_ledger
      (org_id, kind, amount_micros, currency, balance_after_micros, description, reference)
    values
      (p_org_id, p_kind, p_amount_micros, coalesce(v_currency, 'INR'), v_next, p_description, p_reference);
  exception when unique_violation then
    return v_balance;
  end;

  update public.organizations
  set wallet_balance_micros = v_next
  where id = p_org_id;

  return v_next;
end;
$$;

revoke all on function public.wallet_move(uuid, text, bigint, text, text, boolean) from public;
revoke all on function public.wallet_move(uuid, text, bigint, text, text, boolean) from anon, authenticated;

notify pgrst, 'reload schema';
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
-- =========================================================================
-- What visitors do before they become customers
-- =========================================================================
-- The product could tell you everything about a workspace and nothing at
-- all about the four hundred people who looked at the front page and left.
-- That is the half of the funnel where the money is lost, and it was
-- invisible.
--
-- What is deliberately not here: no IP address, no raw user-agent string,
-- no email, no name, nothing typed into a field. visitor_id is a random
-- value the browser generates for itself and keeps in local storage — it
-- says "the same browser came back", which is the only question these
-- numbers need to answer, and it identifies nobody. Clearing site data
-- makes a visitor a new one, which is the correct behaviour rather than a
-- limitation.
--
-- bigserial rather than uuid: this is the one table in the schema that
-- grows with traffic rather than with customers, the rows are never
-- referenced from anywhere else, and an 8-byte key with a clustered index
-- is a different kind of table from the rest.

create table if not exists public.site_events (
  id bigserial primary key,
  -- The same browser, over time. Random, generated client side.
  visitor_id text not null,
  -- One visit. Resets after half an hour of quiet, so "sessions" means
  -- what everybody expects it to mean.
  session_id text not null,
  -- 'view', 'click', 'signup_open', 'signup_submit', 'signup_done'.
  event text not null,
  path text,
  -- Which button, for a click.
  label text,
  -- Host only, never the full referring URL: a search query or a private
  -- document's path can live in a referrer, and neither is ours to keep.
  referrer_host text,
  source text,
  medium text,
  campaign text,
  -- 'phone' | 'tablet' | 'desktop', from the viewport. Not a fingerprint.
  device text,
  created_at timestamptz not null default now()
);

-- Every query on the admin screen is "the last N days", and several of
-- them narrow to one kind of event first.
create index if not exists site_events_created_idx on public.site_events (created_at desc);
create index if not exists site_events_event_idx on public.site_events (event, created_at desc);
create index if not exists site_events_visitor_idx on public.site_events (visitor_id, created_at desc);

-- Written by the server on behalf of an anonymous visitor, read only by a
-- platform admin. No policy at all, so the service role is the only way in
-- and the ingest route is the only thing holding it.
alter table public.site_events enable row level security;

notify pgrst, 'reload schema';
