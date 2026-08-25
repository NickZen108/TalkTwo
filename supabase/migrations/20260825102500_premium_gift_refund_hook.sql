-- Wrap the ordered verified-store processor so one-time Premium gift refunds are
-- applied transactionally without duplicating the large lifecycle processor.
-- The inner v31 processor still owns provider-event idempotency and audit storage;
-- this wrapper adds only source-specific gift revocation.

alter function public.process_verified_store_notification(
  text,text,text,text,text,text,text,uuid,uuid,
  timestamptz,timestamptz,timestamptz,jsonb
) rename to process_verified_store_notification_ordered_v31;

revoke execute on function public.process_verified_store_notification_ordered_v31(
  text,text,text,text,text,text,text,uuid,uuid,
  timestamptz,timestamptz,timestamptz,jsonb
) from public,anon,authenticated,service_role;

create or replace function public.process_verified_store_notification(
  p_platform text,
  p_provider_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_product_id text default null,
  p_provider_transaction_id text default null,
  p_provider_original_transaction_id text default null,
  p_user_id uuid default null,
  p_checkout_intent_id uuid default null,
  p_occurred_at timestamptz default null,
  p_period_start timestamptz default null,
  p_expires_at timestamptz default null,
  p_verified_metadata jsonb default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_gift_refund boolean:=false;
  normalized_transaction text:=nullif(trim(coalesce(p_provider_transaction_id,'')),'');
  normalized_original text:=nullif(trim(coalesce(p_provider_original_transaction_id,'')),'');
  inner_result text;
  refunded boolean:=false;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Service role required';
  end if;

  if p_event_type in ('refund','revocation')
     and p_product_id is not null then
    select exists(
      select 1 from public.store_product_catalog c
       where c.platform=p_platform
         and c.product_id=trim(p_product_id)
         and c.billing_intent_kind='premium_gift'
         and c.purchase_kind='one_time'
         and c.active
    ) into is_gift_refund;
  end if;

  if is_gift_refund and normalized_transaction is null then
    raise exception 'Verified Premium gift refund transaction required';
  end if;

  -- The inner historic subscription branch expects an original id for every
  -- refund. A one-time gift may not have a distinct original transaction, so use
  -- its verified transaction id only as a non-authoritative compatibility value.
  inner_result:=public.process_verified_store_notification_ordered_v31(
    p_platform,p_provider_event_id,p_event_type,p_payload_sha256,p_product_id,
    p_provider_transaction_id,
    case when is_gift_refund then coalesce(normalized_original,normalized_transaction)
         else p_provider_original_transaction_id end,
    p_user_id,p_checkout_intent_id,p_occurred_at,p_period_start,p_expires_at,p_verified_metadata
  );

  if not is_gift_refund then return inner_result; end if;
  if inner_result in ('duplicate','ignored_stale_provider_order','ignored_test') then
    return inner_result;
  end if;

  refunded:=public.refund_premium_gift_by_provider_payment(p_platform,normalized_transaction);
  if not refunded and normalized_original is not null and normalized_original<>normalized_transaction then
    refunded:=public.refund_premium_gift_by_provider_payment(p_platform,normalized_original);
  end if;
  if not refunded then
    raise exception 'Verified Premium gift refund could not be linked to its original payment';
  end if;

  update public.store_notification_events e
     set processing_result='premium_gift_refunded',updated_at=pg_catalog.now()
   where e.platform=p_platform and e.provider_event_id=trim(p_provider_event_id);
  return 'premium_gift_refunded';
end;
$$;

revoke execute on function public.process_verified_store_notification(
  text,text,text,text,text,text,text,uuid,uuid,
  timestamptz,timestamptz,timestamptz,jsonb
) from public,anon,authenticated;
grant execute on function public.process_verified_store_notification(
  text,text,text,text,text,text,text,uuid,uuid,
  timestamptz,timestamptz,timestamptz,jsonb
) to service_role;
