-- =========================================================================
-- Forms an AI assistant is allowed to open.
--
-- Deliberately a list the business chooses rather than "any published form".
-- The assistant decides when to send one, and a model that can reach every
-- form in the workspace will eventually hand a customer the wrong one — an
-- internal survey, a form for a different product line. An empty list is
-- the default and means the assistant sends no forms at all.
--
-- Stored as ids rather than names so renaming a form does not silently
-- detach it from every assistant that offers it.
-- =========================================================================

alter table public.ai_assistants
  add column if not exists form_ids uuid[] not null default '{}'::uuid[];

comment on column public.ai_assistants.form_ids is
  'whatsapp_flows the assistant may offer. Empty means none.';

-- A short line the assistant is told alongside the form's name, so it knows
-- when the form is the right answer. Without it the model has only the name
-- to go on, and "Form 2" tells it nothing.
alter table public.whatsapp_flows
  add column if not exists description text;

comment on column public.whatsapp_flows.description is
  'What this form is for, in one line. Shown to the AI assistant so it knows when to offer it.';

-- The message and button that go out with the form when a bot sends it.
-- Kept on the form rather than typed again at every call site: the same
-- form sent from the inbox, a chatbot and the assistant should introduce
-- itself the same way.
alter table public.whatsapp_flows
  add column if not exists invitation text;
alter table public.whatsapp_flows
  add column if not exists button_text text not null default 'Open form';

comment on column public.whatsapp_flows.invitation is
  'The message body sent above the form. Falls back to a generic line.';

-- How the form reached this person. "inbox" for an agent sending it by
-- hand, "chatbot" from a flow node, "assistant" from the AI. Worth knowing
-- when a form suddenly starts going out far more often than it used to.
alter table public.flow_sends
  add column if not exists source text not null default 'inbox';
