-- Fix bill-images RLS (run in Supabase SQL Editor).
-- Fixes: "new row violates row-level security policy" on upload.
-- Storage INSERT returns the new row, so SELECT policy is also required.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bill-images',
  'bill-images',
  false,
  524288,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Recreate policies for the authenticated role (signed-in users).
drop policy if exists "Users read own bill images" on storage.objects;
drop policy if exists "Users upload own bill images" on storage.objects;
drop policy if exists "Users update own bill images" on storage.objects;
drop policy if exists "Users delete own bill images" on storage.objects;

create policy "Users read own bill images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
  );

create policy "Users upload own bill images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
  );

create policy "Users update own bill images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
  )
  with check (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
  );

create policy "Users delete own bill images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bill-images'
    and name like (auth.uid()::text || '/%')
  );
