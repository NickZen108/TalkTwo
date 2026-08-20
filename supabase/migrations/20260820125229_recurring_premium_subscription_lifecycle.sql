-- Recurring Premium is tracked separately from the denormalized user_plans
-- projection. Store subscriptions can cover either the purchaser alone or the
-- purchaser plus one explicitly selected user in an active TalkTwo relationship.

alter table public.store_product_catalog
  drop constraint if exists store_product_catalog_billing_intent_kind_check;

alter table public.store_product_catalog
  add constraint store_product_catalog_billing_intent_kind_check check (
    billing_intent_kind is null
    or billing_intent_kind in (
      'extra_member_start', 'premium_gift',
      'premium_individual', 'premium_two'
    )
  );

update public.store_product_catalog
   set billing_intent_kind = case
     when product_key = 'premium_individual_monthly' then 'premium_individual'
     when product_key in ('premium_two_monthly', 'premium_two_annual') then 'premium_two'
     else billing_intent_kind
   end,
       updated_at = pg_catalog.now()
 where product_key in (
   'premium_individual_monthly', 'premium_two_monthly', 'premium_two_annual'
 );

alter table public.billing_checkout_intents
  drop constraint if exists billing_checkout_intents_kind_check;

alter table public.billing_checkout_intents
  add constraint billing_checkout_intents_kind_check check (
    kind in (
      'extra_member_start', 'extra_member_upgrade', 'premium_gift',
      'premium_individual', 'premium_two'
    )
  );

create table if not exists public.premium_store_subscriptions (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('apple', 'google')),
  provider_original_transaction_id text not null,
  payer_user_id uuid not null references auth.users(id) on delete restrict,
  product_key text not null check (
    product_key in (
      'premium_individual_monthly',
      'premium_two_monthly',
      'premium_two_annual'
    )
  ),
  status text not null default 'active' check (
    status in (
      'active', 'grace_period', 'cancel_at_period_end',
      'on_hold', 'expired', 'revoked'
    )
  ),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  auto_renew boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (platform, provider_original_transaction_id),
  check (current_period_end > current_period_start)
);

create table if not exists public.premium_store_subscription_members (
  subscription_id uuid not null references public.premium_store_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  member_kind text not null check (member_kind in ('payer', 'beneficiary')),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (subscription_id, user_id),
  unique (subscription_id, member_kind)
);

create index if not exists premium_store_subscription_members_user_idx
  on public.premium_store_subscription_members (user_id, subscription_id);

create index if not exists premium_store_subscriptions_active_end_idx
  on public.premium_store_subscriptions (current_period_end)
  where status in ('active', 'grace_period', 'cancel_at_period_end');

alter table public.premium_store_subscriptions enable row level security;
alter table public.premium_store_subscription_members enable row level security;

revoke all on table public.premium_store_subscriptions from public, anon, authenticated;
revoke all on table public.premium_store_subscription_members from public, anon, authenticated;
grant select, insert, update on table public.premium_store_subscriptions to service_role;
grant select, insert, update, delete on table public.premium_store_subscription_members to service_role;

