-- =========================================================================
-- Invoicing
--
-- The Invoice section of the sidebar was three items marked "soon". This is
-- the whole of it: what the business is, the invoices themselves, and the
-- schedules that raise them again next month.
--
-- An invoice is not a receipt. It is a document somebody files, so two
-- things here are stricter than they would otherwise be:
--
--   * Numbering is claimed atomically. Indian GST requires consecutive
--     serial numbers, and max(number)+1 races the moment two invoices are
--     raised in the same second — which is exactly what a recurring run
--     does.
--   * The customer's details are copied onto the invoice rather than joined
--     to the contact. Renaming a customer next year must not rewrite what
--     was issued to them last year.
-- =========================================================================

-- =========================================================================
-- invoice_settings — who is issuing, and how the numbers run.
-- =========================================================================
create table if not exists public.invoice_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,

  -- The legal identity on the document. Deliberately separate from the
  -- organisation's display name: "umm clothing" is a workspace label, and
  -- an invoice needs the registered name.
  business_name text,
  address text,
  city text,
  state text,
  postal_code text,
  country text not null default 'India',
  -- Fifteen characters. Validated in the app, because a typo here goes onto
  -- every invoice issued from then on.
  gstin text,
  pan text,
  email text,
  phone text,
  logo_url text,
  signature_url text,

  -- How the customer pays outside the app.
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  bank_name text,
  upi_id text,

  -- Numbering. next_number is the one the *next* invoice will take, so a
  -- fresh workspace starts at 1 and the claim below hands it out and steps.
  number_prefix text not null default 'INV',
  next_number integer not null default 1 check (next_number > 0),
  number_padding integer not null default 4 check (number_padding between 1 and 10),

  default_terms_days integer not null default 15
    check (default_terms_days between 0 and 365),
  default_tax_percent numeric(5,2) not null default 18
    check (default_tax_percent between 0 and 100),
  -- Indian invoices conventionally round to the rupee and show the
  -- difference as its own line.
  round_to_rupee boolean not null default true,
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',

  notes text,
  terms_text text not null default
    'Payment due within the terms shown. Goods once sold are not returnable.',
  -- What goes in the WhatsApp message when an invoice is sent.
  send_message text not null default
    'Invoice {{number}} for {{total}} is ready. View and pay here: {{link}}',
  payment_received_message text not null default
    'Payment received for invoice {{number}}. Thank you.',
  reminder_message text not null default
    'A reminder that invoice {{number}} for {{total}} was due on {{due}}. {{link}}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoice_settings enable row level security;

