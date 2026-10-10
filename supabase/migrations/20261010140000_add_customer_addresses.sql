-- Customer address book. The default address is mirrored into customer_profiles.details,
-- which checkout autofill and the welcome email already read.
create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.customer_profiles(user_id) on delete cascade,
  details jsonb not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_addresses_user_idx on public.customer_addresses(user_id, created_at);
create unique index customer_addresses_one_default on public.customer_addresses(user_id) where is_default;
alter table public.customer_addresses enable row level security;
revoke all on public.customer_addresses from anon, authenticated;
grant all on public.customer_addresses to service_role;
grant select on public.customer_addresses to authenticated;
create policy "Customers and admins can read addresses"
on public.customer_addresses for select to authenticated
using (user_id = auth.uid() or public.is_catalogue_admin());

insert into public.customer_addresses(user_id, details, is_default)
select user_id, details, true from public.customer_profiles;

create function public.clean_customer_address(address jsonb, account_email text)
returns jsonb language plpgsql immutable set search_path = ''
as $$
declare cleaned jsonb;
begin
  if address is null or jsonb_typeof(address) <> 'object' or octet_length(address::text) > 8192 then
    raise exception 'Invalid address.';
  end if;
  cleaned := jsonb_build_object(
    'name', btrim(address->>'name'), 'phone', btrim(address->>'phone'),
    'email', lower(btrim(coalesce(account_email, ''))),
    'addressLine1', btrim(address->>'addressLine1'),
    'addressLine2', btrim(coalesce(address->>'addressLine2', '')),
    'city', btrim(address->>'city'), 'state', btrim(address->>'state'),
    'pincode', btrim(address->>'pincode'));
  if coalesce(char_length(cleaned->>'name'),0) not between 1 and 80
    or coalesce(cleaned->>'phone','') !~ '^[6-9][0-9]{9}$'
    or coalesce(char_length(cleaned->>'addressLine1'),0) not between 5 and 200
    or char_length(cleaned->>'addressLine2') > 200
    or coalesce(char_length(cleaned->>'city'),0) not between 1 and 80
    or coalesce(char_length(cleaned->>'state'),0) not between 1 and 80
    or coalesce(cleaned->>'pincode','') !~ '^[1-9][0-9]{5}$' then
    raise exception 'Enter a valid name, Indian mobile number and complete address.';
  end if;
  return cleaned;
end $$;
revoke all on function public.clean_customer_address(jsonb, text) from public, anon, authenticated;

create function public.save_customer_address(address_id uuid, address jsonb, make_default boolean)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare owner_id uuid := auth.uid(); profile_email text; cleaned jsonb; saved_id uuid; is_first boolean;
begin
  select email into profile_email from public.customer_profiles where user_id = owner_id;
  if owner_id is null or profile_email is null then raise exception 'Sign in to your activated account first.'; end if;
  perform public.check_cart_write_limit(owner_id, 'write');
  cleaned := public.clean_customer_address(address, profile_email);
  if address_id is null then
    if (select count(*) from public.customer_addresses where user_id = owner_id) >= 10 then
      raise exception 'You can save up to 10 addresses. Delete one to add another.';
    end if;
    is_first := not exists(select 1 from public.customer_addresses where user_id = owner_id);
    insert into public.customer_addresses(user_id, details) values(owner_id, cleaned) returning id into saved_id;
    make_default := make_default or is_first;
  else
    update public.customer_addresses set details = cleaned, updated_at = now()
    where id = address_id and user_id = owner_id returning id into saved_id;
    if saved_id is null then raise exception 'Address not found.'; end if;
  end if;
  if make_default then
    update public.customer_addresses set is_default = false where user_id = owner_id and is_default and id <> saved_id;
    update public.customer_addresses set is_default = true where id = saved_id;
  end if;
  update public.customer_profiles p set details = a.details
  from public.customer_addresses a where p.user_id = owner_id and a.user_id = owner_id and a.is_default;
  return saved_id;
end $$;
revoke all on function public.save_customer_address(uuid, jsonb, boolean) from public, anon;
grant execute on function public.save_customer_address(uuid, jsonb, boolean) to authenticated;

create function public.delete_customer_address(address_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare owner_id uuid := auth.uid(); was_default boolean;
begin
  if owner_id is null then raise exception 'Sign in to your activated account first.'; end if;
  if (select count(*) from public.customer_addresses where user_id = owner_id) <= 1 then
    raise exception 'Keep at least one saved address. Edit it instead.';
  end if;
  delete from public.customer_addresses where id = address_id and user_id = owner_id returning is_default into was_default;
  if was_default is null then raise exception 'Address not found.'; end if;
  if was_default then
    update public.customer_addresses set is_default = true
    where id = (select id from public.customer_addresses where user_id = owner_id order by created_at limit 1);
    update public.customer_profiles p set details = a.details
    from public.customer_addresses a where p.user_id = owner_id and a.user_id = owner_id and a.is_default;
  end if;
end $$;
revoke all on function public.delete_customer_address(uuid) from public, anon;
grant execute on function public.delete_customer_address(uuid) to authenticated;

-- Activation also creates the first address-book entry from the signup details.
create or replace function public.activate_customer_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null and not coalesce(new.is_anonymous,false) then
    insert into public.customer_profiles(user_id,email,details)
    select user_id,email,details from public.pending_customer_signups
    where user_id=new.id and email=lower(new.email) and expires_at>now()
    on conflict(user_id) do nothing;
    insert into public.customer_addresses(user_id,details,is_default)
    select p.user_id,p.details,true from public.customer_profiles p
    where p.user_id=new.id and not exists(select 1 from public.customer_addresses a where a.user_id=new.id);
    insert into public.customer_welcome_emails(user_id)
    select user_id from public.customer_profiles where user_id=new.id
    on conflict(user_id) do nothing;
    delete from public.pending_customer_signups where user_id=new.id and email=lower(new.email);
  end if;
  return new;
end $$;
