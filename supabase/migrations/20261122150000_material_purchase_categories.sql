alter table public.material_purchases add column category text not null default 'Uncategorized'
  check (category in ('Yarn', 'Tool', 'Accessories', 'Uncategorized'));

update public.material_purchases set category = 'Yarn'
where material ~* '\m(yarn|acrylic|chenille|wool)\M';

create function public.save_categorized_material_purchase(
  purchase_id uuid, purchase_date date, material_name text, supplier_name text, quantity_value numeric,
  quantity_unit text, total_value numeric, status_value text, note_text text, category_value text,
  receipt_filename text default null, receipt_type text default null, receipt_data text default null,
  remove_receipt boolean default false
) returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if category_value is null or category_value not in ('Yarn', 'Tool', 'Accessories', 'Uncategorized') then
    raise exception 'Invalid purchase category.';
  end if;
  perform public.save_material_purchase(purchase_id, purchase_date, material_name, supplier_name, quantity_value,
    quantity_unit, total_value, status_value, note_text, receipt_filename, receipt_type, receipt_data, remove_receipt);
  update public.material_purchases set category = category_value where id = purchase_id;
  return purchase_id;
end $$;
revoke all on function public.save_categorized_material_purchase(uuid,date,text,text,numeric,text,numeric,text,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.save_categorized_material_purchase(uuid,date,text,text,numeric,text,numeric,text,text,text,text,text,text,boolean) to authenticated;

create function public.set_material_purchase_category(target uuid, category_value text)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if category_value is null or category_value not in ('Yarn', 'Tool', 'Accessories', 'Uncategorized') then
    raise exception 'Invalid purchase category.';
  end if;
  update public.material_purchases set category = category_value, updated_at = now() where id = target;
  if not found then raise exception 'Purchase not found; refresh and try again.'; end if;
  return target;
end $$;
revoke all on function public.set_material_purchase_category(uuid,text) from public, anon;
grant execute on function public.set_material_purchase_category(uuid,text) to authenticated;
