-- =====================================================================
-- Sequences that start when an appointment does something
-- =====================================================================
--
-- Everything after a visit is the same shape in every trade: care
-- instructions, a check-in a few days later, a request for a review,
-- and a reminder six months on. A dentist calls it a recall, a salon
-- calls it a touch-up, a gym calls it a reassessment, a tutor calls it
-- the next term. The sequence engine already does all of it — it just
-- had no way to be told "when somebody's appointment finishes".
--
-- So: a fourth trigger, and which appointment event starts it.

alter table public.drip_campaigns
  drop constraint if exists drip_campaigns_trigger_type_check;

alter table public.drip_campaigns
  add constraint drip_campaigns_trigger_type_check
  check (trigger_type in ('manual', 'keyword', 'api', 'appointment'));

-- Which event. Null for every other trigger, and ignored by them.
alter table public.drip_campaigns
  add column if not exists trigger_event text;

alter table public.drip_campaigns
  drop constraint if exists drip_campaigns_trigger_event_check;

alter table public.drip_campaigns
  add constraint drip_campaigns_trigger_event_check
  check (
    trigger_event is null
    or trigger_event in ('booked', 'completed', 'cancelled', 'no_show')
  );

create index if not exists drip_campaigns_appointment_idx
  on public.drip_campaigns (org_id, trigger_event)
  where trigger_type = 'appointment' and status = 'active';

notify pgrst, 'reload schema';

-- Scoped to one kind of visit, or to all of them.
--
-- A dentist's six-month cleaning recall should not go to somebody who
-- came in for a root canal, and a salon's "how is the colour holding?"
-- should not go to somebody who came for a trim. Null means every
-- appointment type, which is what most workspaces want on day one.
alter table public.drip_campaigns
  add column if not exists trigger_appointment_type_id uuid
    references public.appointment_types (id) on delete set null;

-- An enrolment that an appointment started, so it is possible to see
-- later why somebody is in a sequence nobody added them to.
alter table public.drip_enrollments
  drop constraint if exists drip_enrollments_enrolled_via_check;

alter table public.drip_enrollments
  add constraint drip_enrollments_enrolled_via_check
  check (enrolled_via in ('manual', 'keyword', 'api', 'import', 'appointment'));

notify pgrst, 'reload schema';
