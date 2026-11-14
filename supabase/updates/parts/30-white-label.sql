-- =====================================================================
-- White label — one backend, many front doors
-- =====================================================================
--
-- The product already had tenants: a workspace, its number, its contacts,
-- its team. What it did not have was a way for somebody else's name to be
-- on the outside of it.
--
-- A brand is the front door. It owns a domain, a name, a logo and the
-- support contacts, and every workspace that came in through that door
-- carries its id. Nothing about the data changes — a workspace is still a
-- workspace, isolated from every other one by the same policies as before.
-- What changes is only what the customer sees while they use it.
--
-- Deliberately a separate table rather than columns on organizations:
-- an agency has many client workspaces and one set of branding, and
-- copying the logo URL onto every workspace would mean an agency that
-- changes its logo changes it in forty places, thirty-nine of which go
-- stale.

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),

  -- The short name, used for the fallback subdomain: acme.yourdomain.com
  -- works on the day the brand is created, before anybody has touched DNS.
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),

  -- The custom domain, lowercase, no scheme and no port: app.acme.com.
  -- Null until the agency points one at us.
  domain text unique
    check (domain is null or domain = lower(domain)),

  name text not null,
  -- The part rendered in the accent gradient, as the platform's own
  -- wordmark splits "Neura" and "Chat". Blank for a single-word name.
  name_accent text not null default '',

  logo_url text not null default '',
  favicon_url text not null default '',
  -- One hex colour. Blank keeps the platform's own accent.
  accent_hex text not null default ''
    check (accent_hex = '' or accent_hex ~ '^#[0-9A-Fa-f]{6}$'),

  site_title text not null default '',
  site_description text not null default '',
  support_email text not null default '',
  support_whatsapp text not null default '',

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who may edit a brand's look. An agency, not a workspace: the people here
-- sign in and see their own clients, not a customer's inbox.
create table if not exists public.brand_owners (
  brand_id uuid not null references public.brands (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);

create index if not exists brand_owners_user_idx on public.brand_owners (user_id);

-- Which front door a workspace came in through. Null means the platform's
-- own — the owner's direct customers, which is every workspace that
-- existed before this migration ran.
alter table public.organizations
  add column if not exists brand_id uuid references public.brands (id) on delete set null;

create index if not exists organizations_brand_idx on public.organizations (brand_id);

-- --- row level security ---------------------------------------------------

alter table public.brands enable row level security;
alter table public.brand_owners enable row level security;

-- A brand is public by definition: the login page has to render the right
-- logo before anybody has signed in, so the anonymous key must be able to
-- read it. Nothing private lives on this row.
drop policy if exists brands_public_read on public.brands;
create policy brands_public_read on public.brands
  for select using (is_active);

-- No insert, update or delete policy at all. Brands are created by the
-- platform owner and edited by their agency through server actions that
-- check who is asking and then write with the service role, which is the
-- same shape every other administrative write in this app has.

drop policy if exists brand_owners_read_own on public.brand_owners;
create policy brand_owners_read_own on public.brand_owners
  for select using (user_id = auth.uid());

-- --- keeping updated_at honest --------------------------------------------

create or replace function public.touch_brand()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brands_touch on public.brands;
create trigger brands_touch
  before update on public.brands
  for each row execute function public.touch_brand();

notify pgrst, 'reload schema';
