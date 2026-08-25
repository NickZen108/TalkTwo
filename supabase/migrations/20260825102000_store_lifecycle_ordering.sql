-- Harden verified Apple/Google subscription lifecycle processing against
-- out-of-order provider delivery. Provider event IDs make retries idempotent,
-- but different events for the same subscription can still arrive in reverse
-- order. Serialize by original subscription identity and compare trusted provider
-- occurrence timestamps before mutating entitlement state.
--
-- Also allow a current-period Premium state transition (for example on_hold ->
-- active, cancellation -> active, active -> grace_period) without extending the
-- paid boundary. A genuinely older period can never move the boundary backwards.

create index if not exists store_notification_events_lifecycle_order_idx
  on public.store_notification_events(
    platform, provider_original_transaction_id, occurred_at desc
  )
  where provider_original_transaction_id is not null
    and occurred_at is not null
    and status = 'processed';

create or replace function private.store_lifecycle_event_rank(candidate text)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case candidate
    when 'revocation' then 100
    when 'refund' then 100
    when 'expiry' then 90
    when 'on_hold' then 80
    when 'pause' then 80
    when 'cancellation' then 70
    when 'grace_period' then 60
    when 'recovery' then 50
    when 'renewal' then 40
    when 'deferred' then 30
    else 0
  end;
$$;

revoke execute on function private.store_lifecycle_event_rank(text)
  from public, anon, authenticated, service_role;

create or replace function public.renew_premium_store_subscription(
  provider_platform text,
  provider_original_transaction text,
  premium_product_key text,
  period_start timestamptz,
  period_end timestamptz,
  renewal_status text default 'active'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription public.premium_store_subscriptions%rowtype;
  member_record record;
  effective_start timestamptz;
  effective_end timestamptz;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if provider_platform not in ('apple', 'google') then
    raise exception 'Unsupported store platform';
  end if;
  if renewal_status not in ('active', 'grace_period') then
    raise exception 'Unsupported Premium renewal status';
  end if;
  if provider_original_transaction is null or trim(provider_original_transaction) = '' then
    raise exception 'Original subscription id required';
  end if;
  if period_start is null or period_end is null or period_end <= period_start then
    raise exception 'Complete subscription period required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'talktwo:premium:' || provider_platform || ':' || trim(provider_original_transaction), 0
    )
  );
  select * into subscription
    from public.premium_store_subscriptions
   where platform = provider_platform
     and provider_original_transaction_id = trim(provider_original_transaction)
   for update;
  if not found then raise exception 'Premium subscription not found'; end if;
  if subscription.product_key <> premium_product_key then
    raise exception 'Premium product changes require a new checkout';
  end if;
  if subscription.status = 'revoked' then
    raise exception 'Revoked Premium subscription cannot be renewed';
  end if;

  -- A shorter provider period is always stale. Equal-period events are allowed
  -- only to change current lifecycle state; they never alter the paid boundary.
  if period_end < subscription.current_period_end then
    return 'ignored_stale';
  end if;

  if period_end = subscription.current_period_end then
    if subscription.status = 'expired' then return 'ignored_stale'; end if;
    if subscription.status = renewal_status and subscription.auto_renew then
      return 'ignored_stale';
    end if;
    effective_start := subscription.current_period_start;
    effective_end := subscription.current_period_end;
  else
    if premium_product_key like '%monthly'
       and period_end > period_start + interval '32 days' then
      raise exception 'Monthly Premium period is too long';
    end if;
    if premium_product_key = 'premium_two_annual'
       and period_end > period_start + interval '370 days' then
      raise exception 'Annual Premium period is too long';
    end if;
    effective_start := period_start;
    effective_end := period_end;
  end if;

  update public.premium_store_subscriptions
     set status = renewal_status,
         current_period_start = effective_start,
         current_period_end = effective_end,
         auto_renew = true,
         updated_at = pg_catalog.now()
   where id = subscription.id;

  for member_record in
    select user_id
      from public.premium_store_subscription_members
     where subscription_id = subscription.id
  loop
    perform public.sync_store_premium_user_plan(member_record.user_id, null);
  end loop;
  return renewal_status;
end;
$$;