drop policy if exists invoice_settings_select on public.invoice_settings;
create policy invoice_settings_select on public.invoice_settings
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists invoice_settings_write on public.invoice_settings;
create policy invoice_settings_write on public.invoice_settings
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- recurring_invoices — the schedules.
--
-- Declared before invoices so the foreign key from an invoice back to the
-- schedule that raised it can be created in the same pass.
-- =========================================================================
create table if not exists public.recurring_invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  title text not null,
  interval text not null default 'monthly'
    check (interval in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  -- A date, not an instant: nobody's billing cycle turns on a timezone.
  next_run_on date not null,
  last_run_on date,
  -- Null runs forever. A number stops after that many invoices, which is
  -- what a fixed-term contract needs.
  occurrences_limit integer check (occurrences_limit is null or occurrences_limit > 0),
  occurrences_done integer not null default 0,
  is_active boolean not null default true,
  -- Off, the run raises a draft for somebody to look at before it goes.
  auto_send boolean not null default false,
  terms_days integer not null default 15 check (terms_days between 0 and 365),
  notes text,
  -- The lines to raise each time, as they would be typed into the builder.
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_invoices_org_idx
  on public.recurring_invoices(org_id, next_run_on);
-- The sweep scans on exactly this.
create index if not exists recurring_invoices_due_idx
  on public.recurring_invoices(next_run_on)
  where is_active;

alter table public.recurring_invoices enable row level security;

drop policy if exists recurring_invoices_select on public.recurring_invoices;
create policy recurring_invoices_select on public.recurring_invoices
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists recurring_invoices_write on public.recurring_invoices;
create policy recurring_invoices_write on public.recurring_invoices
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- =========================================================================
-- invoices
--
-- `overdue` is not a status. It is due_on being in the past with money still
-- owed, and storing it would mean something has to sweep every invoice at
-- midnight to keep it true.
-- =========================================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  recurring_id uuid references public.recurring_invoices(id) on delete set null,

  -- Assigned when the invoice is issued, not when the draft is created: a
  -- draft that is deleted must not leave a hole in the sequence.
  number text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partly_paid', 'paid', 'cancelled')),

  issued_on date,
  due_on date,

  -- The customer as they were at the time. Copied, not joined.
  customer_name text,
  customer_gstin text,
  customer_address text,
  customer_state text,
  customer_phone text,
  customer_email text,

  currency text not null default 'INR',
  -- True when the sale crossed a state line, which decides IGST versus
  -- CGST+SGST. Stored because it is a property of the sale, and recomputing
  -- it later from GSTINs that have since changed would rewrite history.
  inter_state boolean not null default false,

  -- Smallest currency unit throughout.
  subtotal_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  taxable_cents bigint not null default 0,
  cgst_cents bigint not null default 0,
  sgst_cents bigint not null default 0,
  igst_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  round_off_cents bigint not null default 0,
  total_cents bigint not null default 0,
  -- Part payment is ordinary on an invoice, unlike on a cart.
  amount_paid_cents bigint not null default 0 check (amount_paid_cents >= 0),
  paid_at timestamptz,

  notes text,
  terms_text text,

  payment_provider text,
  payment_link_url text,
  payment_reference text,

  -- What goes in the link sent to the customer. Random and unguessable,
  -- because the page it opens needs no login.
  public_token text not null default encode(gen_random_bytes(18), 'hex'),
  sent_at timestamptz,
  last_reminded_at timestamptz,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A number is unique per workspace once assigned. Partial, because drafts
-- have no number and several of those must be allowed.
create unique index if not exists invoices_number_idx
  on public.invoices(org_id, number)
  where number is not null;

create unique index if not exists invoices_token_idx on public.invoices(public_token);
create index if not exists invoices_org_idx on public.invoices(org_id, created_at desc);
create index if not exists invoices_contact_idx on public.invoices(contact_id);
create index if not exists invoices_due_idx
  on public.invoices(org_id, due_on)
  where status in ('sent', 'partly_paid');
create index if not exists invoices_payment_idx
  on public.invoices(payment_reference)
  where payment_reference is not null;

alter table public.invoices enable row level security;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- No anonymous policy, deliberately. The public invoice page is server
-- rendered and reads with the service role after matching the token: a
-- `to anon` select policy permissive enough to allow a token lookup is also
-- permissive enough to allow listing every invoice on the platform.

-- =========================================================================
-- invoice_items
--
-- Description and unit price are copied rather than joined to products, for
-- the same reason as the customer details: repricing a product next month
-- must not rewrite what was billed last month.
-- =========================================================================
create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  -- HSN for goods, SAC for services.
  hsn_code text,
  -- Fractional, because an hour and a half of work is a real line.
  quantity numeric(12,3) not null default 1 check (quantity >= 0),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  discount_percent numeric(5,2) not null default 0
    check (discount_percent between 0 and 100),
  -- The computed figures, stored so the document cannot change under the
  -- customer if the arithmetic is ever adjusted.
  taxable_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_idx
  on public.invoice_items(invoice_id, sort_order);

alter table public.invoice_items enable row level security;

-- Reached through the invoice, so membership is checked there. Written this
-- way, a line cannot be attached to another tenant's invoice even by id.
drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items
  for select to authenticated using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and public.is_org_member(i.org_id)
    )
  );

drop policy if exists invoice_items_write on public.invoice_items;
create policy invoice_items_write on public.invoice_items
  for all to authenticated using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and public.is_org_member(i.org_id)
    )
  ) with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and public.is_org_member(i.org_id)
    )
  );

-- =========================================================================
-- Claiming an invoice number.
--
-- GST requires consecutive serial numbers, so this has to be a single
-- statement that both reads and steps the counter. `update ... returning`
-- takes a row lock, which means two invoices raised in the same instant get
-- different numbers and neither gets a gap — the thing max(number)+1
-- cannot promise, and the thing a recurring run raising twenty invoices at
-- once will absolutely exercise.
--
-- security definer so it can step the counter for a workspace the caller is
-- a member of without needing update rights on the settings row itself.
-- =========================================================================
create or replace function public.claim_invoice_number(target_org uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer;
begin
  if not public.is_org_member(target_org) then
    raise exception 'Not a member of this workspace';
  end if;

  -- A workspace that has never opened the settings screen still needs a
  -- counter to step.
  insert into public.invoice_settings (org_id)
  values (target_org)
  on conflict (org_id) do nothing;

  update public.invoice_settings
     set next_number = next_number + 1,
         updated_at = now()
   where org_id = target_org
  returning next_number - 1 into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_invoice_number(uuid) from public;
grant execute on function public.claim_invoice_number(uuid) to authenticated;

notify pgrst, 'reload schema';
