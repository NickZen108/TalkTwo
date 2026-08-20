-- Idempotent, server-only inbox for verified Apple and Google store events.
-- Provider signatures and API responses are verified in Edge Functions before
-- this RPC is called. Entitlement changes and event finalization happen in the
-- same database transaction.

create table if not exists public.store_product_catalog (
  platform text not null check (platform in ('apple', 'google')),
  product_key text not null,
  product_id text not null,
  purchase_kind text not null check (purchase_kind in ('subscription', 'one_time')),
  billing_intent_kind text,
  expected_dkk integer not null check (expected_dkk > 0),
  active boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (platform, product_key),
  unique (platform, product_id),
  check (
    billing_intent_kind is null
    or billing_intent_kind in ('extra_member_start', 'premium_gift')
  )
);

insert into public.store_product_catalog
  (platform, product_key, product_id, purchase_kind, billing_intent_kind, expected_dkk)
values
  ('apple', 'premium_individual_monthly', 'com.talktwo.premium.individual.monthly', 'subscription', null, 59),
  ('apple', 'premium_two_monthly', 'com.talktwo.premium.two.monthly', 'subscription', null, 99),
  ('apple', 'premium_two_annual', 'com.talktwo.premium.two.annual', 'subscription', null, 799),
  ('apple', 'extra_observer_monthly', 'com.talktwo.extra.observer.monthly', 'subscription', 'extra_member_start', 29),
  ('apple', 'extra_participant_monthly', 'com.talktwo.extra.participant.monthly', 'subscription', 'extra_member_start', 99),
  ('apple', 'premium_gift_1m', 'com.talktwo.premium.gift.1m', 'one_time', 'premium_gift', 59),
  ('google', 'premium_individual_monthly', 'premium_individual_monthly', 'subscription', null, 59),
  ('google', 'premium_two_monthly', 'premium_two_monthly', 'subscription', null, 99),
  ('google', 'premium_two_annual', 'premium_two_annual', 'subscription', null, 799),
  ('google', 'extra_observer_monthly', 'extra_observer_monthly', 'subscription', 'extra_member_start', 29),
  ('google', 'extra_participant_monthly', 'extra_participant_monthly', 'subscription', 'extra_member_start', 99),
  ('google', 'premium_gift_1m', 'premium_gift_1m', 'one_time', 'premium_gift', 59)
on conflict (platform, product_key) do update
set product_id = excluded.product_id,
    purchase_kind = excluded.purchase_kind,
    billing_intent_kind = excluded.billing_intent_kind,
    expected_dkk = excluded.expected_dkk,
    active = true,
    updated_at = pg_catalog.now();

create table if not exists public.store_notification_events (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('apple', 'google')),
  provider_event_id text not null,
  event_type text not null check (
    event_type in (
      'purchase', 'renewal', 'recovery', 'cancellation', 'expiry',
      'revocation', 'refund', 'grace_period', 'on_hold', 'pause',
      'deferred', 'price_change', 'test', 'unknown'
    )
  ),
  product_id text,
  provider_transaction_id text,
  provider_original_transaction_id text,
  user_id uuid references auth.users(id) on delete set null,
  checkout_intent_id uuid references public.billing_checkout_intents(id) on delete set null,
  occurred_at timestamptz,
  expires_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored')),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  verified_metadata jsonb,
  processing_result text,
  received_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  unique (platform, provider_event_id)
);

create index if not exists store_notification_events_transaction_idx
  on public.store_notification_events (platform, provider_transaction_id)
  where provider_transaction_id is not null;
create index if not exists store_notification_events_original_idx
  on public.store_notification_events (platform, provider_original_transaction_id)
  where provider_original_transaction_id is not null;
create index if not exists store_notification_events_received_idx
  on public.store_notification_events (status, received_at)
  where status = 'received';

alter table public.store_product_catalog enable row level security;
alter table public.store_notification_events enable row level security;

revoke all on table public.store_product_catalog from public, anon, authenticated;
revoke all on table public.store_notification_events from public, anon, authenticated;
grant select on table public.store_product_catalog to service_role;
grant select, insert, update on table public.store_notification_events to service_role;

