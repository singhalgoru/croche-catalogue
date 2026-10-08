create table public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null check (char_length(btrim(description)) between 1 and 150),
  expense_date date not null default current_date,
  category text not null check (category in ('Advertising', 'Tools & equipment', 'Subscriptions', 'Rent & utilities', 'Travel', 'Other')),
  amount numeric(12, 2) not null check (amount > 0 and amount < 10000000000),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index business_expenses_date_idx on public.business_expenses (expense_date desc, id);
alter table public.business_expenses enable row level security;

create policy "Catalogue admins can read business expenses"
on public.business_expenses for select to authenticated
using (public.is_catalogue_admin());

create policy "Catalogue admins can create business expenses"
on public.business_expenses for insert to authenticated
with check (public.is_catalogue_admin());

create policy "Catalogue admins can update business expenses"
on public.business_expenses for update to authenticated
using (public.is_catalogue_admin())
with check (public.is_catalogue_admin());

create policy "Catalogue admins can delete business expenses"
on public.business_expenses for delete to authenticated
using (public.is_catalogue_admin());
