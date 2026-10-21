create table public.product_drafts (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  version integer not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.product_drafts enable row level security;

create policy "Catalogue admins manage product drafts"
on public.product_drafts
for all
to authenticated
using (public.is_catalogue_admin())
with check (public.is_catalogue_admin());

revoke all on public.product_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.product_drafts to authenticated;
grant all on public.product_drafts to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-drafts',
  'product-drafts',
  false,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Catalogue admins manage draft images"
on storage.objects
for all
to authenticated
using (bucket_id = 'product-drafts' and public.is_catalogue_admin())
with check (bucket_id = 'product-drafts' and public.is_catalogue_admin());