create or replace function public.record_verified_store_event(
  p_platform text,
  p_product_id text,
  p_provider_transaction_id text,
  p_provider_original_transaction_id text,
  p_user_id uuid,
  p_checkout_intent_id uuid,
  p_event_type text,
  p_status text,
  p_purchased_at timestamptz,
  p_expires_at timestamptz,
  p_provider_payload jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event public.store_purchase_events%rowtype;
  event_id uuid;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if p_platform not in ('apple', 'google') then
    raise exception 'Unsupported store platform';
  end if;
  if p_product_id is null or trim(p_product_id) = '' then
    raise exception 'Product id required';
  end if;
  if p_provider_transaction_id is null or trim(p_provider_transaction_id) = '' then
    raise exception 'Provider transaction id required';
  end if;
  if p_user_id is null then
    raise exception 'User id required';
  end if;

  select * into existing_event
    from public.store_purchase_events
   where platform = p_platform
     and provider_transaction_id = trim(p_provider_transaction_id)
   for update;

  if found then
    if existing_event.product_id <> trim(p_product_id)
       or existing_event.user_id <> p_user_id
       or existing_event.checkout_intent_id is distinct from p_checkout_intent_id
       or existing_event.provider_original_transaction_id is distinct from
          nullif(trim(coalesce(p_provider_original_transaction_id, '')), '') then
      raise exception 'Store transaction identity mismatch';
    end if;

    update public.store_purchase_events
       set event_type = coalesce(nullif(trim(p_event_type), ''), event_type),
           status = coalesce(nullif(trim(p_status), ''), status),
           purchased_at = coalesce(p_purchased_at, purchased_at),
           expires_at = coalesce(p_expires_at, expires_at),
           provider_payload = coalesce(p_provider_payload, provider_payload),
           updated_at = pg_catalog.now()
     where id = existing_event.id
     returning id into event_id;
    return event_id;
  end if;

  insert into public.store_purchase_events (
    platform, product_id, provider_transaction_id,
    provider_original_transaction_id, user_id, checkout_intent_id,
    event_type, status, purchased_at, expires_at, provider_payload
  ) values (
    p_platform, trim(p_product_id), trim(p_provider_transaction_id),
    nullif(trim(coalesce(p_provider_original_transaction_id, '')), ''),
    p_user_id, p_checkout_intent_id,
    coalesce(nullif(trim(p_event_type), ''), 'purchase'),
    coalesce(nullif(trim(p_status), ''), 'verified'),
    p_purchased_at, p_expires_at, p_provider_payload
  )
  returning id into event_id;

  return event_id;
end;
$$;

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
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if p_platform not in ('apple', 'google') then
    raise exception 'Unsupported store platform';
  end if;
  if p_provider_event_id is null or trim(p_provider_event_id) = '' then
    raise exception 'Provider event id required';
  end if;
  if p_event_type not in (
    'purchase', 'renewal', 'recovery', 'cancellation', 'expiry',
    'revocation', 'refund', 'grace_period', 'on_hold', 'pause',
    'deferred', 'price_change', 'test', 'unknown'
  ) then
    raise exception 'Unsupported store event type';
  end if;
  if p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'SHA-256 payload digest required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'talktwo:store-event:' || p_platform || ':' || trim(p_provider_event_id),
      0
    )
  );

  select status into existing_status
    from public.store_notification_events
   where platform = p_platform
     and provider_event_id = trim(p_provider_event_id)
   for update;
  if found then
    return 'duplicate';
  end if;

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
  )
  returning id into notification_id;

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
  if not found then
    raise exception 'Unknown store product';
  end if;

  if p_checkout_intent_id is not null then
    select * into resolved_intent
      from public.billing_checkout_intents
     where id = p_checkout_intent_id
     for update;
    if not found then
      raise exception 'Billing intent not found';
    end if;
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
    raise exception 'Checkout intent required for initial purchase';
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

  if p_event_type = 'purchase' then
    update public.billing_checkout_intents
       set provider = p_platform,
           provider_session_id = normalized_original,
           status = case when status = 'created' then 'provider_ready' else status end,
           updated_at = pg_catalog.now()
     where id = resolved_intent.id;

    lifecycle_result := public.complete_billing_intent(
      resolved_intent.id,
      normalized_transaction,
      normalized_original,
      p_period_start,
      p_expires_at
    );
  elsif p_event_type in ('renewal', 'recovery', 'deferred') then
    if product.billing_intent_kind is distinct from 'extra_member_start' then
      raise exception 'Premium subscription lifecycle is not enabled yet';
    end if;
    if product.purchase_kind <> 'subscription'
       or normalized_original is null
       or p_period_start is null
       or p_expires_at is null then
      raise exception 'Complete subscription period required';
    end if;
    lifecycle_result := public.renew_extra_member_subscription(
      normalized_original,
      p_period_start,
      p_expires_at
    );
  elsif p_event_type = 'cancellation' then
    if product.billing_intent_kind is distinct from 'extra_member_start' then
      raise exception 'Premium subscription lifecycle is not enabled yet';
    end if;
    if normalized_original is null then
      raise exception 'Original subscription id required';
    end if;
    lifecycle_result := public.cancel_extra_member_subscription(normalized_original)::text;
  elsif p_event_type = 'expiry' then
    if product.billing_intent_kind is distinct from 'extra_member_start' then
      raise exception 'Premium subscription lifecycle is not enabled yet';
    end if;
    if normalized_original is null then
      raise exception 'Original subscription id required';
    end if;
    lifecycle_result := public.expire_extra_member_subscription(normalized_original)::text;
  elsif p_event_type in ('revocation', 'refund') then
    if product.billing_intent_kind is distinct from 'extra_member_start' then
      raise exception 'Premium subscription lifecycle is not enabled yet';
    end if;
    if normalized_original is null then
      raise exception 'Original subscription id required';
    end if;
    lifecycle_result := public.revoke_extra_member_subscription(normalized_original)::text;
  else
    lifecycle_result := 'recorded_no_entitlement_change';
  end if;

  perform public.record_verified_store_event(
    p_platform,
    trim(p_product_id),
    normalized_transaction,
    normalized_original,
    resolved_user,
    p_checkout_intent_id,
    p_event_type,
    'verified',
    coalesce(p_period_start, p_occurred_at),
    p_expires_at,
    p_verified_metadata
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

revoke execute on function public.record_verified_store_event(
  text, text, text, text, uuid, uuid, text, text,
  timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.record_verified_store_event(
  text, text, text, text, uuid, uuid, text, text,
  timestamptz, timestamptz, jsonb
) to service_role;

revoke execute on function public.process_verified_store_notification(
  text, text, text, text, text, text, text, uuid, uuid,
  timestamptz, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.process_verified_store_notification(
  text, text, text, text, text, text, text, uuid, uuid,
  timestamptz, timestamptz, timestamptz, jsonb
) to service_role;
