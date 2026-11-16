create table public.marketing_social_posts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  platform text not null check (platform in ('facebook','instagram')),
  status text not null default 'draft'
    check (status in ('draft','publishing','processing','ready','published','needs_attention')),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  container_id text check (container_id ~ '^[0-9]{1,30}$'),
  post_id text check (post_id ~ '^[0-9]{1,30}(_[0-9]{1,30})?$'),
  permalink text,
  error text,
  requested_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  attempt_started_at timestamptz,
  publish_started_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, platform),
  constraint social_post_draft_unclaimed check (
    status <> 'draft' or (attempt_started_at is null and publish_started_at is null and container_id is null and post_id is null)
  ),
  constraint social_post_attempt_claimed check (status = 'draft' or attempt_started_at is not null),
  constraint social_post_container_required check (
    status not in ('processing','ready') or (platform = 'instagram' and container_id is not null)
  ),
  constraint social_post_published_complete check (
    status <> 'published' or (post_id is not null and permalink is not null and publish_started_at is not null)
  )
);

comment on column public.marketing_social_posts.product_id is
  'Source product identity retained for duplicate protection and audit even if the product is deleted.';

alter table public.marketing_social_posts enable row level security;
revoke all on public.marketing_social_posts from public, anon, authenticated;
grant select on public.marketing_social_posts to authenticated;
grant all on public.marketing_social_posts to service_role;

create policy marketing_social_posts_admin_read
on public.marketing_social_posts for select to authenticated
using (public.is_catalogue_admin());
