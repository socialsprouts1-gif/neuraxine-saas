-- Which number a form is built on.
--
-- A Flow lives on a WhatsApp Business Account, not on a workspace, and
-- once Meta has created it there it cannot move. routeFlow already
-- honours that for a form it has seen before — it routes by the stamped
-- waba_id and refuses to fall back to a number on some other account.
--
-- The gap was the first moment: a brand-new form silently went to
-- whichever number happened to be the default. With four numbers on
-- three accounts that is a decision the operator could not see, and the
-- consequence — a form that only opens for customers of one account —
-- surfaces days later as "the form does not work".

alter table public.whatsapp_flows
  add column if not exists connection_id uuid references public.waba_connections(id) on delete set null;

comment on column public.whatsapp_flows.connection_id is
  'The number this form is created on. Only consulted before Meta has created the flow; after that waba_id decides and cannot change.';

notify pgrst, 'reload schema';
