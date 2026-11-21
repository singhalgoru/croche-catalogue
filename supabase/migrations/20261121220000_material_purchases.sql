create table public.material_purchases (
  id uuid primary key,
  purchased_on date not null,
  material text not null check (char_length(btrim(material)) between 1 and 150),
  supplier text not null default '' check (char_length(supplier) <= 150),
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null check (char_length(btrim(unit)) between 1 and 30),
  total numeric(12,2) not null check (total > 0),
  payment_status text not null check (payment_status in ('Paid', 'Unpaid')),
  notes text not null default '' check (char_length(notes) <= 1000),
  receipt_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index material_purchases_date_idx on public.material_purchases (purchased_on desc, id);
alter table public.material_purchases enable row level security;
create policy "Verified admins read material purchases" on public.material_purchases
  for select to authenticated using (public.is_catalogue_admin());
revoke all on public.material_purchases from public, anon, authenticated;
grant select on public.material_purchases to authenticated;

create table public.material_purchase_receipts (
  purchase_id uuid primary key references public.material_purchases(id) on delete cascade,
  content bytea not null check (octet_length(content) between 1 and 2097152),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png'))
);
alter table public.material_purchase_receipts enable row level security;
revoke all on public.material_purchase_receipts from public, anon, authenticated;

create function public.save_material_purchase(
  purchase_id uuid, purchase_date date, material_name text, supplier_name text, quantity_value numeric,
  quantity_unit text, total_value numeric, status_value text, note_text text,
  receipt_filename text default null, receipt_type text default null, receipt_data text default null,
  remove_receipt boolean default false
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare decoded bytea;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if purchase_id is null or purchase_date is null or quantity_value is null or quantity_value <= 0
    or quantity_value >= 1000000000 or scale(quantity_value) > 3 or total_value is null
    or total_value <= 0 or total_value >= 10000000000 or scale(total_value) > 2
    or status_value is null or status_value not in ('Paid','Unpaid')
    or material_name is null or char_length(btrim(material_name)) not between 1 and 150
    or quantity_unit is null or char_length(btrim(quantity_unit)) not between 1 and 30
    or supplier_name is null or char_length(supplier_name) > 150
    or note_text is null or char_length(note_text) > 1000 or remove_receipt is null then
    raise exception 'Invalid material purchase details.';
  end if;
  if receipt_data is not null then
    if remove_receipt or receipt_filename is null or char_length(btrim(receipt_filename)) not between 1 and 150
      or receipt_type is null or receipt_type not in ('application/pdf','image/jpeg','image/png')
      or length(receipt_data) > 2796204 then raise exception 'Invalid receipt.'; end if;
    decoded := decode(receipt_data, 'base64');
    if octet_length(decoded) not between 1 and 2097152
      or (receipt_type = 'application/pdf' and substring(decoded from 1 for 5) <> decode('255044462d','hex'))
      or (receipt_type = 'image/jpeg' and substring(decoded from 1 for 3) <> decode('ffd8ff','hex'))
      or (receipt_type = 'image/png' and substring(decoded from 1 for 8) <> decode('89504e470d0a1a0a','hex')) then
      raise exception 'Receipt must be a PDF, JPG or PNG up to 2 MB.';
    end if;
  elsif receipt_filename is not null or receipt_type is not null then
    raise exception 'Incomplete receipt.';
  end if;
  insert into public.material_purchases(id, purchased_on, material, supplier, quantity, unit, total, payment_status, notes, receipt_name)
  values (purchase_id, purchase_date, btrim(material_name), btrim(supplier_name), quantity_value,
    btrim(quantity_unit), total_value, status_value, btrim(note_text), receipt_filename)
  on conflict (id) do update set purchased_on=excluded.purchased_on, material=excluded.material,
    supplier=excluded.supplier, quantity=excluded.quantity, unit=excluded.unit, total=excluded.total,
    payment_status=excluded.payment_status, notes=excluded.notes, updated_at=now(),
    receipt_name=case when remove_receipt then null when receipt_data is not null then excluded.receipt_name
      else public.material_purchases.receipt_name end;
  if remove_receipt then delete from public.material_purchase_receipts where material_purchase_receipts.purchase_id = save_material_purchase.purchase_id;
  elsif receipt_data is not null then
    insert into public.material_purchase_receipts(purchase_id,content,content_type) values (purchase_id,decoded,receipt_type)
    on conflict on constraint material_purchase_receipts_pkey do update set content=excluded.content,content_type=excluded.content_type;
  end if;
  return purchase_id;
end $$;
revoke all on function public.save_material_purchase(uuid,date,text,text,numeric,text,numeric,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.save_material_purchase(uuid,date,text,text,numeric,text,numeric,text,text,text,text,text,boolean) to authenticated;

create function public.read_material_receipt(target uuid) returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  select jsonb_build_object('name', p.receipt_name, 'type', r.content_type, 'data', encode(r.content,'base64'))
    into result from public.material_purchase_receipts r join public.material_purchases p on p.id=r.purchase_id
    where r.purchase_id=target;
  if result is null then raise exception 'Receipt not found.'; end if;
  return result;
end $$;
revoke all on function public.read_material_receipt(uuid) from public,anon;
grant execute on function public.read_material_receipt(uuid) to authenticated;

create function public.delete_material_purchase(target uuid) returns uuid language plpgsql security definer set search_path=''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  delete from public.material_purchases where id=target;
  if not found then raise exception 'Purchase not found; refresh and try again.'; end if;
  return target;
end $$;
revoke all on function public.delete_material_purchase(uuid) from public,anon;
grant execute on function public.delete_material_purchase(uuid) to authenticated;
