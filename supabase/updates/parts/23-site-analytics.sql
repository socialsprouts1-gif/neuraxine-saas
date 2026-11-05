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
