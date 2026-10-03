-- =========================================================================
-- Where a delayed flow picks back up.
--
-- bot_resume_at recorded when to continue but never where, so a flow that
-- parked on a Delay had nothing to resume from — it simply stopped, and the
-- rest of the flow was never sent.
-- =========================================================================

alter table public.conversations
  add column if not exists bot_resume_node_id text;

-- The scheduler scans on this, so it wants both halves.
create index if not exists conversations_resume_idx
  on public.conversations(bot_resume_at)
  where bot_resume_at is not null and bot_resume_node_id is not null;
