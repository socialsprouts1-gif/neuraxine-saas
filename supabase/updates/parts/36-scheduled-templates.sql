-- =====================================================================
-- Scheduling a template, not just a plain message
-- =====================================================================
--
-- A scheduled message went out as plain text, and WhatsApp only delivers
-- plain text inside 24 hours of the customer's own last message. So the
-- one thing people schedule — a follow-up days later, a reminder next
-- week — was the one thing that could not be delivered. The dispatcher
-- even said "it has to go as an approved template", which was true and
-- impossible: there was nowhere to name one.
--
-- The body stays. With a template it holds the readable text, so the
-- list on screen and the record in the inbox say what was actually sent
-- rather than a template name nobody recognises.

alter table public.scheduled_messages
  add column if not exists template_name text,
  add column if not exists template_language text not null default 'en',

  -- Body variables in order: the first fills {{1}}, the second {{2}}.
  -- Fixed at scheduling time, which is honest — one scheduled message
  -- goes to one person, so there is nothing to personalise later.
  add column if not exists template_variables text[] not null default '{}';

notify pgrst, 'reload schema';
