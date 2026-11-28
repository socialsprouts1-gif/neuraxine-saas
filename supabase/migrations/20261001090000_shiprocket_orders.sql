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
