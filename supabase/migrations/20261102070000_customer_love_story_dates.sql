-- Exposes each story's last change date so its crawlable page gets an accurate sitemap lastmod.
create or replace function public.list_customer_love(admin_view boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if admin_view and not public.is_catalogue_admin() then raise exception 'Verified admin access required.'; end if;
  return coalesce((select jsonb_agg(
    jsonb_build_object('id',t.id,'display_name',t.display_name,'quote',t.quote,
      'product_id',case when admin_view or p.published then t.product_id else null end,
      'product_ids',coalesce((select jsonb_agg(tp.product_id order by tp.product_id)
        from public.customer_love_products tp join public.products tagged on tagged.id=tp.product_id
        where tp.testimonial_id=t.id and (admin_view or tagged.published)), '[]'::jsonb),
      'has_image',case when admin_view then t.image_data is not null else t.image_url is not null end,
      'image_url',t.image_url,'image_alt',t.image_alt,
      'featured',t.featured,'sort_order',t.sort_order,
      'updated_on',to_char(t.updated_at at time zone 'UTC','YYYY-MM-DD'))
    || case when admin_view then jsonb_build_object('published',t.published,
      'consent_confirmed',t.consent_confirmed,'consent_date',t.consent_date,
      'consent_source',t.consent_source,'version',t.version) else '{}'::jsonb end
    order by t.sort_order,t.created_at,t.id)
    from public.customer_love t left join public.products p on p.id=t.product_id
    where admin_view or (t.published and t.consent_confirmed)), '[]'::jsonb);
end $$;
