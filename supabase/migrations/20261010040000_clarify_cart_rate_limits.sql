create or replace function public.check_cart_write_limit(owner_id uuid, action_name text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  current_attempts integer;
  started_at timestamptz;
  remaining_seconds integer;
  window_length interval := case when action_name = 'create' then interval '1 hour' else interval '1 minute' end;
  maximum_attempts integer := case when action_name = 'create' then 10 else 60 end;
begin
  if exists (select 1 from public.cart_session_blocks where user_id = owner_id) then
    raise exception 'This cart session has been blocked. Please contact Luvia if you think this is a mistake.';
  end if;
  insert into public.cart_write_limits as limits (user_id, action)
  values (owner_id, action_name)
  on conflict (user_id, action) do update set
    attempts = case when limits.window_started_at <= now() - window_length then 1 else limits.attempts + 1 end,
    window_started_at = case when limits.window_started_at <= now() - window_length then now() else limits.window_started_at end
  returning attempts, window_started_at into current_attempts, started_at;
  if current_attempts > maximum_attempts then
    remaining_seconds := greatest(1, ceil(extract(epoch from started_at + window_length - now()))::integer);
    if action_name = 'create' then
      raise exception 'Too many new carts created. Please try again in about % minute(s).',
        ceil(remaining_seconds / 60.0)::integer;
    else
      raise exception 'Too many cart changes. Please try again in about % second(s).', remaining_seconds;
    end if;
  end if;
end;
$$;
