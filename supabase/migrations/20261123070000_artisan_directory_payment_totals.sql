create or replace function public.list_artisan_applications(search_text text default '',status_filter text default '',page_number integer default 0,
  skill_filter text default '',minimum_rating integer default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare result jsonb; total_count bigint;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if search_text is null or length(search_text)>100 or skill_filter is null or length(skill_filter)>100
    or status_filter is null or status_filter not in ('','New','Contacted','Trial','More information required','Approved','Declined','Inactive')
    or page_number is null or page_number<0 or page_number>100000
    or (minimum_rating is not null and minimum_rating not between 1 and 5) then raise exception 'Check artisan filters.'; end if;
  with matches as (
    select a.* from public.artisan_applications a
    where (status_filter='' or a.status=status_filter)
      and (minimum_rating is null or a.skill_rating>=minimum_rating)
      and (skill_filter='' or strpos(lower(concat_ws(' ',a.details->>'skills',a.capabilities)),lower(btrim(skill_filter)))>0)
      and (search_text='' or strpos(lower(concat_ws(' ',a.details->>'fullName',a.details->>'mobile',a.details->>'city',
        a.details->>'state',a.details->>'skills',a.capabilities,a.contact_email)),lower(btrim(search_text)))>0)
  ), paged as (select * from matches order by created_at desc,id limit 25 offset page_number*25)
  select (select count(*) from matches),coalesce((select jsonb_agg(
    (to_jsonb(paged)-'user_id') || jsonb_build_object('total_paid',
      (select coalesce(sum(p.amount),0) from public.artisan_payments p
       where p.application_id=paged.id and p.voided_at is null))
    order by paged.created_at desc,paged.id) from paged),'[]'::jsonb)
    into total_count,result;
  return jsonb_build_object('applications',result,'total',total_count);
end $$;
