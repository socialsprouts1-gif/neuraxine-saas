-- Templates belong to a WhatsApp Business Account, not to a workspace.
--
-- message_templates was unique on (org_id, name, language), which is only
-- correct while a workspace has one account. With two connected, a template
-- named "marketing_" on each account collapses into a single row: syncing
-- overwrites one account's template with the other's, and the list gives no
-- way to tell which account anything belongs to.

alter table public.message_templates
  add column if not exists waba_id text not null default '';

-- Existing rows were all created against whichever account resolved as the
-- default, so attribute them there rather than leaving them unowned.
update public.message_templates t
set waba_id = c.waba_id
from public.waba_connections c
where t.waba_id = ''
  and c.org_id = t.org_id
  and c.is_default;

update public.message_templates t
set waba_id = c.waba_id
from public.waba_connections c
where t.waba_id = ''
  and c.org_id = t.org_id;

alter table public.message_templates
  drop constraint if exists message_templates_org_id_name_language_key;

-- A plain column index, not an expression: PostgREST's on_conflict can only
-- name real columns, so an expression index here would be unusable from the
-- client and every upsert would fail.
create unique index if not exists message_templates_account_identity_idx
  on public.message_templates(org_id, waba_id, name, language);

create index if not exists message_templates_waba_idx
  on public.message_templates(org_id, waba_id);

notify pgrst, 'reload schema';
