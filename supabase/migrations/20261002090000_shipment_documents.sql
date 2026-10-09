-- The documents a parcel needs, and when it was collected.
--
-- Label and invoice URLs are stored rather than regenerated on every
-- view: Shiprocket bills nothing for the call but it is slow, and a
-- label reprinted on each page load is a different file each time, which
-- makes "the one I already stuck on the box" unanswerable.

alter table public.store_orders
  add column if not exists label_url text,
  add column if not exists invoice_url text,
  add column if not exists pickup_scheduled_at timestamptz;

comment on column public.store_orders.label_url is
  'Shiprocket-hosted shipping label PDF. Kept so the same label is reprinted rather than a new one generated.';

notify pgrst, 'reload schema';
