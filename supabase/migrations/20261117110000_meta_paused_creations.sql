create table public.marketing_meta_creations (
  draft_id uuid primary key references public.marketing_campaign_drafts(id) on delete restrict,
  status text not null default 'creating' check (status in ('creating', 'created', 'needs_attention')),
  account_id text not null check (account_id ~ '^[0-9]{1,30}$'),
  campaign_id text check (campaign_id ~ '^[0-9]{1,30}$'),
  adset_id text check (adset_id ~ '^[0-9]{1,30}$'),
  creative_id text check (creative_id ~ '^[0-9]{1,30}$'),
  ad_id text check (ad_id ~ '^[0-9]{1,30}$'),
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  error text,
  constraint marketing_meta_creation_complete check (
    status <> 'created' or
    (campaign_id is not null and adset_id is not null and creative_id is not null and ad_id is not null)
  )
);

alter table public.marketing_meta_creations enable row level security;
revoke all on public.marketing_meta_creations from public, anon, authenticated;
grant select on public.marketing_meta_creations to authenticated;
grant all on public.marketing_meta_creations to service_role;

create policy marketing_meta_creations_admin_read
on public.marketing_meta_creations
for select to authenticated
using (public.is_catalogue_admin());
