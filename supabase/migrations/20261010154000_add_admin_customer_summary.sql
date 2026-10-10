create function public.get_admin_customer_summary(page_offset integer default 0)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Only catalogue admins can view registered customers.'; end if;
  if page_offset is null or page_offset < 0 then raise exception 'Invalid customer page.'; end if;
  with customers as (
    select u.id, coalesce(p.email, s.email) as email, coalesce(p.details, s.details) as details,
      coalesce(p.activated_at, u.created_at) as registered_at, u.last_sign_in_at,
      (u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)) as verified,
      w.sent_at as welcome_sent_at,
      case when w.sent_at is not null then 'sent'
        when w.last_error is not null then 'retrying'
        when w.user_id is not null then 'pending' else 'not_queued' end as welcome_status
    from auth.users u
    left join public.customer_profiles p on p.user_id = u.id
    left join public.pending_customer_signups s on s.user_id = u.id and s.expires_at > now()
    left join public.customer_welcome_emails w on w.user_id = u.id
    where p.user_id is not null or s.user_id is not null
  ), page as (
    select * from customers order by registered_at desc, id desc limit 50 offset page_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from customers),
    'verified', (select count(*) from customers where verified),
    'pendingActivation', (select count(*) from customers where not verified),
    'welcomeEmailsSent', (select count(*) from customers where welcome_sent_at is not null),
    'customers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'email', email, 'name', details->>'name', 'phone', details->>'phone',
      'city', details->>'city', 'pincode', details->>'pincode', 'registeredAt', registered_at,
      'lastSignInAt', last_sign_in_at, 'verified', verified, 'welcomeStatus', welcome_status
    ) order by registered_at desc, id desc) from page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_admin_customer_summary(integer) from public, anon;
grant execute on function public.get_admin_customer_summary(integer) to authenticated;
