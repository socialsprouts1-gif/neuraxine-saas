-- =========================================================================
-- Realtime on messages, so the inbox can hear an incoming message.
--
-- Without this the panel only learns about a message when someone reloads
-- the page, which is why it could never make a sound. Postgres changes are
-- still filtered by RLS, so a subscriber only receives rows for orgs they
-- are a member of.
-- =========================================================================

do $$
begin
  -- add table is not idempotent — it errors if the table is already
  -- published, which would take the whole migration down on a re-run.
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

-- The payload carries only the changed row's columns by default, which is
-- all the inbox needs: org_id to know it is ours, conversation_id to know
-- where it landed, and direction to know whether to make a sound.
