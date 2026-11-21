create function public.artisan_payment_summary(payment_month date)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if payment_month is null or payment_month <> date_trunc('month', payment_month)::date then
    raise exception 'Select the first day of a payment month.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'artisanId', grouped.application_id,
    'name', grouped.name,
    'amount', grouped.amount,
    'count', grouped.payment_count,
    'latestDate', grouped.latest_date
  ) order by grouped.name, grouped.application_id), '[]'::jsonb)
  into result
  from (
    select p.application_id, a.details->>'fullName' as name,
      sum(p.amount) as amount, count(*) as payment_count, max(p.paid_on) as latest_date
    from public.artisan_payments p
    join public.artisan_applications a on a.id=p.application_id
    where p.voided_at is null and p.paid_on >= payment_month
      and p.paid_on < (payment_month + interval '1 month')::date
    group by p.application_id, a.details->>'fullName'
  ) grouped;
  return result;
end;
$$;
revoke all on function public.artisan_payment_summary(date) from public,anon;
grant execute on function public.artisan_payment_summary(date) to authenticated;
