-- =========================================================================
-- Appointment reminders, and where a booking went in the calendar
--
-- meetings.reminder_sent_at existed and nothing ever wrote to it. This adds
-- the settings a reminder needs and the column that records where the
-- booking ended up outside this system.
-- =========================================================================

alter table public.appointment_settings
  -- How long before the appointment to remind the customer. 0 turns it off.
  add column if not exists reminder_hours integer not null default 3
    check (reminder_hours between 0 and 168),
  -- A reminder usually falls outside WhatsApp's 24-hour service window, and
  -- outside it Meta accepts nothing but an approved template. Free-form is
  -- attempted only when this is blank, and then only when the window is
  -- genuinely open — otherwise the reminder is recorded as skipped rather
  -- than failing silently.
  add column if not exists reminder_template text,
  add column if not exists reminder_template_language text not null default 'en',
  add column if not exists reminder_message text not null default
    'Reminder: your appointment is at {{time}} today. Reply here if you need to change it.';

alter table public.meetings
  -- The event id in whatever calendar this was pushed to, so a second push
  -- updates the event rather than creating a duplicate.
  add column if not exists calendar_event_id text,
  add column if not exists calendar_synced_at timestamptz,
  add column if not exists calendar_error text;

-- The reminder sweep scans on exactly this.
create index if not exists meetings_reminder_due_idx
  on public.meetings(starts_at)
  where status = 'scheduled' and reminder_sent_at is null;

notify pgrst, 'reload schema';
