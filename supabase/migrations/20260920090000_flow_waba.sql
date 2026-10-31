-- Which WhatsApp Business Account a form's flow lives on.
--
-- A flow belongs to one account. A workspace with two numbers has two
-- accounts, and sending a flow from the number on the other one fails with
-- Meta error 131009 — "Parameter flow_id is invalid" — which names no
-- account, no number and nothing an operator can act on.
--
-- Recording it at creation means the mismatch can be caught here, in a
-- sentence that names both numbers, instead of at Meta in one that names
-- neither.

alter table whatsapp_flows
  add column if not exists waba_id text;

-- Existing rows are backfilled from the workspace's default number, which
-- is the one they will have been created on: until this column existed
-- there was no way to build a flow anywhere else.
update whatsapp_flows f
set waba_id = c.waba_id
from waba_connections c
where f.waba_id is null
  and c.org_id = f.org_id
  and c.is_default;

-- Falling back to any active number for a workspace that never set a
-- default, rather than leaving the column null and losing the check.
update whatsapp_flows f
set waba_id = c.waba_id
from waba_connections c
where f.waba_id is null
  and c.org_id = f.org_id
  and c.status = 'active';

create index if not exists whatsapp_flows_waba_idx on whatsapp_flows (org_id, waba_id);
