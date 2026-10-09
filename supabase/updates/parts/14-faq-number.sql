-- Neura Chat database update 14
-- faq-number
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Run the numbered files in order. Safe to run more than once.

-- Which number an FAQ answers on.
--
-- Every other kind of automation in this product is already scoped to a
-- number: a chatbot flow, an automation, an AI assistant all carry a
-- connection_id and the runner filters on it. The FAQ bot was the one
-- that did not, so a workspace with a clothing number and a clinic
-- number had every FAQ answering on both — "what are your opening
-- hours?" replying with the wrong shop's hours to the wrong customer,
-- with nothing on the screen to say it would.
--
-- Null keeps the old meaning: answers on every number. That is what
-- every existing row means and what a one-number workspace wants.

alter table public.faq_entries
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null;

comment on column public.faq_entries.connection_id is
  'The WhatsApp number this answer is used on. Null means every number, which is what a one-number workspace wants and what every row created before this column means.';

-- The runner reads faq_entries on every inbound message and now filters
-- on this column as well, so it is worth an index.
create index if not exists faq_entries_org_connection_idx
  on public.faq_entries (org_id, connection_id)
  where is_active;

notify pgrst, 'reload schema';