create or replace function public.create_premium_checkout_intent(
  requested_product_key text,
  rel_id uuid default null,
  beneficiary_user uuid default null
)
returns table(
  intent_id uuid,
  kind text,
  product_key text,
  amount_minor integer,
  currency text,
  recurring boolean,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  normalized_product_key text := trim(coalesce(requested_product_key, ''));
  intent_kind text;
  expected_price integer;
  price_variants integer;
begin
  if caller is null then raise exception 'Authentication required'; end if;

  if normalized_product_key = 'premium_individual_monthly' then
    intent_kind := 'premium_individual';
    if rel_id is not null or beneficiary_user is not null then
      raise exception 'Individual Premium only covers the purchaser';
    end if;
  elsif normalized_product_key in ('premium_two_monthly', 'premium_two_annual') then
    intent_kind := 'premium_two';
    if rel_id is null or beneficiary_user is null or beneficiary_user = caller then
      raise exception 'Two-person Premium requires one other relationship member';
    end if;
    if not exists (
      select 1
        from public.relationships r
        join public.relationship_members payer
          on payer.relationship_id = r.id and payer.user_id = caller
        join public.relationship_members beneficiary
          on beneficiary.relationship_id = r.id and beneficiary.user_id = beneficiary_user
       where r.id = rel_id and r.status = 'active'
    ) then
      raise exception 'Premium beneficiary must share an active relationship with the purchaser';
    end if;
  else
    raise exception 'Unsupported Premium product';
  end if;

  select min(c.expected_dkk), count(distinct c.expected_dkk)
    into expected_price, price_variants
    from public.store_product_catalog c
   where c.product_key = normalized_product_key
     and c.billing_intent_kind = intent_kind
     and c.purchase_kind = 'subscription'
     and c.active;
  if expected_price is null or price_variants <> 1 then
    raise exception 'Premium product is not consistently configured';
  end if;

  update public.billing_checkout_intents
     set status = 'cancelled', updated_at = pg_catalog.now()
   where user_id = caller
     and kind = intent_kind
     and status in ('created', 'provider_ready')
     and completed_at is null;

  return query
  insert into public.billing_checkout_intents (
    user_id, kind, relationship_id, member_user_id,
    amount_minor, currency, recurring
  ) values (
    caller, intent_kind, rel_id, beneficiary_user,
    expected_price * 100, 'dkk', true
  )
  returning id, public.billing_checkout_intents.kind,
            normalized_product_key, public.billing_checkout_intents.amount_minor,
            public.billing_checkout_intents.currency,
            public.billing_checkout_intents.recurring,
            public.billing_checkout_intents.expires_at;
end;
$$;

create or replace function public.sync_store_premium_user_plan(
  target_user uuid,
  removed_period_end timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan public.user_plans%rowtype;
  store_end timestamptz;
  preserved_end timestamptz;
  effective_end timestamptz;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if target_user is null then raise exception 'User required'; end if;

  select * into current_plan
    from public.user_plans
   where user_id = target_user
   for update;
  if not found then raise exception 'Plan not found'; end if;

  select max(s.current_period_end) into store_end
    from public.premium_store_subscription_members m
    join public.premium_store_subscriptions s on s.id = m.subscription_id
   where m.user_id = target_user
     and s.status in ('active', 'grace_period', 'cancel_at_period_end')
     and s.current_period_end > pg_catalog.now();

  -- A later existing end represents a stacked gift, a legacy entitlement or
  -- another source and must survive removal of this subscription period.
  if current_plan.plan = 'premium'
     and current_plan.premium_ends_at is not null
     and current_plan.premium_ends_at > pg_catalog.now()
     and (
       removed_period_end is null
       or current_plan.premium_ends_at > removed_period_end
     ) then
    preserved_end := current_plan.premium_ends_at;
  end if;

  if store_end is null then
    effective_end := preserved_end;
  elsif preserved_end is null then
    effective_end := store_end;
  else
    effective_end := greatest(store_end, preserved_end);
  end if;

  if effective_end is not null and effective_end > pg_catalog.now() then
    update public.user_plans
       set plan = 'premium', premium_ends_at = effective_end,
           sponsored_by = null, updated_at = pg_catalog.now()
     where user_id = target_user;
  elsif current_plan.trial_ends_at is not null
        and current_plan.trial_ends_at > pg_catalog.now() then
    update public.user_plans
       set plan = 'trial', premium_ends_at = null,
           sponsored_by = null, updated_at = pg_catalog.now()
     where user_id = target_user;
    effective_end := null;
  else
    update public.user_plans
       set plan = 'free', premium_ends_at = null,
           sponsored_by = null, updated_at = pg_catalog.now()
     where user_id = target_user;
    effective_end := null;
  end if;

  return effective_end;
end;
$$;

create or replace function public.start_premium_store_subscription(
  provider_platform text,
  provider_original_transaction text,
  premium_product_key text,
  payer uuid,
  beneficiary uuid,
  period_start timestamptz,
  period_end timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription public.premium_store_subscriptions%rowtype;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if provider_platform not in ('apple', 'google') then raise exception 'Unsupported store platform'; end if;
  if provider_original_transaction is null or trim(provider_original_transaction) = '' then
    raise exception 'Original subscription id required';
  end if;
  if premium_product_key not in (
    'premium_individual_monthly', 'premium_two_monthly', 'premium_two_annual'
  ) then raise exception 'Unsupported Premium product'; end if;
  if payer is null then raise exception 'Payer required'; end if;
  if period_start is null or period_end is null or period_end <= period_start then
    raise exception 'Complete subscription period required';
  end if;
  if premium_product_key like '%monthly' and period_end > period_start + interval '32 days' then
    raise exception 'Monthly Premium period is too long';
  end if;
  if premium_product_key = 'premium_two_annual' and period_end > period_start + interval '370 days' then
    raise exception 'Annual Premium period is too long';
  end if;
  if premium_product_key = 'premium_individual_monthly' and beneficiary is not null then
    raise exception 'Individual Premium cannot have a beneficiary';
  end if;
  if premium_product_key in ('premium_two_monthly', 'premium_two_annual')
     and (beneficiary is null or beneficiary = payer) then
    raise exception 'Two-person Premium requires one other beneficiary';
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

  if found then
    if subscription.payer_user_id <> payer
       or subscription.product_key <> premium_product_key then
      raise exception 'Premium subscription identity mismatch';
    end if;
    if subscription.status = 'revoked' then
      raise exception 'Revoked Premium subscription cannot be replayed';
    end if;
    if period_end <= subscription.current_period_end then
      return 'ignored_stale';
    end if;
    update public.premium_store_subscriptions
       set status = 'active', current_period_start = period_start,
           current_period_end = greatest(current_period_end, period_end),
           auto_renew = true, updated_at = pg_catalog.now()
     where id = subscription.id
     returning * into subscription;
  else
    insert into public.premium_store_subscriptions (
      platform, provider_original_transaction_id, payer_user_id,
      product_key, current_period_start, current_period_end
    ) values (
      provider_platform, trim(provider_original_transaction), payer,
      premium_product_key, period_start, period_end
    ) returning * into subscription;

    insert into public.premium_store_subscription_members (
      subscription_id, user_id, member_kind
    ) values (subscription.id, payer, 'payer');
    if beneficiary is not null then
      insert into public.premium_store_subscription_members (
        subscription_id, user_id, member_kind
      ) values (subscription.id, beneficiary, 'beneficiary');
    end if;
  end if;

  if not exists (
    select 1 from public.premium_store_subscription_members m
     where m.subscription_id = subscription.id
       and m.user_id = payer and m.member_kind = 'payer'
  ) or (
    beneficiary is null and exists (
      select 1 from public.premium_store_subscription_members m
       where m.subscription_id = subscription.id and m.member_kind = 'beneficiary'
    )
  ) or (
    beneficiary is not null and not exists (
      select 1 from public.premium_store_subscription_members m
       where m.subscription_id = subscription.id
         and m.user_id = beneficiary and m.member_kind = 'beneficiary'
    )
  ) then
    raise exception 'Premium subscription beneficiaries do not match';
  end if;

  perform public.sync_store_premium_user_plan(payer, null);
  if beneficiary is not null then
    perform public.sync_store_premium_user_plan(beneficiary, null);
  end if;
  return 'active';
end;
$$;

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
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
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
  if period_end <= subscription.current_period_end then return 'ignored_stale'; end if;
  if premium_product_key like '%monthly' and period_end > period_start + interval '32 days' then
    raise exception 'Monthly Premium period is too long';
  end if;
  if premium_product_key = 'premium_two_annual' and period_end > period_start + interval '370 days' then
    raise exception 'Annual Premium period is too long';
  end if;

  update public.premium_store_subscriptions
     set status = renewal_status, current_period_start = period_start,
         current_period_end = period_end, auto_renew = true,
         updated_at = pg_catalog.now()
   where id = subscription.id;

  for member_record in
    select user_id from public.premium_store_subscription_members
     where subscription_id = subscription.id
  loop
    perform public.sync_store_premium_user_plan(member_record.user_id, null);
  end loop;
  return renewal_status;
end;
$$;

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
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if hold_status not in ('cancel_at_period_end', 'on_hold') then
    raise exception 'Unsupported Premium hold status';
  end if;
  update public.premium_store_subscriptions
     set status = hold_status, auto_renew = false, updated_at = pg_catalog.now()
   where platform = provider_platform
     and provider_original_transaction_id = trim(provider_original_transaction)
     and status not in ('expired', 'revoked');
  return found;
end;
$$;

create or replace function public.expire_premium_store_subscription(
  provider_platform text,
  provider_original_transaction text
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
  select * into subscription
    from public.premium_store_subscriptions
   where platform = provider_platform
     and provider_original_transaction_id = trim(provider_original_transaction)
   for update;
  if not found then return false; end if;

  update public.premium_store_subscriptions
     set status = case
           when current_period_end <= pg_catalog.now() then 'expired'
           else 'cancel_at_period_end'
         end,
         auto_renew = false, updated_at = pg_catalog.now()
   where id = subscription.id;

  if subscription.current_period_end <= pg_catalog.now() then
    for member_record in
      select user_id from public.premium_store_subscription_members
       where subscription_id = subscription.id
    loop
      perform public.sync_store_premium_user_plan(
        member_record.user_id, subscription.current_period_end
      );
    end loop;
  end if;
  return true;
end;
$$;

create or replace function public.revoke_premium_store_subscription(
  provider_platform text,
  provider_original_transaction text
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
  select * into subscription
    from public.premium_store_subscriptions
   where platform = provider_platform
     and provider_original_transaction_id = trim(provider_original_transaction)
   for update;
  if not found then return false; end if;

  update public.premium_store_subscriptions
     set status = 'revoked', auto_renew = false,
         updated_at = pg_catalog.now()
   where id = subscription.id;

  for member_record in
    select user_id from public.premium_store_subscription_members
     where subscription_id = subscription.id
  loop
    perform public.sync_store_premium_user_plan(
      member_record.user_id, subscription.current_period_end
    );
  end loop;
  return true;
end;
$$;

-- Provider follow-up notifications may reuse the original purchase transaction
-- without repeating its checkout-intent ID. A null follow-up intent therefore
-- preserves the immutable original binding instead of causing a false mismatch.
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
  if p_platform not in ('apple', 'google') then raise exception 'Unsupported store platform'; end if;
  if p_product_id is null or trim(p_product_id) = '' then raise exception 'Product id required'; end if;
  if p_provider_transaction_id is null or trim(p_provider_transaction_id) = '' then
    raise exception 'Provider transaction id required';
  end if;
  if p_user_id is null then raise exception 'User id required'; end if;

  select * into existing_event
    from public.store_purchase_events
   where platform = p_platform
     and provider_transaction_id = trim(p_provider_transaction_id)
   for update;
  if found then
    if existing_event.product_id <> trim(p_product_id)
       or existing_event.user_id <> p_user_id
       or (
         p_checkout_intent_id is not null
         and existing_event.checkout_intent_id is distinct from p_checkout_intent_id
       )
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
  ) returning id into event_id;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'talktwo:store-event:' || p_platform || ':' || trim(p_provider_event_id), 0
    )
  );
  select status into existing_status
    from public.store_notification_events
   where platform = p_platform and provider_event_id = trim(p_provider_event_id)
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
  if p_product_id is null or trim(p_product_id) = '' then raise exception 'Verified product id required'; end if;
  if normalized_transaction is null then raise exception 'Verified transaction id required'; end if;

  select * into product
    from public.store_product_catalog
   where platform = p_platform and product_id = trim(p_product_id) and active;
  if not found then raise exception 'Unknown store product'; end if;

  if p_checkout_intent_id is not null then
    select * into resolved_intent
      from public.billing_checkout_intents
     where id = p_checkout_intent_id for update;
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
    if resolved_intent.kind = 'premium_gift' and resolved_intent.duration_months <> 1 then
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
     order by e.updated_at desc limit 1;
  end if;
  if resolved_user is null then
    raise exception 'Store event could not be linked to a TalkTwo user';
  end if;

  if p_event_type = 'purchase' then
    update public.billing_checkout_intents
       set provider = p_platform, provider_session_id = normalized_original,
           status = case when status = 'created' then 'provider_ready' else status end,
           updated_at = pg_catalog.now()
     where id = resolved_intent.id;

    if product.billing_intent_kind in ('premium_individual', 'premium_two') then
      if product.purchase_kind <> 'subscription' or normalized_original is null
         or p_period_start is null or p_expires_at is null then
        raise exception 'Complete Premium subscription period required';
      end if;
      lifecycle_result := public.start_premium_store_subscription(
        p_platform, normalized_original, product.product_key,
        resolved_intent.user_id, resolved_intent.member_user_id,
        p_period_start, p_expires_at
      );
      update public.billing_checkout_intents
         set status = 'completed', provider_payment_reference = normalized_transaction,
             completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
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
        if product.purchase_kind <> 'subscription' or normalized_original is null
           or p_period_start is null or p_expires_at is null then
          raise exception 'Complete subscription period required';
        end if;
        lifecycle_result := public.renew_extra_member_subscription(
          normalized_original, p_period_start, p_expires_at
        );
      end if;
    elsif product.billing_intent_kind in ('premium_individual', 'premium_two') then
      if normalized_original is null or p_period_start is null or p_expires_at is null then
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
    if normalized_original is null then raise exception 'Original subscription id required'; end if;
    if product.billing_intent_kind = 'extra_member_start' then
      lifecycle_result := public.cancel_extra_member_subscription(normalized_original)::text;
    elsif product.billing_intent_kind in ('premium_individual', 'premium_two') then
      lifecycle_result := public.cancel_premium_store_subscription(
        p_platform, normalized_original,
        case when p_event_type in ('on_hold', 'pause') then 'on_hold' else 'cancel_at_period_end' end
      )::text;
    else
      lifecycle_result := 'recorded_no_entitlement_change';
    end if;
  elsif p_event_type = 'expiry' then
    if normalized_original is null then raise exception 'Original subscription id required'; end if;
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
    if normalized_original is null then raise exception 'Original subscription id required'; end if;
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
     set user_id = resolved_user, status = 'processed',
         processing_result = lifecycle_result,
         processed_at = pg_catalog.now(), updated_at = pg_catalog.now()
   where id = notification_id;
  return coalesce(lifecycle_result, 'processed');
end;
$$;

revoke execute on function public.create_premium_checkout_intent(text, uuid, uuid)
  from public, anon;
grant execute on function public.create_premium_checkout_intent(text, uuid, uuid)
  to authenticated;

revoke execute on function public.sync_store_premium_user_plan(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.start_premium_store_subscription(
  text, text, text, uuid, uuid, timestamptz, timestamptz
) from public, anon, authenticated;
revoke execute on function public.renew_premium_store_subscription(
  text, text, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
revoke execute on function public.cancel_premium_store_subscription(text, text, text)
  from public, anon, authenticated;
revoke execute on function public.expire_premium_store_subscription(text, text)
  from public, anon, authenticated;
revoke execute on function public.revoke_premium_store_subscription(text, text)
  from public, anon, authenticated;

grant execute on function public.sync_store_premium_user_plan(uuid, timestamptz)
  to service_role;
grant execute on function public.start_premium_store_subscription(
  text, text, text, uuid, uuid, timestamptz, timestamptz
) to service_role;
grant execute on function public.renew_premium_store_subscription(
  text, text, text, timestamptz, timestamptz, text
) to service_role;
grant execute on function public.cancel_premium_store_subscription(text, text, text)
  to service_role;
grant execute on function public.expire_premium_store_subscription(text, text)
  to service_role;
grant execute on function public.revoke_premium_store_subscription(text, text)
  to service_role;

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
