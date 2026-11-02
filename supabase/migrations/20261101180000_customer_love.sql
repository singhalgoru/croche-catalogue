create table public.customer_love (
  id uuid primary key,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  quote text not null check (length(btrim(quote)) between 10 and 1000),
  product_id uuid references public.products(id) on delete set null,
  image_data bytea check (octet_length(image_data) <= 307200),
  image_alt text not null default '' check (length(image_alt) <= 200),
  consent_confirmed boolean not null default false,
  consent_date date,
  consent_source text not null default '' check (length(consent_source) <= 300),
  published boolean not null default false,
  featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not published or (consent_confirmed and consent_date is not null and length(btrim(consent_source)) > 0)),
  check (image_data is null or length(btrim(image_alt)) > 0)
);
alter table public.customer_love enable row level security;
revoke all on public.customer_love from public, anon, authenticated;
grant all on public.customer_love to service_role;

create function public.list_customer_love(admin_view boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if admin_view and not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  return coalesce((select jsonb_agg(
    jsonb_build_object('id',t.id,'display_name',t.display_name,'quote',t.quote,
      'product_id',case when p.published then t.product_id else null end,
      'has_image',t.image_data is not null,'image_alt',t.image_alt,
      'featured',t.featured,'sort_order',t.sort_order)
    || case when admin_view then jsonb_build_object('product_id',t.product_id,'published',t.published,
      'consent_confirmed',t.consent_confirmed,'consent_date',t.consent_date,
      'consent_source',t.consent_source,'version',t.version) else '{}'::jsonb end
    order by t.sort_order,t.created_at,t.id)
    from public.customer_love t left join public.products p on p.id=t.product_id
    where admin_view or (t.published and t.consent_confirmed)), '[]'::jsonb);
end $$;
revoke all on function public.list_customer_love(boolean) from public;
grant execute on function public.list_customer_love(boolean) to anon, authenticated, service_role;

create function public.customer_love_photo(testimonial_id uuid,admin_view boolean default false)
returns text language plpgsql security definer set search_path = ''
as $$
begin
  if admin_view and not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  return (select replace(encode(image_data,'base64'),E'\n','') from public.customer_love
    where id=testimonial_id and (admin_view or (published and consent_confirmed)));
end $$;
revoke all on function public.customer_love_photo(uuid,boolean) from public;
grant execute on function public.customer_love_photo(uuid,boolean) to anon, authenticated, service_role;

create function public.save_customer_love(testimonial_id uuid,expected_version integer,entry jsonb,photo_base64 text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare previous public.customer_love; photo bytea; consent_day date;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if testimonial_id is null or expected_version is null or expected_version < 0 or entry is null then
    raise exception 'Valid testimonial details required.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(817265);
  select * into previous from public.customer_love where id=testimonial_id for update;
  if (found and previous.version <> expected_version) or (not found and expected_version <> 0) then
    raise exception 'This testimonial changed. Reload before saving.';
  end if;
  if previous.id is null and (select count(*) from public.customer_love) >= 100 then
    raise exception 'Limit of 100 testimonials reached. Remove unused drafts first.';
  end if;
  consent_day := nullif(entry->>'consent_date','')::date;
  if consent_day > current_date then raise exception 'Consent date cannot be in the future.'; end if;
  photo := case when photo_base64 is null then previous.image_data
    when photo_base64='' then null else decode(photo_base64,'base64') end;
  if photo is not null and (octet_length(photo) < 12 or octet_length(photo) > 307200
    or substring(photo from 1 for 4) <> decode('52494646','hex')
    or substring(photo from 9 for 4) <> decode('57454250','hex')) then
    raise exception 'Choose a prepared WebP photo up to 300 KB.';
  end if;
  insert into public.customer_love(id,display_name,quote,product_id,image_data,image_alt,consent_confirmed,
    consent_date,consent_source,published,featured,sort_order)
  values(testimonial_id,btrim(entry->>'display_name'),btrim(entry->>'quote'),nullif(entry->>'product_id','')::uuid,
    photo,btrim(coalesce(entry->>'image_alt','')),(entry->>'consent_confirmed')::boolean,
    consent_day,btrim(coalesce(entry->>'consent_source','')),(entry->>'published')::boolean,
    (entry->>'featured')::boolean,(entry->>'sort_order')::integer)
  on conflict(id) do update set display_name=excluded.display_name,quote=excluded.quote,product_id=excluded.product_id,
    image_data=excluded.image_data,image_alt=excluded.image_alt,consent_confirmed=excluded.consent_confirmed,
    consent_date=excluded.consent_date,consent_source=excluded.consent_source,published=excluded.published,
    featured=excluded.featured,sort_order=excluded.sort_order,version=customer_love.version+1,updated_at=now();
  return testimonial_id;
end $$;
revoke all on function public.save_customer_love(uuid,integer,jsonb,text) from public, anon;
grant execute on function public.save_customer_love(uuid,integer,jsonb,text) to authenticated;

create function public.delete_customer_love(testimonial_id uuid,expected_version integer)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  delete from public.customer_love where id=testimonial_id and version=expected_version;
  if not found then raise exception 'This testimonial changed. Reload before deleting.'; end if;
  return testimonial_id;
end $$;
revoke all on function public.delete_customer_love(uuid,integer) from public, anon;
grant execute on function public.delete_customer_love(uuid,integer) to authenticated;

create trigger customer_love_publish_rebuild after insert on public.customer_love
  for each row when (new.published) execute function public.request_site_rebuild();
create trigger customer_love_update_rebuild after update on public.customer_love
  for each row when (old.published or new.published) execute function public.request_site_rebuild();
create trigger customer_love_delete_rebuild after delete on public.customer_love
  for each row when (old.published) execute function public.request_site_rebuild();
