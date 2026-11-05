-- RLS for every Neura Chat table, scoped by org membership.
--
-- Baseline rule (as specified): a user may read/write a row only if its
-- org_id belongs to an org they are a member of (org_members).
--
-- Two deliberate exceptions to that baseline, called out explicitly for
-- review:
--   * org_members  — write access (insert/update/delete) is restricted to
--     org owners/admins. Under the plain "any member" rule, any member
--     could grant themselves or an arbitrary user_id the 'owner' role in
--     their own org (privilege escalation), or remove other members.
--     Read access still follows the plain rule. Members may still delete
--     their own membership row (leave the org).
--   * waba_connections — write access is restricted to owners/admins,
--     since this table holds encrypted Meta access tokens and the webhook
--     verify token. Read access still follows the plain rule (any member
--     can see connection status).
-- Every other table (contacts, conversations, messages, message_templates,
-- campaigns, campaign_recipients, automation_flows) uses the plain rule
-- uniformly for select/insert/update/delete.

-- =========================================================================
-- Helper functions (security definer to avoid RLS recursion on org_members)
-- =========================================================================
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = p_org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

-- =========================================================================
-- organizations
-- =========================================================================
alter table public.organizations enable row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

-- No insert/delete policy for the authenticated role: orgs are created by
-- the handle_new_user trigger (security definer, runs as table owner and
-- bypasses RLS) and are not deletable from the app in this stage.

-- =========================================================================
-- org_members
-- =========================================================================
alter table public.org_members enable row level security;

create policy org_members_select on public.org_members
  for select to authenticated
  using (public.is_org_member(org_id));

create policy org_members_insert on public.org_members
  for insert to authenticated
  with check (public.is_org_admin(org_id));

create policy org_members_update on public.org_members
  for update to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

create policy org_members_delete_admin on public.org_members
  for delete to authenticated
  using (public.is_org_admin(org_id));

create policy org_members_delete_self on public.org_members
  for delete to authenticated
  using (user_id = auth.uid());

-- =========================================================================
-- waba_connections
-- =========================================================================
alter table public.waba_connections enable row level security;

create policy waba_connections_select on public.waba_connections
  for select to authenticated
  using (public.is_org_member(org_id));

create policy waba_connections_insert on public.waba_connections
  for insert to authenticated
  with check (public.is_org_admin(org_id));

create policy waba_connections_update on public.waba_connections
  for update to authenticated
  using (public.is_org_admin(org_id))
  with check (public.is_org_admin(org_id));

create policy waba_connections_delete on public.waba_connections
  for delete to authenticated
  using (public.is_org_admin(org_id));

-- =========================================================================
-- contacts
-- =========================================================================
alter table public.contacts enable row level security;

create policy contacts_select on public.contacts
  for select to authenticated
  using (public.is_org_member(org_id));

create policy contacts_insert on public.contacts
  for insert to authenticated
  with check (public.is_org_member(org_id));

create policy contacts_update on public.contacts
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy contacts_delete on public.contacts
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- conversations
-- =========================================================================
alter table public.conversations enable row level security;

create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_org_member(org_id));

create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (public.is_org_member(org_id));

create policy conversations_update on public.conversations
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy conversations_delete on public.conversations
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- messages
-- =========================================================================
alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_org_member(org_id));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (public.is_org_member(org_id));

create policy messages_update on public.messages
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy messages_delete on public.messages
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- message_templates
-- =========================================================================
alter table public.message_templates enable row level security;

create policy message_templates_select on public.message_templates
  for select to authenticated
  using (public.is_org_member(org_id));

create policy message_templates_insert on public.message_templates
  for insert to authenticated
  with check (public.is_org_member(org_id));

create policy message_templates_update on public.message_templates
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy message_templates_delete on public.message_templates
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- campaigns
-- =========================================================================
alter table public.campaigns enable row level security;

create policy campaigns_select on public.campaigns
  for select to authenticated
  using (public.is_org_member(org_id));

create policy campaigns_insert on public.campaigns
  for insert to authenticated
  with check (public.is_org_member(org_id));

create policy campaigns_update on public.campaigns
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy campaigns_delete on public.campaigns
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- campaign_recipients
-- =========================================================================
alter table public.campaign_recipients enable row level security;

create policy campaign_recipients_select on public.campaign_recipients
  for select to authenticated
  using (public.is_org_member(org_id));

create policy campaign_recipients_insert on public.campaign_recipients
  for insert to authenticated
  with check (public.is_org_member(org_id));

create policy campaign_recipients_update on public.campaign_recipients
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy campaign_recipients_delete on public.campaign_recipients
  for delete to authenticated
  using (public.is_org_member(org_id));

-- =========================================================================
-- automation_flows
-- =========================================================================
alter table public.automation_flows enable row level security;

create policy automation_flows_select on public.automation_flows
  for select to authenticated
  using (public.is_org_member(org_id));

create policy automation_flows_insert on public.automation_flows
  for insert to authenticated
  with check (public.is_org_member(org_id));

create policy automation_flows_update on public.automation_flows
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy automation_flows_delete on public.automation_flows
  for delete to authenticated
  using (public.is_org_member(org_id));
