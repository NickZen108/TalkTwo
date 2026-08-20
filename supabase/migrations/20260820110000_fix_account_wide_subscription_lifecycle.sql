-- Keep one provider subscription at account level while allowing it to cover
-- every independently approved TalkTwo relationship for the same user.

alter table public.relationship_member_subscriptions
  drop constraint if exists relationship_member_subscriptions_provider_subscription_id_key;

create index if not exists relationship_member_subscriptions_provider_idx
  on public.relationship_member_subscriptions (payment_provider, provider_subscription_id)
  where provider_subscription_id is not null;

create unique index if not exists extra_member_access_provider_subscription_uidx
  on public.extra_member_access_subscriptions (payment_provider, provider_subscription_id)
  where payment_provider is not null and provider_subscription_id is not null;

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
  if not found then
    raise exception 'Subscription not found';
  end if;

  -- Ignore duplicate or delayed renewal notifications. They must never move a
  -- paid boundary backwards.
  if period_end <= account_subscription.current_period_end then
    return 'ignored_stale';
  end if;

  select exists (
    select 1
      from public.relationship_member_subscriptions s
     where s.member_user_id = account_subscription.user_id
       and s.status = 'active'
       and not exists (
         select 1
           from public.member_invitation_approvals a
          where a.invitation_id = s.invitation_id
            and a.decision is distinct from true
       )
  ) into has_eligible_chat;

  update public.extra_member_access_subscriptions
     set current_period_start = period_start,
         current_period_end = period_end,
         status = case when has_eligible_chat then 'active' else 'cancel_at_period_end' end,
         auto_renew = has_eligible_chat,
         approval_withdrawn_at = case
           when has_eligible_chat then null
           else coalesce(approval_withdrawn_at, pg_catalog.now())
         end,
         updated_at = pg_catalog.now()
   where user_id = account_subscription.user_id;

  -- Extend only chats whose unanimous approval is still valid. A chat that
  -- withdrew approval keeps its old paid boundary and ends there.
  update public.relationship_member_subscriptions s
     set current_period_start = period_start,
         current_period_end = period_end,
         auto_renew = true,
         status = 'active',
         updated_at = pg_catalog.now()
   where s.member_user_id = account_subscription.user_id
     and s.status = 'active'
     and not exists (
       select 1
         from public.member_invitation_approvals a
        where a.invitation_id = s.invitation_id
          and a.decision is distinct from true
     );

  return case when has_eligible_chat then 'active' else 'cancel_at_period_end' end;
end;
$$;

create or replace function public.cancel_extra_member_subscription(
  provider_subscription text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_user uuid;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if provider_subscription is null or trim(provider_subscription) = '' then
    raise exception 'Provider subscription id required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:extra:' || trim(provider_subscription), 0)
  );

  select user_id into account_user
    from public.extra_member_access_subscriptions
   where provider_subscription_id = trim(provider_subscription)
   for update;
  if not found then return false; end if;

  update public.extra_member_access_subscriptions
     set auto_renew = false,
         status = case when current_period_end > pg_catalog.now() then 'cancel_at_period_end' else 'expired' end,
         updated_at = pg_catalog.now()
   where user_id = account_user;

  update public.relationship_member_subscriptions
     set auto_renew = false,
         status = case when current_period_end > pg_catalog.now() then 'cancel_at_period_end' else 'expired' end,
         updated_at = pg_catalog.now()
   where member_user_id = account_user
     and status in ('active', 'cancel_at_period_end');

  return true;
end;
$$;

create or replace function public.expire_extra_member_subscription(
  provider_subscription text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_subscription public.extra_member_access_subscriptions%rowtype;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if provider_subscription is null or trim(provider_subscription) = '' then
    raise exception 'Provider subscription id required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:extra:' || trim(provider_subscription), 0)
  );

  select * into account_subscription
    from public.extra_member_access_subscriptions
   where provider_subscription_id = trim(provider_subscription)
   for update;
  if not found then return false; end if;
  if account_subscription.current_period_end > pg_catalog.now() then return false; end if;

  update public.extra_member_access_subscriptions
     set status = 'expired', auto_renew = false, updated_at = pg_catalog.now()
   where user_id = account_subscription.user_id;

  update public.relationship_member_subscriptions
     set status = 'expired', auto_renew = false, updated_at = pg_catalog.now()
   where member_user_id = account_subscription.user_id
     and current_period_end <= pg_catalog.now()
     and status in ('active', 'cancel_at_period_end', 'payment_failed');

  delete from public.relationship_members rm
   using public.relationship_member_subscriptions s
   where s.member_user_id = account_subscription.user_id
     and s.relationship_id = rm.relationship_id
     and s.member_user_id = rm.user_id
     and s.status = 'expired';

  return true;
end;
$$;

create or replace function public.revoke_extra_member_subscription(
  provider_subscription text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_user uuid;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if provider_subscription is null or trim(provider_subscription) = '' then
    raise exception 'Provider subscription id required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:extra:' || trim(provider_subscription), 0)
  );

  select user_id into account_user
    from public.extra_member_access_subscriptions
   where provider_subscription_id = trim(provider_subscription)
   for update;
  if not found then return false; end if;

  update public.extra_member_access_subscriptions
     set status = 'expired', auto_renew = false, updated_at = pg_catalog.now()
   where user_id = account_user;

  update public.relationship_member_subscriptions
     set status = 'expired', auto_renew = false, updated_at = pg_catalog.now()
   where member_user_id = account_user
     and status <> 'expired';

  delete from public.relationship_members rm
   using public.relationship_member_subscriptions s
   where s.member_user_id = account_user
     and s.relationship_id = rm.relationship_id
     and s.member_user_id = rm.user_id;

  return true;
end;
$$;

revoke execute on function public.renew_extra_member_subscription(text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.cancel_extra_member_subscription(text)
  from public, anon, authenticated;
revoke execute on function public.expire_extra_member_subscription(text)
  from public, anon, authenticated;
revoke execute on function public.revoke_extra_member_subscription(text)
  from public, anon, authenticated;

grant execute on function public.renew_extra_member_subscription(text, timestamptz, timestamptz)
  to service_role;
grant execute on function public.cancel_extra_member_subscription(text)
  to service_role;
grant execute on function public.expire_extra_member_subscription(text)
  to service_role;
grant execute on function public.revoke_extra_member_subscription(text)
  to service_role;
