-- =========================================================================
-- AI Assistant: bring-your-own provider + knowledge base + agent rules
--
-- Until now an assistant was always Claude on the platform's own
-- ANTHROPIC_API_KEY. A tenant can now pick the provider, paste their own
-- key (encrypted at rest, same AES-256-GCM envelope as WhatsApp tokens),
-- attach knowledge the assistant may quote, and set the rules that decide
-- when it answers at all.
-- =========================================================================

alter table public.ai_assistants
  -- Which API the reply goes to. 'custom' is any OpenAI-compatible
  -- endpoint (OpenRouter, Groq, Together, a local Ollama), which is why it
  -- is the only one that also needs api_base_url.
  add column if not exists provider text not null default 'anthropic',
  add column if not exists api_key_encrypted text,
  add column if not exists api_base_url text,
  add column if not exists max_tokens integer not null default 1024,
  -- Which role card the prompt came from, so the editor can re-select it.
  -- 'custom' means the business wrote the prompt themselves.
  add column if not exists prompt_preset text not null default 'custom',

  -- --- agent rules: memory & knowledge ---------------------------------
  add column if not exists memory_turns integer not null default 20,
  add column if not exists use_knowledge_base boolean not null default true,
  add column if not exists stop_on_human boolean not null default true,

  -- --- agent rules: working hours --------------------------------------
  -- Times are 'HH:MM' text, not `time`. Postgres renders `time` as
  -- '09:00:00', which an <input type="time"> round-trips inconsistently.
  add column if not exists working_hours_enabled boolean not null default false,
  add column if not exists working_hours_timezone text not null default 'UTC',
  add column if not exists working_hours_start text not null default '09:00',
  add column if not exists working_hours_end text not null default '18:00',
  -- 0 = Sunday … 6 = Saturday, matching JavaScript's getDay().
  add column if not exists working_days integer[] not null default '{1,2,3,4,5}',
  add column if not exists off_hours_message text not null default '',

  -- --- agent rules: follow-up ------------------------------------------
  add column if not exists followup_enabled boolean not null default false,
  add column if not exists followup_delay_minutes integer not null default 60,
  add column if not exists followup_message text not null default '',
  add column if not exists max_followups integer not null default 1;

alter table public.ai_assistants drop constraint if exists ai_assistants_provider_check;
alter table public.ai_assistants add constraint ai_assistants_provider_check
  check (provider in ('anthropic', 'openai', 'google', 'custom'));

alter table public.ai_assistants drop constraint if exists ai_assistants_max_tokens_check;
alter table public.ai_assistants add constraint ai_assistants_max_tokens_check
  check (max_tokens between 64 and 8192);

alter table public.ai_assistants drop constraint if exists ai_assistants_memory_turns_check;
alter table public.ai_assistants add constraint ai_assistants_memory_turns_check
  check (memory_turns between 0 and 100);

alter table public.ai_assistants drop constraint if exists ai_assistants_followup_check;
alter table public.ai_assistants add constraint ai_assistants_followup_check
  check (followup_delay_minutes between 1 and 10080 and max_followups between 0 and 10);

-- =========================================================================
-- assistant_knowledge — what the assistant is allowed to know.
--
-- assistant_id null means the entry is shared by every assistant in the
-- org, which is the common case: one product sheet, several assistants.
-- =========================================================================
create table if not exists public.assistant_knowledge (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  assistant_id uuid references public.ai_assistants(id) on delete cascade,
  title text not null,
  content text not null default '',
  source_type text not null default 'text'
    check (source_type in ('text', 'faq', 'url', 'file')),
  source_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_knowledge_org_id_idx
  on public.assistant_knowledge(org_id);
create index if not exists assistant_knowledge_assistant_id_idx
  on public.assistant_knowledge(assistant_id);

alter table public.assistant_knowledge enable row level security;

drop policy if exists assistant_knowledge_select on public.assistant_knowledge;
create policy assistant_knowledge_select on public.assistant_knowledge
  for select to authenticated using (public.is_org_member(org_id));
drop policy if exists assistant_knowledge_insert on public.assistant_knowledge;
create policy assistant_knowledge_insert on public.assistant_knowledge
  for insert to authenticated with check (public.is_org_member(org_id));
drop policy if exists assistant_knowledge_update on public.assistant_knowledge;
create policy assistant_knowledge_update on public.assistant_knowledge
  for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists assistant_knowledge_delete on public.assistant_knowledge;
create policy assistant_knowledge_delete on public.assistant_knowledge
  for delete to authenticated using (public.is_org_member(org_id));
