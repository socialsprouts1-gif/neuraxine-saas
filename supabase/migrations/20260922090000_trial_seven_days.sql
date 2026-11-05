-- The free trial is seven days.
--
-- It was seeded at fourteen and the number was also written into five
-- files as a fallback. Those now read a single constant, and this brings
-- the stored setting in line with it — a default that disagrees with
-- itself is worse than a wrong one, because the banner counts down from a
-- different number than the welcome email promised and neither matches
-- what the database actually gave.
--
-- Only the setting changes. Workspaces already trialling keep the end date
-- they were given: shortening somebody's trial underneath them, for a
-- change they never asked for, is not a default change — it is taking
-- something back.

update public.platform_settings
set value = jsonb_set(coalesce(value, '{}'::jsonb), '{trial_days}', '7'::jsonb),
    updated_at = now()
where key = 'billing';

insert into public.platform_settings (key, value, description)
values ('billing', '{"trial_days":7}'::jsonb, 'Length of the free trial given to a new workspace, in days')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
