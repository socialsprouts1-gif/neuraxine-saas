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
