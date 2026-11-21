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
