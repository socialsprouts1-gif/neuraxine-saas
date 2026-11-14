-- =========================================================================
-- Commerce: imported products, the Meta catalogue, and customer orders
--
-- The Commerce screen held a product list nobody could do anything with:
-- no way to get products in except typing them, and no record of what a
-- customer ordered. This adds all three sides of that.
--
-- The distinction that matters and is easy to lose: public.orders is what a
-- tenant pays *us*. These are what a tenant's own customers pay *them*.
-- Same word, opposite direction, so they are separate tables with separate
-- names rather than a `kind` column somebody will forget to filter on.
-- =========================================================================

alter table public.products
  -- The shop's own id, "shopify:12345". What makes a re-import update a
  -- product rather than adding a second copy of it.
  add column if not exists external_id text,
  -- The SKU as Meta's commerce catalogue knows it. Not the same thing as
  -- `sku`: a business can keep its own codes and still have Meta assign
  -- content ids, and a product message must carry Meta's.
  add column if not exists retailer_id text,
  add column if not exists category text,
  add column if not exists updated_at timestamptz not null default now();

-- One row per external product per org. Partial, because a hand-typed
-- product has no external id and several of those must be allowed.
create unique index if not exists products_external_idx
  on public.products(org_id, external_id)
  where external_id is not null;

create unique index if not exists products_retailer_idx
  on public.products(org_id, retailer_id)
  where retailer_id is not null;

-- =========================================================================
-- The Meta commerce catalogue attached to the WABA.
--
-- Product messages need a catalog_id, and it is a property of the WhatsApp
-- Business Account rather than of the phone number. Cached here because it
-- is asked for on every send and never changes.
-- =========================================================================
alter table public.waba_connections
  add column if not exists catalog_id text,
  add column if not exists catalog_name text,
  -- Whether the storefront icon and the cart are switched on for this
  -- number. Read back from Meta rather than assumed: a catalogue that exists
  -- but is not visible looks identical to one that is, until a customer
  -- cannot find it.
  add column if not exists is_catalog_visible boolean,
  add column if not exists is_cart_enabled boolean;

-- =========================================================================
-- store_orders — what a customer ordered.
--
-- `reference` is ours and short, because it is what goes into a WhatsApp
-- order_details message (Meta caps reference_id at 35 characters) and into
-- the gateway's own reference field, so a payment webhook can be matched
-- back to an order without a lookup table.
-- =========================================================================
create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  reference text not null,
  status text not null default 'pending'
    check (status in (
      'pending',        -- the customer sent a cart; nobody has been asked to pay
      'awaiting_payment', -- an order_details message or a payment link went out
      'paid',
      'confirmed',
      'shipped',
      'delivered',
      'cancelled',
      'refunded'
    )),
  currency text not null default 'INR',
  -- Smallest currency unit throughout, so no arithmetic here meets a float.
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  shipping_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  total_cents bigint not null default 0,
  -- 'whatsapp' is Meta's native payment flow; the rest are payment links.
  payment_provider text,
  payment_link_url text,
  -- The gateway's or Meta's own id, for reconciling a webhook.
  payment_reference text,
  payment_status text,
  paid_at timestamptz,
  -- The order_details message we sent, so an order_status update can refer
  -- to the right one.
  wa_order_message_id text,
  catalog_id text,
  address text,
  notes text,
  -- Shiprocket's air waybill, for "where is my order?".
  awb text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, reference)
);

create index if not exists store_orders_org_idx
  on public.store_orders(org_id, created_at desc);
create index if not exists store_orders_contact_idx on public.store_orders(contact_id);
create index if not exists store_orders_payment_idx
  on public.store_orders(payment_reference)
  where payment_reference is not null;

alter table public.store_orders enable row level security;

drop policy if exists store_orders_select on public.store_orders;
create policy store_orders_select on public.store_orders
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists store_orders_write on public.store_orders;
create policy store_orders_write on public.store_orders
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- store_order_items — the lines of an order.
--
-- name and unit price are copied rather than joined to products: a product
-- renamed or repriced next month must not silently rewrite what somebody
-- was charged last month.
-- =========================================================================
create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  -- Nullable: an item can arrive from a Meta catalogue we never imported.
  product_id uuid references public.products(id) on delete set null,
  retailer_id text,
  name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents bigint not null default 0,
  currency text not null default 'INR',
  created_at timestamptz not null default now()
);

create index if not exists store_order_items_order_idx
  on public.store_order_items(order_id);

alter table public.store_order_items enable row level security;

-- Reached through its order, so membership is checked there. Writing the
-- check this way means an item cannot be attached to another tenant's order
-- even by id.
drop policy if exists store_order_items_select on public.store_order_items;
create policy store_order_items_select on public.store_order_items
  for select to authenticated using (
    exists (
      select 1 from public.store_orders o
      where o.id = order_id and public.is_org_member(o.org_id)
    )
  );

drop policy if exists store_order_items_write on public.store_order_items;
create policy store_order_items_write on public.store_order_items
  for all to authenticated using (
    exists (
      select 1 from public.store_orders o
      where o.id = order_id and public.is_org_member(o.org_id)
    )
  ) with check (
    exists (
      select 1 from public.store_orders o
      where o.id = order_id and public.is_org_member(o.org_id)
    )
  );

-- =========================================================================
-- Payment settings per workspace.
--
-- Which gateway to ask with, and whether Meta's native payment flow is
-- available on this WABA — which it only is once a payment configuration has
-- been approved in WhatsApp Manager, something we cannot do from here and
-- must not pretend to.
-- =========================================================================
create table if not exists public.payment_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  -- 'link' sends a gateway payment link. 'whatsapp' sends Meta's
  -- order_details message and lets the customer pay inside the chat.
  method text not null default 'link' check (method in ('link', 'whatsapp')),
  -- Which gateway a link is created with.
  link_provider text,
  -- The name of the payment configuration set up in WhatsApp Manager. Meta
  -- rejects an order_details message that names one it does not have.
  wa_payment_configuration text,
  -- 'razorpay' or 'payu' — which gateway that configuration is wired to.
  wa_payment_gateway text,
  -- Physical goods get a shipping stage in the order status; digital do not.
  goods_type text not null default 'physical'
    check (goods_type in ('physical', 'digital')),
  -- Minutes an unpaid order stays payable.
  payment_expiry_minutes integer not null default 1440
    check (payment_expiry_minutes between 10 and 20160),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  -- Free shipping above this. 0 means never.
  free_shipping_above_cents bigint not null default 0,
  order_received_message text not null default
    'Thanks for your order. Here is what we have: {{items}}. Total {{total}}.',
  payment_request_message text not null default
    'Your order comes to {{total}}. Tap to pay: {{link}}',
  payment_received_message text not null default
    'Payment received — thank you. Your order {{reference}} is confirmed.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_settings enable row level security;

drop policy if exists payment_settings_select on public.payment_settings;
create policy payment_settings_select on public.payment_settings
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists payment_settings_write on public.payment_settings;
create policy payment_settings_write on public.payment_settings
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

notify pgrst, 'reload schema';
