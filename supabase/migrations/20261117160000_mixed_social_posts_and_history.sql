alter table public.marketing_social_posts
  drop constraint marketing_social_posts_product_id_platform_key;

create unique index social_post_one_active_per_platform
  on public.marketing_social_posts(product_id, platform)
  where status <> 'published';

alter table public.marketing_social_posts
  drop constraint social_post_container_required,
  add constraint social_post_container_required check (coalesce(
    status not in ('processing','ready')
    or (platform = 'instagram' and (
      container_id is not null
      or (request->>'mediaType' = 'mixed' and publish_started_at is null
        and case when jsonb_typeof(request->'childMediaIds') = 'array'
          and jsonb_typeof(request->'imageUrls') = 'array'
        then jsonb_array_length(request->'imageUrls') between 1 and 9
          and jsonb_array_length(request->'childMediaIds') = jsonb_array_length(request->'imageUrls') + 1
        else false end)
    ))
    or (status = 'processing' and platform = 'facebook'
      and request->>'mediaType' = 'video' and post_id is not null)
  , false));

comment on column public.marketing_social_posts.product_id is
  'Source product identity retained for history; only one unfinished or uncertain post per platform is allowed.';
