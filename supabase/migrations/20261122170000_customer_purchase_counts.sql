create table public.customer_purchase_exclusions (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.customer_purchase_exclusions enable row level security;
revoke all on public.customer_purchase_exclusions from public, anon, authenticated;
grant all on public.customer_purchase_exclusions to service_role;

create function public.set_customer_purchase_exclusion(target uuid, excluded boolean)
returns uuid language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if target is null or excluded is null or not (
    exists(select 1 from public.customer_profiles where user_id = target)
    or exists(select 1 from public.pending_customer_signups where user_id = target and expires_at > now())
  ) then raise exception 'Customer not found; refresh and try again.'; end if;
  if excluded then
    insert into public.customer_purchase_exclusions(user_id) values (target) on conflict do nothing;
  else
    delete from public.customer_purchase_exclusions where user_id = target;
  end if;
  return target;
end $$;
revoke all on function public.set_customer_purchase_exclusion(uuid,boolean) from public, anon;
grant execute on function public.set_customer_purchase_exclusion(uuid,boolean) to authenticated;

create or replace function public.get_admin_customer_summary(page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_catalogue_admin() then raise exception 'Only catalogue admins can view registered customers.'; end if;
  if page_offset is null or page_offset < 0 then raise exception 'Invalid customer page.'; end if;
  with customers as (
    select u.id, coalesce(p.email, s.email) as email, coalesce(p.details, s.details) as details,
      coalesce(p.activated_at, s.submitted_at) as registered_at,
      case when p.activated_at is not null and u.last_sign_in_at >= p.activated_at
        and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
        then u.last_sign_in_at end as last_sign_in_at,
      (u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)) as verified,
      coalesce(u.banned_until > now(), false) as suspended,
      not exists(select 1 from public.catalogue_admins where user_id = u.id) as can_manage_account,
      w.sent_at as welcome_sent_at,
      case when w.sent_at is not null then 'sent' when w.last_error is not null then 'retrying'
        when w.user_id is not null then 'pending' else 'not_queued' end as welcome_status,
      x.user_id is not null as purchase_excluded,
      (select count(*) from public.payment_orders o
        where not o.is_test_checkout and o.status = 'paid' and o.paid_at is not null
          and (o.customer_user_id = u.id
            or (o.customer_user_id is null and u.email_confirmed_at is not null
              and not coalesce(u.is_anonymous, false) and lower(o.customer_email) = lower(u.email)))) as purchase_count
    from auth.users u
    left join public.customer_profiles p on p.user_id = u.id
    left join public.pending_customer_signups s on s.user_id = u.id and s.expires_at > now()
    left join public.customer_welcome_emails w on w.user_id = u.id
    left join public.customer_purchase_exclusions x on x.user_id = u.id
    where p.user_id is not null or s.user_id is not null
  ), page as (
    select * from customers order by registered_at desc, id desc limit 50 offset page_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from customers), 'verified', (select count(*) from customers where verified),
    'pendingActivation', (select count(*) from customers where not verified),
    'welcomeEmailsSent', (select count(*) from customers where welcome_sent_at is not null),
    'totalPurchases', (select coalesce(sum(purchase_count), 0) from customers where not purchase_excluded),
    'customers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'email', email, 'name', details->>'name', 'phone', details->>'phone',
      'city', details->>'city', 'pincode', details->>'pincode', 'registeredAt', registered_at,
      'lastSignInAt', last_sign_in_at, 'verified', verified, 'welcomeStatus', welcome_status,
      'suspended', suspended, 'canManageAccount', can_manage_account,
      'purchaseExcluded', purchase_excluded, 'purchaseCount', case when purchase_excluded then null else purchase_count end
    ) order by registered_at desc, id desc) from page), '[]'::jsonb)
  ) into result;
  return result;
end $$;
