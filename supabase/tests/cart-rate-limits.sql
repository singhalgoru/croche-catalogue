begin;
do $$
declare
  owner uuid;
  message text;
begin
  select id into owner from auth.users
    where not exists (select 1 from public.cart_session_blocks where user_id = auth.users.id)
    limit 1;
  if owner is null then raise exception 'Test requires an unblocked user.'; end if;
  insert into public.cart_write_limits (user_id, action, attempts, window_started_at)
  values (owner, 'create', 10, now() - interval '30 minutes')
  on conflict (user_id, action) do update set attempts = 10, window_started_at = excluded.window_started_at;
  begin
    perform public.check_cart_write_limit(owner, 'create');
    raise exception 'Expected creation limit.';
  exception when others then
    get stacked diagnostics message = message_text;
    if message not like 'Too many new carts created.%30 minute(s).%' then
      raise exception 'Unexpected creation error: %', message;
    end if;
  end;
  update public.cart_write_limits set window_started_at = now() - interval '61 minutes'
    where user_id = owner and action = 'create';
  perform public.check_cart_write_limit(owner, 'create');
  if not exists (select 1 from public.cart_write_limits where user_id = owner and action = 'create' and attempts = 1) then
    raise exception 'Expired creation window did not reset.';
  end if;
  insert into public.cart_write_limits (user_id, action, attempts, window_started_at)
  values (owner, 'write', 60, now() - interval '30 seconds')
  on conflict (user_id, action) do update set attempts = 60, window_started_at = excluded.window_started_at;
  begin
    perform public.check_cart_write_limit(owner, 'write');
    raise exception 'Expected write limit.';
  exception when others then
    get stacked diagnostics message = message_text;
    if message not like 'Too many cart changes.%30 second(s).%' then
      raise exception 'Unexpected write error: %', message;
    end if;
  end;
end;
$$;
rollback;
