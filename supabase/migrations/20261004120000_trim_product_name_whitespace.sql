update public.products
set name = btrim(name)
where name <> btrim(name);
