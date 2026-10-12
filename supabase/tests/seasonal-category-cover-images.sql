begin;
create temporary table cover_fixture as
select gen_random_uuid() admin_id, gen_random_uuid() session_id, gen_random_uuid() factor_id,
  'Cover test ' || gen_random_uuid()::text category_name,
  (select id from public.products where published limit 1) product_id;
grant select on cover_fixture to authenticated;
insert into auth.users(id) select admin_id from cover_fixture;
insert into public.catalogue_admins(user_id) select admin_id from cover_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from cover_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from cover_fixture;
insert into public.categories(name,is_seasonal) select category_name,true from cover_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now())))))::text,true) from cover_fixture;
set local role authenticated;
do $$
declare fixture record; previous text; image text := 'https://images.luviacreations.com/products/test-admin/test-cover.webp';
begin
  select * into fixture from cover_fixture;
  if fixture.product_id is null then raise exception 'Published product fixture required.'; end if;
  previous := public.save_seasonal_category(fixture.category_name,array[fixture.product_id],true,'Reviewed.',false,image);
  if previous <> '' or (select cover_image_url from public.categories where name=fixture.category_name) <> image then
    raise exception 'FAIL: custom cover not saved.';
  end if;
  previous := public.save_seasonal_category(fixture.category_name,array[fixture.product_id],true);
  if previous <> image or (select cover_image_url from public.categories where name=fixture.category_name) <> image then
    raise exception 'FAIL: legacy save erased cover.';
  end if;
  begin
    perform public.save_seasonal_category(fixture.category_name,array[]::uuid[],false,'',false,'https://untrusted.test/cover.webp');
    raise exception 'FAIL: invalid URL accepted.';
  exception when raise_exception then
    if sqlerrm <> 'A valid seasonal cover image URL is required.' then raise; end if;
  end;
  if (select count(*) from public.seasonal_category_products where category_name=fixture.category_name) <> 1 then
    raise exception 'FAIL: invalid cover altered membership.';
  end if;
  previous := public.save_seasonal_category(fixture.category_name,array[fixture.product_id],true,'',false,'');
  if previous <> image or (select cover_image_url from public.categories where name=fixture.category_name) <> '' then
    raise exception 'FAIL: removal did not return old cover for cleanup.';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1',
  'session_id',session_id)::text,true) from cover_fixture;
set local role authenticated;
do $$ begin
  begin
    perform public.save_seasonal_category((select category_name from cover_fixture),array[]::uuid[],true,'',false,
      'https://images.luviacreations.com/products/test-admin/test-cover.webp');
    raise exception 'FAIL: password-only admin saved cover.';
  exception when raise_exception then
    if sqlerrm <> 'Catalogue administrator access is required.' then raise; end if;
  end;
end $$;
reset role;
rollback;
