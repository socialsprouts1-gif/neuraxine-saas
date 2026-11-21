-- =========================================================================
-- Agent persona — the language it answers in, and how it speaks
-- =========================================================================
-- The assistant editor had a prompt box and nothing else about voice, so
-- "answer in Hindi" was something you had to remember to type into free
-- text, and nothing on screen said it was a choice at all. These three
-- columns make it one, and the prompt builder turns them into the
-- sentences the model is actually given — a language picker that only
-- coloured a label would be the worst kind of setting: visible, saved, and
-- doing nothing.

alter table public.ai_assistants
  add column if not exists primary_language text not null default 'en';

-- Whether to answer in the customer's language instead, when they write in
-- a different one. Off by default: a business that supports one language
-- would rather say so than answer in a language nobody there can read.
alter table public.ai_assistants
  add column if not exists multilingual_reply boolean not null default false;

alter table public.ai_assistants
  add column if not exists tone text not null default 'professional';

notify pgrst, 'reload schema';
