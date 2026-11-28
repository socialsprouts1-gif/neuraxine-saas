-- STOP INSTAGRAM SENDING, RIGHT NOW
--
-- For the day Instagram restricts an account. Run it in the Supabase
-- SQL editor; it takes effect on the next message, with no deploy and
-- no code change.
--
-- This is the emergency version of the Stop everything button on the
-- Instagram page. The button is per account and reversible in one
-- click; this is a blunter instrument that works before the button has
-- shipped, or when nobody can get to a screen.
--
-- READ THIS FIRST: every statement below affects EVERY workspace in
-- this database, not just yours. If you are running agency customers on
-- here, use the org-scoped version at the bottom instead.
--
-- What it does NOT touch:
--   * WhatsApp. Nothing here goes near it.
--   * Replies you type yourself in the Inbox. Those keep working, which
--     is the whole point — an account in trouble still needs a human
--     able to answer. Do not set instagram_connections.status to stop
--     the automation: that column also guards manual sending, so it
--     would take away the one thing you still want.


-- 1. The comment and DM automations. Instagram only. Start here.
update instagram_comment_rules set is_active = false where is_active;


-- 2. The second messages already queued, sent minutes or hours after
--    the first. These are unsolicited follow-ups to people who have not
--    written back, which is the kind of send an account gets restricted
--    for, and they will go out on their own schedule unless cancelled.
delete from instagram_followups where sent_at is null;


-- 3. OPTIONAL, AND IT HAS A COST. The chatbots, the FAQ and the AI
--    assistant answer Instagram DMs as well as WhatsApp ones, because a
--    bot with no connection pinned to it means "any channel". Switching
--    them off here stops them on BOTH. Run this only if the DM replies
--    are what caused the trouble, and expect your WhatsApp bot to go
--    quiet with them.
--
-- update chatbot_flows    set is_active = false where is_active and connection_id is null;
-- update faq_entries      set is_active = false where is_active and connection_id is null;
-- update automation_flows set is_active = false where is_active and connection_id is null;
-- update ai_assistants    set is_active = false where is_active and connection_id is null;


-- TO TURN THE AUTOMATIONS BACK ON
--
-- Not with an UPDATE. Switching every rule back on at once includes the
-- ones that were already off on purpose, and the half-finished ones.
-- Turn them on from the Instagram page, one at a time, once the
-- restriction has lifted — and set the per-hour limit lower than the
-- default first.


-- ORG-SCOPED VERSION
--
-- Find your workspace id, then use it below:
--
--   select id, name from organizations order by created_at;
--
-- update instagram_comment_rules set is_active = false
--   where is_active and org_id = 'PASTE-THE-ID-HERE';
--
-- delete from instagram_followups
--   where sent_at is null and org_id = 'PASTE-THE-ID-HERE';
