begin;
create temporary table shared_admin_fixture as
select gen_random_uuid() admin_id, gen_random_uuid() creator_id,
  gen_random_uuid() session_id, gen_random_uuid() factor_id,
  gen_random_uuid() product_id, gen_random_uuid() variant_id;
grant select on shared_admin_fixture to authenticated;
insert into auth.users(id) select admin_id from shared_admin_fixture
union all select creator_id from shared_admin_fixture;
insert into public.catalogue_admins(user_id) select admin_id from shared_admin_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from shared_admin_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select session_id,admin_id,factor_id,'aal2',now(),now() from shared_admin_fixture;
insert into public.products(id,name,category,description,color,image_path,image_url,created_by,published,price)
select product_id,'Shared admin fixture',(select name from public.categories where not is_seasonal limit 1),
  'Shared catalogue test product.','#ffffff','fixture/'||product_id,
  'https://example.test/fixture.png',creator_id,false,100 from shared_admin_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now())))))::text,true) from shared_admin_fixture;
set local role authenticated;
do $$
declare fixture record; affected integer; gallery_id uuid:=gen_random_uuid(); saved integer;
begin
  select * into fixture from shared_admin_fixture;
  update public.products set price=120 where id=fixture.product_id;
  get diagnostics affected=row_count;
  if affected<>1 or (select price from public.products where id=fixture.product_id)<>120 then
    raise exception 'FAIL: another verified admin cannot save 100-to-120 price.';
  end if;
  if (select created_by from public.products where id=fixture.product_id)<>fixture.creator_id then
    raise exception 'FAIL: creator attribution changed.';
  end if;
  saved:=public.bulk_update_product_descriptions(jsonb_build_array(jsonb_build_object(
    'id',fixture.product_id,'description','Reviewed shared catalogue fixture.',
    'seoDescription','Reviewed fixture.','originalDescription','Shared catalogue test product.',
    'originalSeoDescription','')));
  if saved<>1 then raise exception 'FAIL: shared bulk description update.'; end if;
  begin
    perform public.bulk_update_product_descriptions(jsonb_build_array(jsonb_build_object(
      'id',fixture.product_id,'description','Stale fixture description.',
      'seoDescription','','originalDescription','Shared catalogue test product.',
      'originalSeoDescription','')));
    raise exception 'FAIL: stale bulk edit accepted.';
  exception when serialization_failure then null;
  end;
  insert into public.product_variants(id,product_id,name,color,image_path,image_url)
  values(fixture.variant_id,fixture.product_id,'Shared variant','#ffffff',
    'fixture/'||fixture.variant_id,'https://example.test/variant.png');
  update public.product_variants set price=130 where id=fixture.variant_id;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'FAIL: shared variant edit.'; end if;
  insert into public.product_variant_images(id,variant_id,image_path,image_url)
  values(gallery_id,fixture.variant_id,'fixture/'||gallery_id,'https://example.test/gallery.png');
  update public.product_variant_images set sort_order=2 where id=gallery_id;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'FAIL: shared gallery edit.'; end if;
  delete from public.product_variant_images where id=gallery_id;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'FAIL: shared gallery delete.'; end if;
  delete from public.product_variants where id=fixture.variant_id;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'FAIL: shared variant delete.'; end if;
  if not exists(select 1 from public.admin_catalogue_audit where actor_id=auth.uid()
    and table_name='products' and action='UPDATE' and new_record->>'price'='120') then
    raise exception 'FAIL: shared edit audit missing.';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1',
  'session_id',session_id)::text,true) from shared_admin_fixture;
set local role authenticated;
do $$ declare affected integer; begin
  update public.products set price=999 where id=(select product_id from shared_admin_fixture);
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: password-only admin can edit.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now()-interval '16 minutes')))))::text,true) from shared_admin_fixture;
set local role authenticated;
do $$ declare affected integer; begin
  delete from public.products where id=(select product_id from shared_admin_fixture);
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: stale MFA can delete.'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2',
  'session_id',session_id,'amr',jsonb_build_array(jsonb_build_object('method','totp',
  'timestamp',floor(extract(epoch from now())))))::text,true) from shared_admin_fixture;
update public.admin_security_settings set locked=true;
set local role authenticated;
do $$ declare affected integer; begin
  update public.products set price=999 where id=(select product_id from shared_admin_fixture);
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: emergency lock bypassed.'; end if;
end $$;
reset role;
update public.admin_security_settings set locked=false;
delete from public.catalogue_admins where user_id=(select admin_id from shared_admin_fixture);
set local role authenticated;
do $$ declare affected integer; begin
  update public.products set price=999 where id=(select product_id from shared_admin_fixture);
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'FAIL: non-admin can edit.'; end if;
end $$;
reset role;
insert into public.catalogue_admins(user_id) select admin_id from shared_admin_fixture;
set local role authenticated;
do $$ declare affected integer; begin
  delete from public.products where id=(select product_id from shared_admin_fixture);
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'FAIL: verified admin cannot delete shared product.'; end if;
end $$;
reset role;
rollback;
