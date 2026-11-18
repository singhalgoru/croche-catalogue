-- Rollback-only checks; run against a migrated TEST database. Sequence gaps are expected.
begin;
create temporary table sku_fixture as select gen_random_uuid() admin_id,gen_random_uuid() session_id,
  gen_random_uuid() factor_id,gen_random_uuid() first_id,gen_random_uuid() second_id;
grant select on sku_fixture to authenticated;
insert into auth.users(id) select admin_id from sku_fixture;
insert into public.catalogue_admins(user_id) select admin_id from sku_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
  select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from sku_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
  select session_id,admin_id,factor_id,'aal2',now(),now() from sku_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from sku_fixture;
set local role authenticated;
insert into public.products(id,name,category,description,color,image_path,image_url,created_by,published)
  select product_id,'Synthetic SKU Fixture','Toys','Synthetic test-only crochet product.','#f6c453',
    'test-sku-'||product_id||'.webp','https://example.test/sku.webp',admin_id,false
  from sku_fixture cross join lateral unnest(array[first_id,second_id]) as product_id;
do $$
declare f record; first_sku text; second_sku text;
begin
  select * into f from sku_fixture;
  select sku into first_sku from public.products where id=f.first_id;
  select sku into second_sku from public.products where id=f.second_id;
  if first_sku is null or first_sku !~ '^LUV-[0-9]{6,}$' or second_sku is null
    or first_sku=second_sku then raise exception 'FAIL: unique SKUs were not generated.'; end if;
  update public.products set name='Renamed SKU Fixture' where id=f.first_id;
  if (select sku from public.products where id=f.first_id)<>first_sku then
    raise exception 'FAIL: editing the product changed its SKU.';
  end if;
  begin
    update public.products set sku=null where id=f.first_id;
    raise exception 'FAIL: SKU could be removed.';
  exception when others then
    if sqlerrm<>'Product SKU is assigned automatically and cannot be changed.' then raise; end if;
  end;
  begin
    insert into public.products(name,category,description,color,image_path,image_url,created_by,published,sku)
      values('Manual SKU Fixture','Toys','Synthetic test-only crochet product.','#f6c453',
        'test-manual-sku-'||gen_random_uuid()||'.webp','https://example.test/sku.webp',f.admin_id,false,first_sku);
    raise exception 'FAIL: caller-supplied SKU was accepted.';
  exception when others then
    if sqlerrm<>'Do not supply a SKU; it is assigned automatically when creating a product.' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if has_sequence_privilege('authenticated','public.product_sku_sequence','USAGE')
    or has_sequence_privilege('anon','public.product_sku_sequence','USAGE')
    or has_function_privilege('authenticated','public.assign_product_sku()','EXECUTE') then
    raise exception 'FAIL: direct SKU generator access exposed.';
  end if;
end $$;
rollback;
