-- =====================================================================
-- Events — letting another system drive the automations
-- =====================================================================
--
-- Everything that starts an automation today starts inside this product:
-- somebody messages a keyword, a booking is marked done, a comment lands
-- on a post. That covers a business whose whole life is WhatsApp, and
-- not one that runs its own till, its own bookings, its own stock.
--
-- A restaurant is the clear case. The orders live in the restaurant's own
-- panel. What this product should do is listen: an order was placed, a
-- table finished, a bill was paid — and send the right message at the
-- right moment without anybody retyping anything.
--
-- So: an event is a thing that happened, somewhere else, to somebody we
-- can message. It arrives over HTTP with an API key, it is written down
-- whether or not anything acts on it, and the rules that act on it are
-- rows rather than code.
--
-- Written down whether or not anything acts on it is the important half.
-- The question every integration gets stuck on is "did my event even
-- arrive", and a log that only records the ones that matched cannot
-- answer it.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,

  -- "order.placed", "dining.finished". A dotted name, by convention
  -- rather than by constraint: the sender names their own events and a
  -- list we police here is a list that is always missing one.
  name text not null check (char_length(name) between 1 and 80),

  -- Who it happened to. The contact is resolved on the way in, so the
  -- log can show a name rather than a number, but the number is kept
  -- beside it because a contact can be deleted later.
  contact_id uuid references public.contacts (id) on delete set null,
  wa_id text,

  -- Whatever the sender included. Read by the rules for conditions and
  -- for filling the blanks in a message.
  data jsonb not null default '{}'::jsonb,

  source text not null default 'api' check (source in ('api', 'test')),

  -- What became of it. This is what makes the log worth reading.
  outcome text not null default 'received'
    check (outcome in ('received', 'matched', 'no_match', 'failed', 'ignored')),
  matched integer not null default 0,
  error text,

  created_at timestamptz not null default now()
);

-- The log, newest first, which is the only way anybody reads it.
create index if not exists events_org_time_idx
  on public.events (org_id, created_at desc);

-- And the rule lookup: every event asks "what listens for this name".
create index if not exists events_org_name_idx
  on public.events (org_id, name, created_at desc);

-- --- the rules ------------------------------------------------------------

create table if not exists public.event_automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,

  name text not null,
  event_name text not null,
  is_active boolean not null default false,

  -- An optional condition on the payload, so one event name can drive
  -- several rules: order.placed where total is over 1000 is a different
  -- message from order.placed where it is not.
  match_field text,
  match_operator text
    check (match_operator is null
      or match_operator in ('equals', 'not_equals', 'contains', 'gt', 'lt', 'exists')),
  match_value text,

  -- What to do about it.
  --
  -- Deliberately only three. A sequence covers everything that needs a
  -- delay or more than one message — "thank you now, review tomorrow" is
  -- a two-step sequence, not a scheduling feature this table has to grow
  -- — and that engine is already running, already tested, and already
  -- knows how to let somebody out of it.
  action text not null default 'send_template'
    check (action in ('send_template', 'start_sequence', 'add_tag')),

  template_id uuid references public.message_templates (id) on delete set null,
  template_language text not null default 'en_US',
  -- One per blank in the template, in order. An entry may be a token
  -- such as {{data.customer_name}}, filled from the event itself — which
  -- is what makes these messages personal where a campaign's cannot be.
  variables text[] not null default '{}',

  campaign_id uuid references public.drip_campaigns (id) on delete set null,
  tag text,
  connection_id uuid references public.waba_connections (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_automations_lookup_idx
  on public.event_automations (org_id, event_name)
  where is_active;

-- --- row level security ---------------------------------------------------
-- The same shape as every other tenant table. The API route runs as the
-- service role, having already proved which workspace the key belongs to.

alter table public.events enable row level security;
alter table public.event_automations enable row level security;

drop policy if exists events_own_org on public.events;
create policy events_own_org on public.events
  for select using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

drop policy if exists event_automations_own_org on public.event_automations;
create policy event_automations_own_org on public.event_automations
  for all using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  ) with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

-- --- keeping updated_at honest --------------------------------------------

create or replace function public.touch_event_automation()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists event_automations_touch on public.event_automations;
create trigger event_automations_touch
  before update on public.event_automations
  for each row execute function public.touch_event_automation();

-- An API key has to be able to say what it may do. The column exists
-- already; this only guarantees a default for rows made before scopes
-- meant anything.
alter table public.api_keys
  alter column scopes set default '{}'::text[];

notify pgrst, 'reload schema';
