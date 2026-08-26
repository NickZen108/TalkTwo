-- Keep the denormalized user_plans projection consistent with verified store
-- lifecycle state. A normal cancellation preserves access through the paid
-- period, but provider on-hold/pause means this subscription is not currently
-- an active entitlement and must stop contributing immediately.

create or replace function public.cancel_premium_store_subscription(
  provider_platform text,
  provider_original_transaction text,
  hold_status text default 'cancel_at_period_end'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription public.premium_store_subscriptions%rowtype;
  member_record record;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if hold_status not in ('cancel_at_period_end', 'on_hold') then
    raise exception 'Unsupported Premium hold status';
  end if;

  select * into subscription
    from public.premium_store_subscriptions
   where platform = provider_platform
     and provider_original_transaction_id = trim(provider_original_transaction)
   for update;
  if not found or subscription.status in ('expired', 'revoked') then
    return false;
  end if;

  update public.premium_store_subscriptions
     set status = hold_status, auto_renew = false, updated_at = pg_catalog.now()
   where id = subscription.id;

  if hold_status = 'on_hold' then
    for member_record in
      select user_id
        from public.premium_store_subscription_members
       where subscription_id = subscription.id
    loop
      -- Pass the removed period end so sync_store_premium_user_plan does not
      -- preserve this same now-suspended entitlement as a generic legacy end.
      -- A genuinely later gift/legacy/other-store entitlement still survives.
      perform public.sync_store_premium_user_plan(
        member_record.user_id,
        subscription.current_period_end
      );
    end loop;
  end if;

  return true;
end;
$$;

revoke execute on function public.cancel_premium_store_subscription(text, text, text)
  from public, anon, authenticated;
grant execute on function public.cancel_premium_store_subscription(text, text, text)
  to service_role;
