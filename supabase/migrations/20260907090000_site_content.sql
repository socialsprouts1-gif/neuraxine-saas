-- =========================================================================
-- Editable landing page
--
-- Every word on the marketing site lived in ten React components, so a price
-- change or a new headline was a code change and a deploy. This holds the
-- content instead.
--
-- Separate from platform_settings on purpose: that table is admin-read-only,
-- and the landing page is served to anonymous visitors. A public SELECT here
-- is deliberate — this is published marketing copy, not configuration.
-- =========================================================================

create table if not exists public.site_content (
  -- One row per section: brand, hero, features, pricing, faq, footer …
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.site_content enable row level security;

-- Anyone may read: this is the public website.
drop policy if exists site_content_select on public.site_content;
create policy site_content_select on public.site_content
  for select to anon, authenticated
  using (true);

-- Only platform staff may write.
drop policy if exists site_content_write on public.site_content;
create policy site_content_write on public.site_content
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Brand assets — logo, favicon, OG image — go in their own public bucket
-- rather than the tenant `media` bucket, which is keyed by org id and
-- readable only by that org's members.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 5242880, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

drop policy if exists brand_objects_select on storage.objects;
create policy brand_objects_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'brand');

drop policy if exists brand_objects_write on storage.objects;
create policy brand_objects_write on storage.objects
  for all to authenticated
  using (bucket_id = 'brand' and public.is_platform_admin())
  with check (bucket_id = 'brand' and public.is_platform_admin());

notify pgrst, 'reload schema';