revoke execute on function public.renew_premium_store_subscription(
  text, text, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.renew_premium_store_subscription(
  text, text, text, timestamptz, timestamptz, text
) to service_role;

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
  notification_id uuid;
  existing_status text;
  resolved_user uuid := p_user_id;
  resolved_intent public.billing_checkout_intents%rowtype;
  product public.store_product_catalog%rowtype;
  lifecycle_result text;
  normalized_transaction text := nullif(trim(coalesce(p_provider_transaction_id, '')), '');
  normalized_original text := nullif(trim(coalesce(p_provider_original_transaction_id, '')), '');
  linked_purchase_confirmation boolean := false;
  current_rank integer := 0;
  latest_occurred_at timestamptz;
  latest_rank integer;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if p_platform not in ('apple', 'google') then raise exception 'Unsupported store platform'; end if;
  if p_provider_event_id is null or trim(p_provider_event_id) = '' then
    raise exception 'Provider event id required';
  end if;
  if p_event_type not in (
    'purchase', 'renewal', 'recovery', 'cancellation', 'expiry',
    'revocation', 'refund', 'grace_period', 'on_hold', 'pause',
    'deferred', 'price_change', 'test', 'unknown'
  ) then raise exception 'Unsupported store event type'; end if;
  if p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'SHA-256 payload digest required';
  end if;

  -- Keep exact retry idempotency and add a second transaction lock shared by
  -- different lifecycle events for one provider subscription.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'talktwo:store-event:' || p_platform || ':' || trim(p_provider_event_id), 0
    )
  );
  if normalized_original is not null
     and p_event_type in (
       'renewal','recovery','cancellation','expiry','revocation','refund',
       'grace_period','on_hold','pause','deferred'
     ) then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'talktwo:store-subscription-order:' || p_platform || ':' || normalized_original, 0
      )
    );
  end if;

  select status into existing_status
    from public.store_notification_events
   where platform = p_platform
     and provider_event_id = trim(p_provider_event_id)
   for update;
  if found then return 'duplicate'; end if;

  insert into public.store_notification_events (
    platform, provider_event_id, event_type, product_id,
    provider_transaction_id, provider_original_transaction_id,
    user_id, checkout_intent_id, occurred_at, expires_at,
    payload_sha256, verified_metadata
  ) values (
    p_platform, trim(p_provider_event_id), p_event_type,
    nullif(trim(coalesce(p_product_id, '')), ''),
    normalized_transaction, normalized_original,
    p_user_id, p_checkout_intent_id, p_occurred_at, p_expires_at,
    p_payload_sha256, p_verified_metadata
  ) returning id into notification_id;

  if p_event_type = 'test' then
    update public.store_notification_events
       set status = 'ignored', processing_result = 'test',
           processed_at = pg_catalog.now(), updated_at = pg_catalog.now()
     where id = notification_id;
    return 'ignored_test';
  end if;
  if p_product_id is null or trim(p_product_id) = '' then
    raise exception 'Verified product id required';
  end if;
  if normalized_transaction is null then
    raise exception 'Verified transaction id required';
  end if;

  select * into product
    from public.store_product_catalog
   where platform = p_platform
     and product_id = trim(p_product_id)
     and active;
  if not found then raise exception 'Unknown store product'; end if;

  if p_checkout_intent_id is not null then
    select * into resolved_intent
      from public.billing_checkout_intents
     where id = p_checkout_intent_id
     for update;
    if not found then raise exception 'Billing intent not found'; end if;
    if p_user_id is not null and p_user_id <> resolved_intent.user_id then
      raise exception 'Store user does not match billing intent';
    end if;
    resolved_user := resolved_intent.user_id;
    if product.billing_intent_kind is distinct from resolved_intent.kind then
      raise exception 'Store product does not match billing intent';
    end if;
    if product.expected_dkk * 100 <> resolved_intent.amount_minor then
      raise exception 'Store product does not match expected amount';
    end if;
    if resolved_intent.kind = 'premium_gift'
       and resolved_intent.duration_months <> 1 then
      raise exception 'Only the configured one-month gift product is supported';
    end if;
  elsif p_event_type = 'purchase' then
    -- A provider may deliver its purchase notification after the client already
    -- completed verified checkout. It is an audit confirmation only: require an
    -- existing verified transaction/original-subscription binding and never
    -- create entitlement from this path.
    select e.user_id into resolved_user
      from public.store_purchase_events e
     where e.platform = p_platform
       and e.product_id = trim(p_product_id)
       and (
         e.provider_transaction_id = normalized_transaction
         or (
           normalized_original is not null
           and e.provider_original_transaction_id = normalized_original
         )
       )
     order by e.updated_at desc
     limit 1;
    if not found or resolved_user is null then
      raise exception 'Checkout intent required for unlinked initial purchase';
    end if;
    if p_user_id is not null and p_user_id <> resolved_user then
      raise exception 'Store user does not match verified purchase';
    end if;
    linked_purchase_confirmation := true;
  end if;

  if resolved_user is null then
    select e.user_id into resolved_user
      from public.store_purchase_events e
     where e.platform = p_platform
       and (
         e.provider_transaction_id = normalized_transaction
         or (
           normalized_original is not null
           and e.provider_original_transaction_id = normalized_original
         )
       )
     order by e.updated_at desc
     limit 1;
  end if;
  if resolved_user is null then
    raise exception 'Store event could not be linked to a TalkTwo user';
  end if;

  -- Only provider subscription follow-ups participate in lifecycle ordering.
  -- Initial checkout remains controlled by its verified checkout intent.
  if product.purchase_kind = 'subscription'
     and p_event_type in (
       'renewal','recovery','cancellation','expiry','revocation','refund',
       'grace_period','on_hold','pause','deferred'
     ) then
    if normalized_original is null then
      raise exception 'Original subscription id required';
    end if;
    if p_occurred_at is null then
      raise exception 'Verified subscription lifecycle event time required';
    end if;
    if p_occurred_at > pg_catalog.now() + interval '10 minutes' then
      raise exception 'Provider lifecycle event time is implausibly in the future';
    end if;

    current_rank := private.store_lifecycle_event_rank(p_event_type);
    select e.occurred_at, private.store_lifecycle_event_rank(e.event_type)
      into latest_occurred_at, latest_rank
      from public.store_notification_events e
     where e.id <> notification_id
       and e.platform = p_platform
       and e.provider_original_transaction_id = normalized_original
       and e.status = 'processed'
       and e.occurred_at is not null
       and e.event_type in (
         'renewal','recovery','cancellation','expiry','revocation','refund',
         'grace_period','on_hold','pause','deferred'
       )
     order by e.occurred_at desc,
              private.store_lifecycle_event_rank(e.event_type) desc,
              e.processed_at desc nulls last
     limit 1;

    if latest_occurred_at is not null
       and (
         latest_occurred_at > p_occurred_at
         or (
           latest_occurred_at = p_occurred_at
           and coalesce(latest_rank, 0) > current_rank
         )
       ) then
      update public.store_notification_events
         set user_id = resolved_user,
             status = 'ignored',
             processing_result = 'ignored_stale_provider_order',
             processed_at = pg_catalog.now(),
             updated_at = pg_catalog.now()
       where id = notification_id;
      return 'ignored_stale_provider_order';
    end if;
  end if;

  if p_event_type = 'purchase' and linked_purchase_confirmation then
    lifecycle_result := 'recorded_purchase_confirmation';
  elsif p_event_type = 'purchase' then
    update public.billing_checkout_intents
       set provider = p_platform,
           provider_session_id = normalized_original,
           status = case when status = 'created' then 'provider_ready' else status end,
           updated_at = pg_catalog.now()
     where id = resolved_intent.id;

    if product.billing_intent_kind in ('premium_individual', 'premium_two') then
      if product.purchase_kind <> 'subscription'
         or normalized_original is null
         or p_period_start is null
         or p_expires_at is null then
        raise exception 'Complete Premium subscription period required';
      end if;
      lifecycle_result := public.start_premium_store_subscription(
        p_platform, normalized_original, product.product_key,
        resolved_intent.user_id, resolved_intent.member_user_id,
        p_period_start, p_expires_at
      );
      update public.billing_checkout_intents
         set status = 'completed',
             provider_payment_reference = normalized_transaction,
             completed_at = pg_catalog.now(),
             updated_at = pg_catalog.now()
       where id = resolved_intent.id;
    else
      lifecycle_result := public.complete_billing_intent(
        resolved_intent.id, normalized_transaction, normalized_original,
        p_period_start, p_expires_at
      );
    end if;
  elsif p_event_type in ('renewal', 'recovery', 'deferred', 'grace_period') then
    if product.billing_intent_kind = 'extra_member_start' then
      if p_event_type = 'grace_period' then
        lifecycle_result := 'recorded_grace_period';
      else
        if product.purchase_kind <> 'subscription'
           or normalized_original is null
           or p_period_start is null
           or p_expires_at is null then
          raise exception 'Complete subscription period required';
        end if;
        lifecycle_result := public.renew_extra_member_subscription(
          normalized_original, p_period_start, p_expires_at
        );
      end if;
    elsif product.billing_intent_kind in ('premium_individual', 'premium_two') then
      if normalized_original is null
         or p_period_start is null
         or p_expires_at is null then
        raise exception 'Complete Premium subscription period required';
      end if;
      lifecycle_result := public.renew_premium_store_subscription(
        p_platform, normalized_original, product.product_key,
        p_period_start, p_expires_at,
        case when p_event_type = 'grace_period' then 'grace_period' else 'active' end
      );
    else
      raise exception 'Unsupported subscription lifecycle product';
    end if;
  elsif p_event_type in ('cancellation', 'on_hold', 'pause') then
    if normalized_original is null then
      raise exception 'Original subscription id required';
    end if;
    if product.billing_intent_kind = 'extra_member_start' then
      lifecycle_result := public.cancel_extra_member_subscription(normalized_original)::text;
    elsif product.billing_intent_kind in ('premium_individual', 'premium_two') then
      lifecycle_result := public.cancel_premium_store_subscription(
        p_platform, normalized_original,
        case when p_event_type in ('on_hold', 'pause')
          then 'on_hold' else 'cancel_at_period_end' end
      )::text;
    else
      lifecycle_result := 'recorded_no_entitlement_change';
    end if;
  elsif p_event_type = 'expiry' then
    if normalized_original is null then
      raise exception 'Original subscription id required';
    end if;
    if product.billing_intent_kind = 'extra_member_start' then
      lifecycle_result := public.expire_extra_member_subscription(normalized_original)::text;
    elsif product.billing_intent_kind in ('premium_individual', 'premium_two') then
      lifecycle_result := public.expire_premium_store_subscription(
        p_platform, normalized_original
      )::text;
    else
      lifecycle_result := 'recorded_no_entitlement_change';
    end if;
  elsif p_event_type in ('revocation', 'refund') then
    if normalized_original is null then
      raise exception 'Original subscription id required';
    end if;
    if product.billing_intent_kind = 'extra_member_start' then
      lifecycle_result := public.revoke_extra_member_subscription(normalized_original)::text;
    elsif product.billing_intent_kind in ('premium_individual', 'premium_two') then
      lifecycle_result := public.revoke_premium_store_subscription(
        p_platform, normalized_original
      )::text;
    else
      lifecycle_result := 'recorded_no_entitlement_change';
    end if;
  else
    lifecycle_result := 'recorded_no_entitlement_change';
  end if;

  perform public.record_verified_store_event(
    p_platform, trim(p_product_id), normalized_transaction, normalized_original,
    resolved_user, p_checkout_intent_id, p_event_type, 'verified',
    coalesce(p_period_start, p_occurred_at), p_expires_at, p_verified_metadata
  );
  update public.store_notification_events
     set user_id = resolved_user,
         status = 'processed',
         processing_result = lifecycle_result,
         processed_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = notification_id;
  return coalesce(lifecycle_result, 'processed');
end;
$$;

revoke execute on function public.process_verified_store_notification(
  text, text, text, text, text, text, text, uuid, uuid,
  timestamptz, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.process_verified_store_notification(
  text, text, text, text, text, text, text, uuid, uuid,
  timestamptz, timestamptz, timestamptz, jsonb
) to service_role;
