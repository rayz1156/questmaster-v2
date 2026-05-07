insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('intro-photos','intro-photos', true, 10485760,
   array['image/jpeg','image/png','image/webp','image/gif']),
  ('quest-submissions','quest-submissions', true, 52428800,
   array['image/jpeg','image/png','image/webp','image/gif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain'])
on conflict (id) do nothing;

drop policy if exists "boards_storage_authenticated_insert" on storage.objects;
create policy "boards_storage_authenticated_insert" on storage.objects
for insert to authenticated
with check (bucket_id in ('intro-photos','quest-submissions'));

drop policy if exists "boards_storage_owner_update" on storage.objects;
create policy "boards_storage_owner_update" on storage.objects
for update to authenticated using (bucket_id in ('intro-photos','quest-submissions') and owner = auth.uid());

drop policy if exists "boards_storage_owner_delete" on storage.objects;
create policy "boards_storage_owner_delete" on storage.objects
for delete to authenticated using (bucket_id in ('intro-photos','quest-submissions') and (owner = auth.uid() or public.is_admin()));
