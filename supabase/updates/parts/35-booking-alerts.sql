-- =====================================================================
-- Telling the business when a customer books
-- =====================================================================
--
-- A customer books on WhatsApp, the bot confirms it, the row lands in
-- the database — and nobody at the business knows until somebody thinks
-- to open the Appointments screen. For a clinic or a salon that is a
-- customer arriving at a time nobody prepared for.
--
-- Email rather than WhatsApp. Messaging the owner's own number needs an
-- approved template, because the owner has not written to the business
-- in the last 24 hours and never will — it is their own number. A
-- template can take days to approve and some accounts cannot create one
-- at all, so the notification would depend on the thing most likely to
-- be missing.

alter table public.appointment_settings
  add column if not exists notify_on_booking boolean not null default true,

  -- Where the alert goes. Null means the workspace owner's own address,
  -- which is the right default and needs no setting up. A business with
  -- a front desk puts the front desk here.
  add column if not exists notify_email text;

notify pgrst, 'reload schema';
