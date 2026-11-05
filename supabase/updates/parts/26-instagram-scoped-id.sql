-- =====================================================================
-- The other id Instagram calls the same account by
-- =====================================================================
--
-- Instagram identifies a business by two different numbers, and uses
-- them in different webhooks.
--
--   user_id — the professional account id. Comment webhooks use it.
--   id      — the app-scoped id. Messaging webhooks use it.
--
-- Only the first was stored, so a comment found its workspace and a
-- direct message or a tapped button did not. The lookup failed, the
-- delivery was dropped without a word, and a follow gate could ask a
-- question it was structurally incapable of hearing the answer to.

alter table public.instagram_connections
  add column if not exists ig_scoped_id text;

create index if not exists instagram_connections_scoped_idx
  on public.instagram_connections (ig_scoped_id);

notify pgrst, 'reload schema';
