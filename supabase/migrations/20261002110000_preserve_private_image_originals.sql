insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-originals',
  'product-originals',
  false,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Catalogue admins can archive their image originals"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-originals'
  and public.is_catalogue_admin()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Catalogue admins can read image originals"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'product-originals'
  and public.is_catalogue_admin()
);
