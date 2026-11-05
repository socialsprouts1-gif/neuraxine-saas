-- Record how each message was sent, and as whom.
--
-- The log could say a message was accepted and nothing else. When one was
-- accepted and never arrived, the two facts that decide why — which
-- transport carried it, and what from address it claimed — were exactly
-- the two the log did not keep. A message sent through one provider while
-- claiming to come from another provider's domain fails DMARC at the
-- receiving server: accepted, then filed as spam or dropped. From the
-- sending end that is indistinguishable from a message that arrived.

alter table email_log
  add column if not exists transport text,
  add column if not exists from_email text;

comment on column email_log.transport is
  'resend or smtp: which way this message left';
comment on column email_log.from_email is
  'The from address claimed, which is what DMARC is checked against';

notify pgrst, 'reload schema';
