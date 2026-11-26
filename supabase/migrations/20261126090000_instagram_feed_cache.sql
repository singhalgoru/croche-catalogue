create table public.instagram_feed_cache (
  id boolean primary key default true check (id),
  username text not null,
  posts jsonb not null default '[]'::jsonb check (jsonb_typeof(posts) = 'array'),
  fetched_at timestamptz not null
);

alter table public.instagram_feed_cache enable row level security;
revoke all on public.instagram_feed_cache from anon, authenticated;
grant select, insert, update on public.instagram_feed_cache to service_role;
