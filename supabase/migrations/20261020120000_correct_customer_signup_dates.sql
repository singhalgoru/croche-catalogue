alter table public.pending_customer_signups
  add column submitted_at timestamptz;

-- Existing signup requests always expire 24 hours after their last submission.
update public.pending_customer_signups set submitted_at = expires_at - interval '24 hours';
alter table public.pending_customer_signups alter column submitted_at set default now();
alter table public.pending_customer_signups alter column submitted_at set not null;

create or replace function public.stage_customer_signup(signup_details jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare owner_id uuid := auth.uid(); cleaned jsonb;
begin
  if owner_id is null or not exists(select 1 from auth.users where id=owner_id and is_anonymous) then
    raise exception 'An anonymous signup session is required.';
  end if;
  perform public.check_cart_write_limit(owner_id, 'write');
  if signup_details is null or jsonb_typeof(signup_details)<>'object'
    or octet_length(signup_details::text)>8192 then raise exception 'Invalid signup details.'; end if;
  cleaned := jsonb_build_object(
    'name',btrim(signup_details->>'name'),'phone',btrim(signup_details->>'phone'),
    'email',lower(btrim(signup_details->>'email')),
    'addressLine1',btrim(signup_details->>'addressLine1'),
    'addressLine2',btrim(coalesce(signup_details->>'addressLine2','')),
    'city',btrim(signup_details->>'city'),'state',btrim(signup_details->>'state'),
    'pincode',btrim(signup_details->>'pincode'));
  if coalesce(char_length(cleaned->>'name'),0) not between 1 and 80
    or coalesce(cleaned->>'phone','') !~ '^[6-9][0-9]{9}$'
    or coalesce(cleaned->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(cleaned->>'email')>254
    or coalesce(char_length(cleaned->>'addressLine1'),0) not between 5 and 200
    or char_length(cleaned->>'addressLine2')>200
    or coalesce(char_length(cleaned->>'city'),0) not between 1 and 80
    or coalesce(char_length(cleaned->>'state'),0) not between 1 and 80
    or coalesce(cleaned->>'pincode','') !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid name, email, Indian mobile number and complete address.';
  end if;
  insert into public.pending_customer_signups(user_id,email,details,expires_at,submitted_at)
  values(owner_id,cleaned->>'email',cleaned,now()+interval '24 hours',now())
  on conflict(user_id) do update set email=excluded.email,details=excluded.details,
    expires_at=excluded.expires_at,submitted_at=excluded.submitted_at;
end $$;

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
    'total', (select count(*) from customers), 'verified', (select count(*) from customers where verified),
    'pendingActivation', (select count(*) from customers where not verified),
    'welcomeEmailsSent', (select count(*) from customers where welcome_sent_at is not null),
    'customers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'email', email, 'name', details->>'name', 'phone', details->>'phone',
      'city', details->>'city', 'pincode', details->>'pincode', 'registeredAt', registered_at,
      'lastSignInAt', last_sign_in_at, 'verified', verified, 'welcomeStatus', welcome_status,
      'suspended', suspended, 'canManageAccount', can_manage_account
    ) order by registered_at desc, id desc) from page), '[]'::jsonb)
  ) into result;
  return result;
end $$;
