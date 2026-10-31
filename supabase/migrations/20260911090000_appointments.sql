-- =========================================================================
-- Appointment booking
--
-- Meetings already existed, but only as something a person typed in after
-- the fact. This is the other half: what the business offers, when it is
-- free, and a booking conversation the customer can complete on WhatsApp
-- without anyone on the business's side touching it.
--
-- Four new tables. Availability is a weekly pattern rather than a list of
-- slots — storing every slot would mean generating them ahead of time,
-- regenerating them whenever the hours changed, and still being wrong the
-- moment somebody booked one.
-- =========================================================================

-- =========================================================================
-- appointment_types — what can be booked.
--
-- "Multiple options" in the customer's list: a clinic offers consultation
-- and follow-up, a salon offers a dozen services at different lengths.
-- Length lives here rather than in settings because that is the whole point
-- of having more than one.
-- =========================================================================
create table if not exists public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 30
    check (duration_minutes between 5 and 1440),
  -- Smallest currency unit, as everywhere else. Zero means it is not priced
  -- on the menu, which is different from being free.
  price_cents integer not null default 0 check (price_cents >= 0),
  location text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointment_types_org_idx
  on public.appointment_types(org_id, sort_order);

alter table public.appointment_types enable row level security;

drop policy if exists appointment_types_select on public.appointment_types;
create policy appointment_types_select on public.appointment_types
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists appointment_types_insert on public.appointment_types;
create policy appointment_types_insert on public.appointment_types
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists appointment_types_update on public.appointment_types;
create policy appointment_types_update on public.appointment_types
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists appointment_types_delete on public.appointment_types;
create policy appointment_types_delete on public.appointment_types
  for delete to authenticated using (public.is_org_member(org_id));

-- =========================================================================
-- appointment_settings — when the business is open, and what the bot says.
--
-- One row per workspace. `hours` is a weekly pattern keyed by weekday, each
-- day holding any number of windows, so a business that shuts for lunch is
-- expressed rather than approximated:
--
--   {"mon":[{"start":"09:00","end":"13:00"},{"start":"14:00","end":"18:00"}]}
-- =========================================================================
create table if not exists public.appointment_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  is_enabled boolean not null default false,
  -- IANA name. Opening hours are meaningless without it, and a business
  -- booking customers in another country needs its own, not the server's.
  timezone text not null default 'Asia/Kolkata',
  slot_minutes integer not null default 30 check (slot_minutes between 5 and 480),
  buffer_minutes integer not null default 0 check (buffer_minutes between 0 and 240),
  -- Nothing is offered sooner than this. Without it the bot cheerfully
  -- offers a 9:00 appointment at 8:59.
  min_notice_minutes integer not null default 60
    check (min_notice_minutes between 0 and 20160),
  horizon_days integer not null default 14 check (horizon_days between 1 and 120),
  max_per_slot integer not null default 1 check (max_per_slot between 1 and 100),
  hours jsonb not null default '{
    "sun": [],
    "mon": [{"start":"09:00","end":"18:00"}],
    "tue": [{"start":"09:00","end":"18:00"}],
    "wed": [{"start":"09:00","end":"18:00"}],
    "thu": [{"start":"09:00","end":"18:00"}],
    "fri": [{"start":"09:00","end":"18:00"}],
    "sat": [{"start":"09:00","end":"14:00"}]
  }'::jsonb,
  -- What a customer types to start booking. Matched as a whole word, so
  -- "book" does not fire on "bookkeeping".
  trigger_keywords text[] not null default
    array['book', 'booking', 'appointment', 'appointments', 'schedule', 'slot'],
  location text,
  greeting text not null default 'Happy to book you in. What would you like to book?',
  confirmation text not null default
    'Booked. See you on {{date}} at {{time}}. Reply CANCEL if you need to change it.',
  no_slots_message text not null default
    'Sorry, there is nothing free in the next couple of weeks. Reply here and someone will sort it out with you.',
  cancelled_message text not null default 'No problem — nothing has been booked.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointment_settings enable row level security;

drop policy if exists appointment_settings_select on public.appointment_settings;
create policy appointment_settings_select on public.appointment_settings
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists appointment_settings_write on public.appointment_settings;
create policy appointment_settings_write on public.appointment_settings
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- appointment_blackouts — a holiday, a day off, an afternoon out.
--
-- Separate from the weekly pattern because it is an exception to it, and
-- editing next Tuesday's hours to close for one Tuesday would close every
-- Tuesday after it too.
-- =========================================================================
create table if not exists public.appointment_blackouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists appointment_blackouts_org_idx
  on public.appointment_blackouts(org_id, starts_at);

alter table public.appointment_blackouts enable row level security;

drop policy if exists appointment_blackouts_select on public.appointment_blackouts;
create policy appointment_blackouts_select on public.appointment_blackouts
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists appointment_blackouts_write on public.appointment_blackouts;
create policy appointment_blackouts_write on public.appointment_blackouts
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- booking_sessions — where a customer is in the booking conversation.
--
-- One per conversation. It cannot live in conversations.bot_variables: a
-- graph flow owns that, and a customer who starts booking halfway through a
-- flow would have their flow state overwritten by ours.
--
-- Expires, because a customer who is asked "which day?" and never answers
-- must not have their next unrelated message read as a date.
-- =========================================================================
create table if not exists public.booking_sessions (
  conversation_id uuid primary key
    references public.conversations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  step text not null check (step in ('type', 'date', 'time')),
  appointment_type_id uuid references public.appointment_types(id) on delete set null,
  -- "2026-09-11" as the business reads it, not as UTC does.
  chosen_date text,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_sessions_expiry_idx
  on public.booking_sessions(expires_at);

alter table public.booking_sessions enable row level security;

drop policy if exists booking_sessions_select on public.booking_sessions;
create policy booking_sessions_select on public.booking_sessions
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists booking_sessions_write on public.booking_sessions;
create policy booking_sessions_write on public.booking_sessions
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- meetings gains what a booking needs.
-- =========================================================================
alter table public.meetings
  add column if not exists appointment_type_id uuid
    references public.appointment_types(id) on delete set null,
  -- 'whatsapp' means the customer booked it themselves. Worth knowing: those
  -- are the ones nobody on the business's side has seen yet.
  add column if not exists source text not null default 'manual',
  add column if not exists reminder_sent_at timestamptz;

alter table public.meetings drop constraint if exists meetings_source_check;
alter table public.meetings add constraint meetings_source_check
  check (source in ('manual', 'whatsapp', 'api'));

-- Counting what is already taken at a given time is the query the slot
-- generator runs for every request, so it wants an index that answers it.
create index if not exists meetings_org_scheduled_idx
  on public.meetings(org_id, starts_at)
  where status = 'scheduled';

-- =========================================================================
-- A booking is a bot outcome like any other, and the Automations log has to
-- be able to say so.
-- =========================================================================
alter table public.bot_runs drop constraint if exists bot_runs_matched_kind_check;
alter table public.bot_runs add constraint bot_runs_matched_kind_check
  check (matched_kind in
    ('flow_step', 'chatbot', 'faq', 'automation', 'assistant', 'handoff', 'booking', 'none'));

notify pgrst, 'reload schema';
