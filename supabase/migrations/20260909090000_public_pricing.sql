-- =========================================================================
-- Let the website read the price list
--
-- plans_select was `to authenticated`, so the landing page — served to
-- anonymous visitors — could not read the catalogue at all. It carried its
-- own hardcoded copy instead, which is how the site ended up advertising
-- prices in dollars that no subscription had ever charged.
--
-- Two narrow grants, both read-only and both limited to what is already
-- published on the website.
-- =========================================================================

-- The catalogue, but only what is on sale. A plan taken off sale disappears
-- from the website, which is the whole point of the is_active flag.
drop policy if exists plans_public_select on public.plans;
create policy plans_public_select on public.plans
  for select to anon
  using (is_active);

-- The trial length, and nothing else in this table. platform_settings holds
-- configuration, so this is keyed to the one row the pricing section needs
-- rather than opened wholesale.
drop policy if exists platform_settings_public_billing on public.platform_settings;
create policy platform_settings_public_billing on public.platform_settings
  for select to anon
  using (key = 'billing');

notify pgrst, 'reload schema';
