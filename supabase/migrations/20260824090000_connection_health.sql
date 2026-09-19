-- =========================================================================
-- Connection health
--
-- When Meta rejects a send because the stored access token is dead, the only
-- place that failure surfaced was the bot_runs row for whichever customer
-- happened to message first. That means the operator learns their number is
-- broken from a customer, which is the wrong way round. Record the last
-- credential-level rejection on the connection itself so Integrations can say
-- so before the next message arrives.
--
-- Deliberately NOT a status change: the row stays 'active' so sends keep
-- being attempted and start working the instant a valid token is pasted in.
-- =========================================================================

alter table public.waba_connections
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz;

comment on column public.waba_connections.last_error is
  'Plain-English description of the most recent credential-level rejection from Meta. Cleared on the next successful send or on reconnect.';
