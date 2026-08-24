-- Verified provider on-hold/pause events are not ordinary user cancellations.
-- A cancellation preserves access to the paid period boundary; a provider hold
-- means the account-wide extra-member entitlement is currently unavailable.
-- Suspend server membership immediately, retain the approved subscription rows
-- for recovery, and allow a verified recovery/renewal to reactivate them even
-- when the provider reports the same period end as before the hold.

alter table public.extra_member_access_subscriptions
  drop constraint if exists extra_member_access_subscriptions_status_check;
alter table public.extra_member_access_subscriptions
  add constraint extra_member_access_subscriptions_status_check
  check (status in ('active', 'cancel_at_period_end', 'expired', 'on_hold'));

create or replace function public.renew_extra_member_subscription(
  provider_subscription text,
  period_start timestamptz,
  period_end timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_subscription public.extra_member_access_subscriptions%rowtype;
  has_eligible_chat boolean;
  effective_start timestamptz;
  effective_end timestamptz;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if provider_subscription is null or trim(provider_subscription) = '' then
    raise exception 'Provider subscription id required';
  end if;
  if period_start is null or period_end is null
     or period_end <= period_start
     or period_end > period_start + interval '32 days' then
    raise exception 'Extra memberships are monthly only';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:extra:' || trim(provider_subscription), 0)
  );

  select * into account_subscription
    from public.extra_member_access_subscriptions
   where provider_subscription_id = trim(provider_subscription)
   for update;
  if not found then raise exception 'Subscription not found'; end if;
  if account_subscription.status = 'expired' then
    raise exception 'Expired extra-member subscription requires a new checkout';
  end if;

  -- A normal delayed/duplicate renewal is stale, but a recovery from on-hold
  -- must be allowed to restore access even when the provider keeps the same
  -- already-paid period boundary.
  if period_end <= account_subscription.current_period_end
     and account_subscription.status <> 'on_hold' then
    return 'ignored_stale';
  end if;

  if period_end > account_subscription.current_period_end then
    effective_start := period_start;
    effective_end := period_end;
  else
    effective_start := account_subscription.current_period_start;
    effective_end := account_subscription.current_period_end;
  end if;

  select exists (
    select 1
      from public.relationship_member_subscriptions s
     where s.member_user_id = account_subscription.user_id
       and s.status in ('active', 'cancel_at_period_end', 'payment_failed')
       and not exists (
         select 1
           from public.member_invitation_approvals a
          where a.invitation_id = s.invitation_id
            and a.decision is distinct from true
       )
  ) into has_eligible_chat;

  update public.extra_member_access_subscriptions
     set current_period_start = effective_start,
         current_period_end = effective_end,
         status = case when has_eligible_chat then 'active' else 'cancel_at_period_end' end,
         auto_renew = has_eligible_chat,
         approval_withdrawn_at = case
           when has_eligible_chat then null
           else coalesce(approval_withdrawn_at, pg_catalog.now())
         end,
         updated_at = pg_catalog.now()
   where user_id = account_subscription.user_id;

  -- Chats that genuinely ended at an old approved boundary stay ended.
  update public.relationship_member_subscriptions
     set status = 'expired', auto_renew = false, updated_at = pg_catalog.now()
   where member_user_id = account_subscription.user_id
     and status = 'cancel_at_period_end'
     and current_period_end <= effective_start;

  delete from public.relationship_members rm
   using public.relationship_member_subscriptions s
   where s.member_user_id = account_subscription.user_id
     and s.relationship_id = rm.relationship_id
     and s.member_user_id = rm.user_id
     and s.status = 'expired';

  -- Reactivate/extend only chats whose unanimous approval is still valid.
  update public.relationship_member_subscriptions s
     set current_period_start = effective_start,
         current_period_end = effective_end,
         auto_renew = true,
         status = 'active',
         updated_at = pg_catalog.now()
   where s.member_user_id = account_subscription.user_id
     and s.status in ('active', 'cancel_at_period_end', 'payment_failed')
     and not exists (
       select 1
         from public.member_invitation_approvals a
        where a.invitation_id = s.invitation_id
          and a.decision is distinct from true
     );

  insert into public.relationship_members(relationship_id, user_id, role)
  select s.relationship_id, s.member_user_id, s.role
    from public.relationship_member_subscriptions s
   where s.member_user_id = account_subscription.user_id
     and s.status = 'active'
     and s.current_period_end > pg_catalog.now()
     and not exists (
       select 1
         from public.member_invitation_approvals a
        where a.invitation_id = s.invitation_id
          and a.decision is distinct from true
     )
  on conflict(relationship_id, user_id) do update set role = excluded.role;

  return case when has_eligible_chat then 'active' else 'cancel_at_period_end' end;
end;
$$;

create or replace function private.suspend_extra_member_on_verified_hold()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account_user uuid;
  is_extra_product boolean;
begin
  if new.status <> 'processed'
     or old.status = 'processed'
     or new.event_type not in ('on_hold', 'pause')
     or new.provider_original_transaction_id is null then
    return new;
  end if;

  select exists(
    select 1
      from public.store_product_catalog c
     where c.platform = new.platform
       and c.product_id = new.product_id
       and c.billing_intent_kind = 'extra_member_start'
       and c.purchase_kind = 'subscription'
       and c.active
  ) into is_extra_product;
  if not is_extra_product then return new; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'talktwo:extra:' || trim(new.provider_original_transaction_id), 0
    )
  );

  select s.user_id into account_user
    from public.extra_member_access_subscriptions s
   where s.provider_subscription_id = trim(new.provider_original_transaction_id)
   for update;
  if account_user is null then return new; end if;

  update public.extra_member_access_subscriptions
     set status = 'on_hold', auto_renew = false, updated_at = pg_catalog.now()
   where user_id = account_user
     and status <> 'expired';

  update public.relationship_member_subscriptions
     set status = 'payment_failed', auto_renew = false, updated_at = pg_catalog.now()
   where member_user_id = account_user
     and status in ('active', 'cancel_at_period_end');

  -- A held extra member is no longer an active server-side chat member. Local
  -- ciphertext/plaintext already legitimately cached on that device cannot be
  -- retroactively revoked, but no new server conversation access remains.
  delete from public.relationship_members rm
   using public.relationship_member_subscriptions s
   where s.member_user_id = account_user
     and s.relationship_id = rm.relationship_id
     and s.member_user_id = rm.user_id
     and s.status = 'payment_failed';

  -- Cancel any generic queued alerts that were created before the hold became
  -- effective. This does not reveal message content or hold state to senders.
  if pg_catalog.to_regclass('public.push_notification_jobs') is not null then
    execute $sql$
      update public.push_notification_jobs j
         set status='cancelled', updated_at=pg_catalog.now(),
             last_error='Extra-member entitlement temporarily unavailable'
        from public.messages m
       where j.message_id=m.id
         and j.user_id=$1
         and j.status in ('pending','processing','ticketed')
    $sql$ using account_user;
  end if;

  return new;
end;
$$;

drop trigger if exists suspend_extra_member_on_verified_hold
  on public.store_notification_events;
create trigger suspend_extra_member_on_verified_hold
after update of status on public.store_notification_events
for each row execute function private.suspend_extra_member_on_verified_hold();

revoke execute on function public.renew_extra_member_subscription(text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.renew_extra_member_subscription(text, timestamptz, timestamptz)
  to service_role;
