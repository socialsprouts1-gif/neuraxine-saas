-- =========================================================================
-- AI Active is the default, not Copilot.
--
-- Copilot was the cautious choice: AI drafts, a human sends. But a WhatsApp
-- automation product whose bots do not answer until someone presses a button
-- is not doing the thing it was bought for. A tenant who wants a human in
-- the loop can still pick Copilot per conversation.
-- =========================================================================

alter table public.conversations
  alter column ai_mode set default 'ai';

-- Conversations still sitting on the old default have never had a mode
-- chosen for them — nobody picked Copilot, it was picked for them. Move
-- those over, and only those: a conversation someone deliberately set to
-- 'human' stays where they put it.
--
-- bot_enabled is what the message runner actually reads, so the two have to
-- agree or the mode becomes a label over the wrong behaviour.
update public.conversations
set ai_mode = 'ai',
    bot_enabled = true
where ai_mode = 'copilot'
  and bot_enabled = true;
