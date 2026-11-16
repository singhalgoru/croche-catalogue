create table public.marketing_campaign_drafts (
  id uuid primary key default gen_random_uuid(),
  brief jsonb not null check (jsonb_typeof(brief) = 'object'),
  proposal jsonb not null check (jsonb_typeof(proposal) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  constraint marketing_campaign_drafts_review_state check (
    (status = 'draft' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null)
  )
);

alter table public.marketing_campaign_drafts enable row level security;
revoke all on public.marketing_campaign_drafts from public, anon, authenticated;
grant select, insert on public.marketing_campaign_drafts to authenticated;
grant all on public.marketing_campaign_drafts to service_role;

create policy marketing_campaign_drafts_admin_read
on public.marketing_campaign_drafts
for select to authenticated
using (public.is_catalogue_admin());

create policy marketing_campaign_drafts_admin_insert
on public.marketing_campaign_drafts
for insert to authenticated
with check (
  public.is_catalogue_admin()
  and created_by = auth.uid()
  and status = 'draft'
  and reviewed_by is null
  and reviewed_at is null
);

create function public.review_marketing_campaign_draft(target_id uuid, decision text)
returns public.marketing_campaign_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewed public.marketing_campaign_drafts;
begin
  if not public.is_catalogue_admin() then
    raise exception 'Verified admin access required.';
  end if;
  if decision is null or decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  update public.marketing_campaign_drafts
  set status = decision,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = target_id
    and status = 'draft'
  returning * into reviewed;

  if not found then
    raise exception 'Draft was not found or has already been reviewed.';
  end if;
  return reviewed;
end;
$$;

revoke all on function public.review_marketing_campaign_draft(uuid, text) from public, anon;
grant execute on function public.review_marketing_campaign_draft(uuid, text) to authenticated;
