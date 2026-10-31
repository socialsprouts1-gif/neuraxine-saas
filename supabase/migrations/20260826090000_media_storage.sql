-- =========================================================================
-- Gallery uploads
--
-- The Gallery could only hold URLs that already existed somewhere else,
-- which meant anyone wanting to send an image first had to find their own
-- host. A media library that cannot store media is a bookmark list.
--
-- Files go to a Supabase Storage bucket, uploaded straight from the browser
-- rather than through a route handler: serverless request bodies are capped
-- at 4.5 MB on Vercel, which is smaller than a phone photo.
-- =========================================================================

-- Public-read so the URL can be handed to Meta, which fetches media from an
-- anonymous GET and would fail against a signed or private object. Writes
-- stay locked to org members by the policies below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  104857600, -- 100 MB; WhatsApp's own ceiling is well under this per type
  null       -- enforced in the app, where the message can name the type
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Objects are keyed <org_id>/<uuid>-<filename>, so the first path segment
-- decides who may write. is_org_member is SECURITY DEFINER, so it sees the
-- membership rows the caller cannot select directly.
-- Reads. A public bucket serves files over its public URL without touching
-- RLS, which is why this was missed — but the Storage API still needs SELECT
-- to list a folder, and supabase-js checks whether an object exists before
-- uploading with upsert:false. Without this, uploads are rejected outright.
drop policy if exists media_objects_select on storage.objects;
create policy media_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists media_objects_insert on storage.objects;
create policy media_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists media_objects_update on storage.objects;
create policy media_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists media_objects_delete on storage.objects;
create policy media_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- Deleting a gallery row has to delete the file too, or storage fills with
-- objects nothing references and no screen can reach.
alter table public.media_assets
  add column if not exists storage_path text;

comment on column public.media_assets.storage_path is
  'Object key inside the media bucket. Null for assets added by pasting an external URL, which we do not own and must not delete.';
