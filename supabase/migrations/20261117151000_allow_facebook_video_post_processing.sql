alter table public.marketing_social_posts
  drop constraint social_post_container_required,
  add constraint social_post_container_required check (
    status not in ('processing','ready')
    or (platform = 'instagram' and container_id is not null)
    or (status = 'processing' and platform = 'facebook'
      and request->>'mediaType' = 'video' and post_id is not null)
  );
