create table public.product_reference_videos (
  product_id uuid primary key references public.products(id) on delete cascade,
  video_url text not null check (
    length(video_url) between 9 and 2048
    and video_url ~ '^https://[^/?#@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$'
  ),
  updated_at timestamptz not null default now()
);

alter table public.product_reference_videos enable row level security;
revoke all on public.product_reference_videos from public, anon, authenticated;
grant all on public.product_reference_videos to service_role;

create function public.read_product_reference_video(target_product uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  if not exists (select 1 from public.products where id = target_product) then
    raise exception 'Product not found.';
  end if;
  return (select video_url from public.product_reference_videos where product_id = target_product);
end $$;

create function public.save_product_reference_video(target_product uuid, expected_url text, new_url text)
returns text language plpgsql security definer set search_path = ''
as $$
declare existing_url text;
begin
  if not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  perform 1 from public.products where id = target_product for update;
  if not found then raise exception 'Product not found.'; end if;
  select video_url into existing_url from public.product_reference_videos where product_id = target_product;
  if existing_url is distinct from expected_url then
    raise exception 'Reference video changed. Refresh before saving.';
  end if;
  if new_url is null then
    delete from public.product_reference_videos where product_id = target_product;
  else
    if length(new_url) not between 9 and 2048
      or new_url !~ '^https://[^/?#@[:space:][:cntrl:]]+([/?#][^[:space:][:cntrl:]]*)?$' then
      raise exception 'Enter a valid HTTPS link without embedded credentials.';
    end if;
    insert into public.product_reference_videos(product_id, video_url) values (target_product, new_url)
    on conflict (product_id) do update set video_url = excluded.video_url, updated_at = now();
  end if;
  return new_url;
end $$;

revoke all on function public.read_product_reference_video(uuid) from public, anon, authenticated;
revoke all on function public.save_product_reference_video(uuid, text, text) from public, anon, authenticated;
grant execute on function public.read_product_reference_video(uuid) to authenticated;
grant execute on function public.save_product_reference_video(uuid, text, text) to authenticated;
