alter table public.marketing_meta_creations
  add column recovery_started_at timestamptz,
  add column recovery_requested_by uuid references auth.users(id) on delete set null;
