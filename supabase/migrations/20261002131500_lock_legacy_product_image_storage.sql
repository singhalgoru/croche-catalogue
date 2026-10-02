update storage.buckets set public = false where id = 'product-images';

drop policy if exists "Product images are publicly readable" on storage.objects;
drop policy if exists "Authenticated admins can upload product images" on storage.objects;
drop policy if exists "Authenticated admins can update their product images" on storage.objects;
