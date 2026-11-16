create table public.meta_marketing_credential (
  id boolean primary key default true check (id),
  ciphertext text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.meta_marketing_credential enable row level security;
revoke all on public.meta_marketing_credential from public, anon, authenticated;
grant select, insert, update, delete on public.meta_marketing_credential to service_role;
