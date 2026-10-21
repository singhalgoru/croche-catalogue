alter table public.product_making_videos
  add column title text not null default ''
  check (char_length(title) <= 120 and title = btrim(title));

create function public.rename_product_video(p_product_id uuid, p_title text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_catalogue_admin() then
    raise exception 'Admin access required';
  end if;
  if p_title is null or char_length(btrim(p_title)) > 120 then
    raise exception 'Video title must be at most 120 characters.';
  end if;
  update public.product_making_videos set title = btrim(p_title)
    where product_id = p_product_id;
  if not found then
    raise exception 'No published video found. Publish a video before renaming it.';
  end if;
  update public.products set updated_at = now() where id = p_product_id;
end;
$$;

revoke all on function public.rename_product_video(uuid, text) from public, anon;
grant execute on function public.rename_product_video(uuid, text) to authenticated;
