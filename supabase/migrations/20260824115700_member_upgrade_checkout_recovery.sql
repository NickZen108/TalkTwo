-- Client-safe preflight for subscription replacement plus a narrow way to unwind
-- a checkout that never reached the store. Never expose provider purchase tokens
-- to the authenticated client.

create or replace function public.get_my_member_upgrade_store_context()
returns table(payment_provider text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.payment_provider
    from public.extra_member_access_subscriptions s
   where s.user_id=(select auth.uid())
     and s.access_role='observer'
     and s.status in ('active','cancel_at_period_end')
     and s.current_period_end>pg_catalog.now()
     and s.payment_provider in ('apple','google')
   limit 1;
$$;

create or replace function public.cancel_my_billing_checkout_intent(intent_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  intent public.billing_checkout_intents%rowtype;
  changed integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into intent
    from public.billing_checkout_intents i
   where i.id=intent_id and i.user_id=uid
   for update;
  if not found then return false; end if;

  -- provider_ready is only set inside the verified store-processing transaction.
  -- Once that state exists the user may not unwind the intent independently.
  update public.billing_checkout_intents
     set status='cancelled',updated_at=pg_catalog.now()
   where id=intent.id and status='created' and completed_at is null;
  get diagnostics changed=row_count;
  if changed<>1 then return false; end if;

  if intent.upgrade_request_id is not null then
    update public.member_write_upgrade_requests
       set status='awaiting_payment'
     where id=intent.upgrade_request_id
       and member_user_id=uid
       and status='checkout_pending'
       and expires_at>pg_catalog.now();
  end if;
  return true;
end;
$$;

revoke execute on function public.get_my_member_upgrade_store_context() from public,anon;
revoke execute on function public.cancel_my_billing_checkout_intent(uuid) from public,anon;
grant execute on function public.get_my_member_upgrade_store_context() to authenticated;
grant execute on function public.cancel_my_billing_checkout_intent(uuid) to authenticated;
