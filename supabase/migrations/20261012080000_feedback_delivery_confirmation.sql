create or replace function public.dispatch_store_feedback()
returns void language plpgsql security definer set search_path=''
as $$
declare worker_secret text;
begin
  if not exists(select 1 from public.store_feedback where accepted_at is null and next_attempt_at<=now() and attempts<8) then return; end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name='customer_welcome_worker_secret';
  if worker_secret is null then raise log 'Feedback worker secret missing; submissions remain queued.'; return; end if;
  perform net.http_post(url:='https://bblsjcjypdxntzlszliy.supabase.co/functions/v1/feedback-worker',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=90000);
end $$;

create function public.dispatch_new_store_feedback()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.dispatch_store_feedback();
  return new;
end $$;
revoke all on function public.dispatch_new_store_feedback() from public,anon,authenticated;
create trigger dispatch_new_store_feedback after insert on public.store_feedback
for each statement execute function public.dispatch_new_store_feedback();

create function public.store_feedback_delivery_status(request_id uuid)
returns text language plpgsql security definer set search_path=''
as $$
declare feedback public.store_feedback;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then raise exception 'Feedback session required.'; end if;
  select * into feedback from public.store_feedback where id=request_id and user_id=auth.uid();
  if not found then raise exception 'Feedback receipt not found.'; end if;
  if feedback.accepted_at is not null and feedback.provider_id is not null then return 'sent'; end if;
  if feedback.last_error is not null or feedback.attempts>=8 then return 'failed'; end if;
  return 'pending';
end $$;
revoke all on function public.store_feedback_delivery_status(uuid) from public,anon;
grant execute on function public.store_feedback_delivery_status(uuid) to authenticated;
