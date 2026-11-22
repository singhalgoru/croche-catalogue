begin;
create temporary table material_fixture as select gen_random_uuid() admin_id, gen_random_uuid() session_id,
  gen_random_uuid() factor_id, gen_random_uuid() purchase_id;
grant select on material_fixture to authenticated, anon;
insert into auth.users(id) select admin_id from material_fixture;
insert into public.catalogue_admins(user_id) select admin_id from material_fixture;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at,secret)
  select factor_id,admin_id,'totp','verified',now(),now(),'fixture' from material_fixture;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
  select session_id,admin_id,factor_id,'aal2',now(),now() from material_fixture;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from material_fixture;
set local role authenticated;
do $$ declare v_id uuid; result jsonb; begin
  select purchase_id into v_id from material_fixture;
  if public.save_material_purchase(v_id,'2026-11-01','Yarn','Supplier',2,'balls',120.50,'Unpaid','', 'receipt.pdf',
    'application/pdf',encode(convert_to('%PDF-fixture','UTF8'),'base64'),false) <> v_id then raise exception 'FAIL: save'; end if;
  result := public.read_material_receipt(v_id);
  if result->>'name' <> 'receipt.pdf' or result->>'type' <> 'application/pdf'
    or decode(result->>'data','base64') <> convert_to('%PDF-fixture','UTF8') then raise exception 'FAIL: receipt'; end if;
  perform public.save_material_purchase(v_id,'2026-11-01','Yarn','Supplier',3,'balls',125,'Paid','corrected');
  perform public.set_material_purchase_category(v_id,'Tool');
  if (select category from public.material_purchases where id = v_id) <> 'Tool' then raise exception 'FAIL: category update'; end if;
  perform public.save_categorized_material_purchase(v_id,'2026-11-01','Yarn','Supplier',3,'balls',125,'Paid','corrected','Yarn');
  if (select category from public.material_purchases where id = v_id) <> 'Yarn' then raise exception 'FAIL: category save'; end if;
  perform public.set_material_purchase_category(v_id,'Packaging');
  if (select category from public.material_purchases where id = v_id) <> 'Packaging' then raise exception 'FAIL: packaging category update'; end if;
  perform public.save_categorized_material_purchase(v_id,'2026-11-01','Yarn','Supplier',3,'balls',125,'Paid','corrected','Packaging');
  if (select category from public.material_purchases where id = v_id) <> 'Packaging' then raise exception 'FAIL: packaging category save'; end if;
  perform public.save_categorized_material_purchase(v_id,'2026-11-01','Yarn','Supplier',3,'balls',125,'Paid','corrected','Uncategorized');
  if (select category from public.material_purchases where id = v_id) <> 'Uncategorized' then raise exception 'FAIL: existing uncategorized edit'; end if;
  begin
    perform public.save_categorized_material_purchase(gen_random_uuid(),'2026-11-01','Hook','',1,'piece',1,'Paid','','Uncategorized');
    raise exception 'FAIL: new uncategorized purchase accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.set_material_purchase_category(v_id,'Unknown');
    raise exception 'FAIL: invalid category accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  if not exists(select 1 from public.material_purchases where material_purchases.id=v_id and quantity=3 and payment_status='Paid'
    and receipt_name='receipt.pdf') then raise exception 'FAIL: edit or receipt preservation'; end if;
  begin
    perform public.save_material_purchase(v_id,'2026-11-01','Yarn','',1,'balls',1,'Paid','','bad.pdf','application/pdf',
      encode(convert_to('not pdf','UTF8'),'base64'),false);
    raise exception 'FAIL: invalid receipt accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform public.save_material_purchase(v_id,'2026-11-01','Yarn','',0,'balls',1,'Paid','');
    raise exception 'FAIL: zero quantity accepted';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform 1 from public.material_purchase_receipts;
    raise exception 'FAIL: direct receipt access';
  exception when insufficient_privilege then null; end;
  perform public.save_material_purchase(v_id,'2026-11-01','Yarn','',1,'balls',1,'Paid','', 'receipt.png',
    'image/png',encode(decode('89504e470d0a1a0a','hex'),'base64'),false);
  if public.read_material_receipt(v_id)->>'type' <> 'image/png' then raise exception 'FAIL: receipt replacement'; end if;
  begin
    update public.material_purchases set total=999 where material_purchases.id=v_id;
    raise exception 'FAIL: direct write accepted';
  exception when insufficient_privilege then null; end;
  perform public.save_material_purchase(v_id,'2026-11-01','Yarn','',1,'balls',1,'Paid','',null,null,null,true);
  if (select receipt_name from public.material_purchases where material_purchases.id=v_id) is not null then
    raise exception 'FAIL: receipt removal'; end if;
  begin perform public.read_material_receipt(v_id); raise exception 'FAIL: removed receipt accessible';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal1','session_id',session_id)::text,true) from material_fixture;
do $$ declare v_id uuid; begin
  select purchase_id into v_id from material_fixture;
  if exists(select 1 from public.material_purchases) then raise exception 'FAIL: unverified read'; end if;
  begin perform public.delete_material_purchase(v_id); raise exception 'FAIL: unverified delete';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.set_material_purchase_category(v_id,'Tool'); raise exception 'FAIL: unverified category update';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.save_material_purchase(v_id,'2026-11-01','Yarn','',1,'balls',1,'Paid','');
    raise exception 'FAIL: unverified save';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin perform public.read_material_receipt(v_id); raise exception 'FAIL: unverified receipt read';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from material_fixture;
do $$ begin
  if exists(select 1 from public.material_purchases) then raise exception 'FAIL: non-admin read'; end if;
  begin perform public.read_material_receipt((select purchase_id from material_fixture));
    raise exception 'FAIL: non-admin receipt read';
  exception when others then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.material_purchases; raise exception 'FAIL: anonymous read';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_material_purchase((select purchase_id from material_fixture));
    raise exception 'FAIL: anonymous delete';
  exception when insufficient_privilege then null; end;
  begin perform public.read_material_receipt((select purchase_id from material_fixture));
    raise exception 'FAIL: anonymous receipt read';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2','session_id',session_id,
  'amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from now())))))::text,true) from material_fixture;
set local role authenticated;
do $$ declare v_id uuid; begin
  select purchase_id into v_id from material_fixture;
  perform public.save_material_purchase(v_id,'2026-11-01','Yarn','',1,'balls',1,'Paid','', 'receipt.pdf',
    'application/pdf',encode(convert_to('%PDF-fixture','UTF8'),'base64'),false);
  if public.delete_material_purchase(v_id) <> v_id then raise exception 'FAIL: deletion receipt'; end if;
  if exists(select 1 from public.material_purchases where material_purchases.id=v_id) then raise exception 'FAIL: deletion'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.material_purchase_receipts where purchase_id=(select purchase_id from material_fixture))
    then raise exception 'FAIL: receipt not cascaded'; end if;
end $$;
rollback;
