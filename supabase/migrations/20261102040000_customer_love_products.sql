create table public.customer_love_products (
  testimonial_id uuid not null references public.customer_love(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key (testimonial_id, product_id)
);
alter table public.customer_love_products enable row level security;
revoke all on public.customer_love_products from public, anon, authenticated;
grant all on public.customer_love_products to service_role;
insert into public.customer_love_products(testimonial_id,product_id)
  select id,product_id from public.customer_love where product_id is not null;

create or replace function public.list_customer_love(admin_view boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if admin_view and not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  return coalesce((select jsonb_agg(
    jsonb_build_object('id',t.id,'display_name',t.display_name,'quote',t.quote,
      'product_id',case when admin_view or p.published then t.product_id else null end,
      'product_ids',coalesce((select jsonb_agg(tp.product_id order by tp.product_id)
        from public.customer_love_products tp join public.products tagged on tagged.id=tp.product_id
        where tp.testimonial_id=t.id and (admin_view or tagged.published)), '[]'::jsonb),
      'has_image',t.image_data is not null,'image_alt',t.image_alt,
      'featured',t.featured,'sort_order',t.sort_order)
    || case when admin_view then jsonb_build_object('published',t.published,
      'consent_confirmed',t.consent_confirmed,'consent_date',t.consent_date,
      'consent_source',t.consent_source,'version',t.version) else '{}'::jsonb end
    order by t.sort_order,t.created_at,t.id)
    from public.customer_love t left join public.products p on p.id=t.product_id
    where admin_view or (t.published and t.consent_confirmed)), '[]'::jsonb);
end $$;

create or replace function public.save_customer_love(testimonial_id uuid,expected_version integer,entry jsonb,photo_base64 text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare previous public.customer_love; photo bytea; consent_day date; tagged_ids uuid[];
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
  if entry ? 'product_ids' then
    if jsonb_typeof(entry->'product_ids') <> 'array' or exists (
      select 1 from jsonb_array_elements(entry->'product_ids') value where jsonb_typeof(value) <> 'string'
    ) then raise exception 'Related products must be an array of product IDs.'; end if;
    select coalesce(array_agg(distinct value::uuid), '{}'::uuid[]) into tagged_ids
      from jsonb_array_elements_text(entry->'product_ids') value;
  elsif nullif(entry->>'product_id','')::uuid is not distinct from previous.product_id and previous.id is not null then
    -- Older open editors must not erase additional tags when saving unchanged content.
    select coalesce(array_agg(product_id order by product_id), '{}'::uuid[]) into tagged_ids
      from public.customer_love_products where customer_love_products.testimonial_id=save_customer_love.testimonial_id;
  else
    tagged_ids := array_remove(array[nullif(entry->>'product_id','')::uuid],null);
  end if;
  if exists(select 1 from unnest(tagged_ids) tagged(id) where not exists(select 1 from public.products p where p.id=tagged.id)) then
    raise exception 'A related product no longer exists. Reload before saving.';
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
  values(testimonial_id,btrim(entry->>'display_name'),btrim(entry->>'quote'),tagged_ids[1],
    photo,btrim(coalesce(entry->>'image_alt','')),(entry->>'consent_confirmed')::boolean,
    consent_day,btrim(coalesce(entry->>'consent_source','')),(entry->>'published')::boolean,
    (entry->>'featured')::boolean,(entry->>'sort_order')::integer)
  on conflict(id) do update set display_name=excluded.display_name,quote=excluded.quote,product_id=excluded.product_id,
    image_data=excluded.image_data,image_alt=excluded.image_alt,consent_confirmed=excluded.consent_confirmed,
    consent_date=excluded.consent_date,consent_source=excluded.consent_source,published=excluded.published,
    featured=excluded.featured,sort_order=excluded.sort_order,version=customer_love.version+1,updated_at=now();
  delete from public.customer_love_products tp where tp.testimonial_id=save_customer_love.testimonial_id;
  insert into public.customer_love_products(testimonial_id,product_id)
    select save_customer_love.testimonial_id,unnest(tagged_ids);
  return testimonial_id;
end $$;
