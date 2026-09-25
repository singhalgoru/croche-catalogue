create policy "Customers can delete their own cart"
on public.carts
for delete
to authenticated
using (user_id = auth.uid());

create policy "Catalogue admins can delete carts"
on public.carts
for delete
to authenticated
using (public.is_catalogue_admin());
