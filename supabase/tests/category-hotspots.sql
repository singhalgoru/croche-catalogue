begin;
create temporary table hotspot_fixture as
select gen_random_uuid() admin_id, gen_random_uuid() session_id, gen_random_uuid() factor_id,
  'Look regular ' || gen_random_uuid()::text regular_name,
  'Look seasonal ' || gen_random_uuid()::text seasonal_name,
  (select id from public.products where published limit 1) product_id,
  (select category from public.products where published limit 1) original_category;
grant select on hotspot_fixture to authenticated;
insert into auth.users(id) select admin_id from hotspot_fixture;
insert into public.catalogue_admins(user_id) select admin_id from hotspot_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from hotspot_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from hotspot_fixture;
insert into public.categories(name,is_seasonal)
select regular_name,false from hotspot_fixture union all select seasonal_name,true from hotspot_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now())))))::text,true) from hotspot_fixture;
set local role authenticated;
do $$
declare fixture record; previous text;
  image text := 'https://images.luviacreations.com/products/test-admin/hotspot-cover.webp';
  spots jsonb;
begin
  select * into fixture from hotspot_fixture;
  if fixture.product_id is null then raise exception 'Published product fixture required.'; end if;
  spots := jsonb_build_array(jsonb_build_object('productId',fixture.product_id,'x',25.5,'y',75));
  update public.products set category=fixture.regular_name where id=fixture.product_id;
  previous := public.save_category_content(fixture.regular_name,'Reviewed.',image,spots);
  if previous <> '' or (select image_hotspots from public.categories where name=fixture.regular_name) <> spots then
    raise exception 'FAIL: regular category cover/hotspots not saved.';
  end if;
  perform public.save_category_content(fixture.seasonal_name,'Seasonal.',image,spots,array[fixture.product_id],true,false);
  if (select image_hotspots from public.categories where name=fixture.seasonal_name) <> spots then
    raise exception 'FAIL: seasonal hotspot membership was not saved atomically.';
  end if;
  begin
    perform public.save_category_content(fixture.seasonal_name,'Changed.',image,spots,array[]::uuid[],false,false);
    raise exception 'FAIL: hotspot for removed member accepted.';
  exception when raise_exception then
    if sqlerrm <> 'Hotspots must link to published products in this category.' then raise; end if;
  end;
  if (select count(*) from public.seasonal_category_products where category_name=fixture.seasonal_name) <> 1 then
    raise exception 'FAIL: invalid hotspot changed membership.';
  end if;
  begin
    perform public.save_category_content(fixture.regular_name,'',image,
      jsonb_build_array(jsonb_build_object('productId',fixture.product_id,'x',101,'y',50)));
    raise exception 'FAIL: invalid coordinates accepted.';
  exception when raise_exception then
    if sqlerrm <> 'Hotspot coordinates must be between 0 and 100.' then raise; end if;
  end;
  begin
    perform public.save_category_content(fixture.regular_name,'','',spots);
    raise exception 'FAIL: hotspots without image accepted.';
  exception when raise_exception then
    if sqlerrm <> 'Upload a category image before adding hotspots.' then raise; end if;
  end;
  begin
    perform public.save_category_content(fixture.regular_name,'',image,
      (select jsonb_agg(spots->0) from generate_series(1,7)));
    raise exception 'FAIL: seven hotspots accepted.';
  exception when raise_exception then
    if sqlerrm <> 'Use up to six product hotspots.' then raise; end if;
  end;
  update public.products set published=false where id=fixture.product_id;
  begin
    perform public.save_category_content(fixture.regular_name,'',image,spots);
    raise exception 'FAIL: unpublished product accepted.';
  exception when raise_exception then
    if sqlerrm <> 'Hotspots must link to published products in this category.' then raise; end if;
  end;
  update public.products set published=true where id=fixture.product_id;
  perform public.save_category_content(fixture.regular_name,'',
    'https://images.luviacreations.com/products/test-admin/replacement-cover.webp',spots);
  if (select image_hotspots from public.categories where name=fixture.regular_name) <> spots then
    raise exception 'FAIL: explicitly re-authored positions were cleared on a new photo.';
  end if;
  perform public.save_category_content(fixture.regular_name,'',image,spots);
  perform public.save_seasonal_category(fixture.seasonal_name,array[fixture.product_id],true,'',false,
    'https://images.luviacreations.com/products/test-admin/replacement-cover.webp');
  if (select image_hotspots from public.categories where name=fixture.seasonal_name) <> '[]'::jsonb then
    raise exception 'FAIL: legacy photo replacement retained old positions.';
  end if;
  previous := public.save_category_content(fixture.regular_name,'','', '[]'::jsonb);
  if previous <> image or (select cover_image_url from public.categories where name=fixture.regular_name) <> '' then
    raise exception 'FAIL: cover removal did not return old image.';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1',
  'session_id',session_id)::text,true) from hotspot_fixture;
set local role authenticated;
do $$ begin
  begin
    perform public.save_category_content((select regular_name from hotspot_fixture),'','', '[]'::jsonb);
    raise exception 'FAIL: password-only admin saved hotspots.';
  exception when raise_exception then
    if sqlerrm <> 'Catalogue administrator access is required.' then raise; end if;
  end;
end $$;
reset role;
rollback;
