-- Visual flow builder: the chatbot becomes a graph rather than a list of
-- nodes, so the canvas needs somewhere to keep the connections between them
-- and the runtime needs somewhere to keep its place inside a running flow.

-- =========================================================================
-- chatbot_flows — the graph
-- =========================================================================

-- Edges are stored separately from nodes because the canvas edits them
-- independently: dragging a connection changes no node.
alter table public.chatbot_flows
  add column if not exists edges jsonb not null default '[]'::jsonb;

-- The node the trigger fires from. Null falls back to the first node, which
-- is what flows built in the old simple form rely on.
alter table public.chatbot_flows
  add column if not exists entry_node_id text;

-- =========================================================================
-- conversations — per-conversation flow state
-- =========================================================================

-- Answers collected by Ask nodes, addressable as {{variable}} in later
-- nodes. Scoped to the conversation rather than the contact: a flow run is
-- the unit that collects them.
alter table public.conversations
  add column if not exists bot_variables jsonb not null default '{}'::jsonb;

-- Set by a Delay node longer than the inline threshold. Nothing resumes
-- these yet — the scheduler is not built — so the column exists to make
-- that state visible rather than to pretend it is handled.
alter table public.conversations
  add column if not exists bot_resume_at timestamptz;

create index if not exists conversations_bot_resume_idx
  on public.conversations(bot_resume_at)
  where bot_resume_at is not null;

-- =========================================================================
-- bot_runs — record which node produced the reply
-- =========================================================================
alter table public.bot_runs
  add column if not exists node_id text;
alter table public.bot_runs
  add column if not exists node_kind text;
