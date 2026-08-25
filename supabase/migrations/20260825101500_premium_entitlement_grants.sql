-- Track each non-subscription Premium time grant independently so a refund or
-- sponsorship revocation removes only the entitlement that source created.
-- Production had no premium_gifts, premium_sponsorship_credits or user_plans rows
-- when this pre-launch migration was authored, so the obsolete sponsorship-credit
-- surface can be retired fail-closed rather than migrated ambiguously.

create table if not exists public.premium_time_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_kind text not null check (source_kind in ('premium_gift','organization_sponsorship')),
  source_id uuid not null,
  duration_months smallint not null check (duration_months between 1 and 24),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  granted_at timestamptz not null default pg_catalog.now(),
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique(source_kind, source_id),
  check (ends_at > starts_at),
  check (revoked_at is null or revoked_at >= granted_at)
);

create index if not exists premium_time_grants_user_active_idx
  on public.premium_time_grants(user_id, starts_at, ends_at)
  where revoked_at is null;

alter table public.premium_time_grants enable row level security;
revoke all on table public.premium_time_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.premium_time_grants to service_role;

create or replace function private.premium_non_grant_end(target_user uuid)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(
    pg_catalog.now(),
    coalesce((
      select p.trial_ends_at
        from public.user_plans p
       where p.user_id = target_user
         and p.trial_ends_at > pg_catalog.now()
    ), '-infinity'::timestamptz),
    coalesce((
      select max(s.current_period_end)
        from public.premium_store_subscription_members m
        join public.premium_store_subscriptions s on s.id=m.subscription_id
       where m.user_id=target_user
         and s.status in ('active','grace_period','cancel_at_period_end')
         and s.current_period_end > pg_catalog.now()
    ), '-infinity'::timestamptz)
  );
$$;

create or replace function private.recompute_premium_projection(
  target_user uuid,
  reflow_remaining_grants boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_row public.user_plans%rowtype;
  base_end timestamptz;
  store_end timestamptz;
  grant_end timestamptz;
  effective_end timestamptz;
  has_store boolean := false;
  has_grant boolean := false;
  grant_row public.premium_time_grants%rowtype;
  remaining interval;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Service role required';
  end if;
  if target_user is null then raise exception 'User required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:premium-projection:' || target_user::text,0)
  );

  insert into public.user_plans(user_id)
  values(target_user)
  on conflict(user_id) do nothing;

  select * into plan_row
    from public.user_plans p
   where p.user_id=target_user
   for update;

  select max(s.current_period_end) into store_end
    from public.premium_store_subscription_members m
    join public.premium_store_subscriptions s on s.id=m.subscription_id
   where m.user_id=target_user
     and s.status in ('active','grace_period','cancel_at_period_end')
     and s.current_period_end > pg_catalog.now();
  has_store := store_end is not null;

  base_end := greatest(
    pg_catalog.now(),
    coalesce(plan_row.trial_ends_at,'-infinity'::timestamptz),
    coalesce(store_end,'-infinity'::timestamptz)
  );

  -- When an entitlement source disappears immediately (refund, revocation,
  -- provider hold/expiry), keep only the unconsumed duration of surviving time
  -- grants and pack it forward from the remaining non-grant entitlement. This
  -- avoids both gaps and accidentally recreating already-consumed gift time.
  if reflow_remaining_grants then
    for grant_row in
      select g.*
        from public.premium_time_grants g
       where g.user_id=target_user
         and g.revoked_at is null
         and g.ends_at > pg_catalog.now()
       order by g.starts_at,g.granted_at,g.id
       for update
    loop
      remaining := grant_row.ends_at - greatest(pg_catalog.now(),grant_row.starts_at);
      if remaining > interval '0 seconds' then
        update public.premium_time_grants g
           set starts_at=base_end,
               ends_at=base_end+remaining,
               updated_at=pg_catalog.now()
         where g.id=grant_row.id;
        base_end := base_end+remaining;
      end if;
    end loop;
  end if;

  select max(g.ends_at), exists(
    select 1 from public.premium_time_grants x
     where x.user_id=target_user
       and x.revoked_at is null
       and x.ends_at > pg_catalog.now()
  ) into grant_end,has_grant
    from public.premium_time_grants g
   where g.user_id=target_user
     and g.revoked_at is null
     and g.ends_at > pg_catalog.now();

  effective_end := greatest(
    pg_catalog.now(),
    coalesce(store_end,'-infinity'::timestamptz),
    coalesce(grant_end,'-infinity'::timestamptz),
    coalesce(case when plan_row.trial_ends_at>pg_catalog.now() then plan_row.trial_ends_at end,'-infinity'::timestamptz)
  );

  if has_store or has_grant then
    update public.user_plans p
       set plan='premium',
           premium_ends_at=effective_end,
           sponsored_by=null,
           updated_at=pg_catalog.now()
     where p.user_id=target_user;
    return effective_end;
  elsif plan_row.trial_ends_at is not null and plan_row.trial_ends_at>pg_catalog.now() then
    update public.user_plans p
       set plan='trial',premium_ends_at=null,sponsored_by=null,updated_at=pg_catalog.now()
     where p.user_id=target_user;
    return plan_row.trial_ends_at;
  else
    update public.user_plans p
       set plan='free',premium_ends_at=null,sponsored_by=null,updated_at=pg_catalog.now()
     where p.user_id=target_user;
    return null;
  end if;
end;
$$;

create or replace function private.add_premium_time_grant(
  target_user uuid,
  grant_source_kind text,
  grant_source_id uuid,
  grant_months integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_end timestamptz;
  existing public.premium_time_grants%rowtype;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Service role required';
  end if;
  if target_user is null or grant_source_id is null then raise exception 'Grant identity required'; end if;
  if grant_source_kind not in ('premium_gift','organization_sponsorship') then raise exception 'Unsupported Premium grant source'; end if;
  if grant_months is null or grant_months<1 or grant_months>24 then raise exception 'Premium grant must cover 1 to 24 months'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:premium-projection:' || target_user::text,0)
  );

  select * into existing from public.premium_time_grants g
   where g.source_kind=grant_source_kind and g.source_id=grant_source_id
   for update;
  if found then
    if existing.user_id<>target_user or existing.duration_months<>grant_months then
      raise exception 'Premium grant identity mismatch';
    end if;
    if existing.revoked_at is not null then raise exception 'Revoked Premium grant cannot be replayed'; end if;
    return private.recompute_premium_projection(target_user,false);
  end if;

  base_end := greatest(
    private.premium_non_grant_end(target_user),
    coalesce((
      select max(g.ends_at) from public.premium_time_grants g
       where g.user_id=target_user and g.revoked_at is null and g.ends_at>pg_catalog.now()
    ),'-infinity'::timestamptz)
  );

  insert into public.premium_time_grants(
    user_id,source_kind,source_id,duration_months,starts_at,ends_at
  ) values(
    target_user,grant_source_kind,grant_source_id,grant_months::smallint,
    base_end,base_end+pg_catalog.make_interval(months=>grant_months)
  );
  return private.recompute_premium_projection(target_user,false);
end;
$$;

revoke execute on function private.premium_non_grant_end(uuid) from public,anon,authenticated,service_role;
revoke execute on function private.recompute_premium_projection(uuid,boolean) from public,anon,authenticated;
revoke execute on function private.add_premium_time_grant(uuid,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.recompute_premium_projection(uuid,boolean) to service_role;

-- Keep the established service-only signature used by subscription lifecycle
-- code, but project from source ledgers instead of preserving an opaque
-- premium_ends_at value that may contain a refunded gift.
create or replace function public.sync_store_premium_user_plan(
  target_user uuid,
  removed_period_end timestamptz default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Service role required';
  end if;
  return private.recompute_premium_projection(target_user,removed_period_end is not null);
end;
$$;
revoke execute on function public.sync_store_premium_user_plan(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_store_premium_user_plan(uuid,timestamptz) to service_role;

-- Gift creation is one-month only in v1 and provider payment identity is immutable.
create or replace function public.confirm_premium_gift_payment(
  purchaser uuid,
  recipient text,
  months smallint,
  provider_name text,
  provider_payment text
)
returns table(gift_id uuid,token text,claim_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.premium_gifts%rowtype;
  normalized_recipient text:=lower(trim(coalesce(recipient,'')));
  normalized_provider text:=lower(trim(coalesce(provider_name,'')));
  normalized_payment text:=trim(coalesce(provider_payment,''));
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Service role required'; end if;
  if purchaser is null then raise exception 'Purchaser required'; end if;
  if position('@' in normalized_recipient)<2 then raise exception 'Valid recipient email required'; end if;
  if months is distinct from 1 then raise exception 'Premium gifts are one month only'; end if;
  if normalized_provider not in ('apple','google') then raise exception 'Verified store provider required'; end if;
  if normalized_payment='' then raise exception 'Provider payment id required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:premium-gift-payment:'||normalized_provider||':'||normalized_payment,0)
  );
  select * into g from public.premium_gifts x where x.provider_payment_id=normalized_payment for update;
  if found then
    if g.purchaser_id is distinct from purchaser
       or g.recipient_email<>normalized_recipient
       or g.duration_months<>1
       or g.payment_provider is distinct from normalized_provider then
      raise exception 'Premium gift payment identity mismatch';
    end if;
    return query select g.id,g.token,g.claim_expires_at;
    return;
  end if;

  insert into public.premium_gifts(
    purchaser_id,recipient_email,duration_months,payment_provider,provider_payment_id
  ) values(purchaser,normalized_recipient,1,normalized_provider,normalized_payment)
  returning * into g;
  return query select g.id,g.token,g.claim_expires_at;
end;
$$;
revoke execute on function public.confirm_premium_gift_payment(uuid,text,smallint,text,text) from public,anon,authenticated;
grant execute on function public.confirm_premium_gift_payment(uuid,text,smallint,text,text) to service_role;

create or replace function public.claim_premium_gift(gift_id uuid,gift_token text default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.premium_gifts%rowtype;
  uid uuid:=(select auth.uid());
  verified_email text;
  new_end timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select lower(u.email) into verified_email from auth.users u
   where u.id=uid and u.email_confirmed_at is not null;
  if verified_email is null then raise exception 'Verified email required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('talktwo:premium-gift:'||gift_id::text,0));
  select * into g from public.premium_gifts x where x.id=gift_id for update;
  if not found then raise exception 'Gift not found'; end if;
  if g.status<>'paid' then raise exception 'Gift is not available'; end if;
  if g.claim_expires_at<=pg_catalog.now() then
    update public.premium_gifts set status='expired',updated_at=pg_catalog.now() where id=g.id;
    raise exception 'Gift claim window has expired';
  end if;
  if g.recipient_email<>verified_email then raise exception 'This Premium gift belongs to a different account'; end if;
  if gift_token is not null and gift_token<>g.token then raise exception 'Invalid gift link'; end if;

  update public.premium_gifts
     set status='claimed',claimed_by=uid,claimed_at=pg_catalog.now(),updated_at=pg_catalog.now()
   where id=g.id;
  new_end:=private.add_premium_time_grant(uid,'premium_gift',g.id,g.duration_months);
  return new_end;
end;
$$;
revoke execute on function public.claim_premium_gift(uuid,text) from public,anon;
grant execute on function public.claim_premium_gift(uuid,text) to authenticated,service_role;

create or replace function public.refund_premium_gift_by_provider_payment(
  provider_name text,
  provider_payment text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.premium_gifts%rowtype;
  normalized_provider text:=lower(trim(coalesce(provider_name,'')));
  normalized_payment text:=trim(coalesce(provider_payment,''));
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Service role required'; end if;
  if normalized_provider not in ('apple','google') or normalized_payment='' then raise exception 'Verified provider payment required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:premium-gift-payment:'||normalized_provider||':'||normalized_payment,0)
  );
  select * into g from public.premium_gifts x
   where x.payment_provider=normalized_provider and x.provider_payment_id=normalized_payment
   for update;
  if not found then return false; end if;
  if g.status='refunded' then return true; end if;

  update public.premium_gifts set status='refunded',updated_at=pg_catalog.now() where id=g.id;
  if g.status='claimed' then
    update public.premium_time_grants t
       set revoked_at=coalesce(t.revoked_at,pg_catalog.now()),updated_at=pg_catalog.now()
     where t.source_kind='premium_gift' and t.source_id=g.id;
    if g.claimed_by is not null then perform private.recompute_premium_projection(g.claimed_by,true); end if;
  end if;
  return true;
end;
$$;
revoke execute on function public.refund_premium_gift_by_provider_payment(text,text) from public,anon,authenticated;
grant execute on function public.refund_premium_gift_by_provider_payment(text,text) to service_role;

-- Replace organization claim projection with source-specific time grants.
create or replace function public.claim_my_organization_sponsorships()
returns table(sponsorship_id uuid,sponsor_name text,sponsored_months integer,entitlement_ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid:=(select auth.uid());
  verified_email text;
  verified_email_hash text;
  sponsorship public.organization_sponsorships%rowtype;
  projected_end timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select lower(u.email) into verified_email from auth.users u
   where u.id=uid and u.email_confirmed_at is not null;
  if verified_email is null then raise exception 'Verified email required'; end if;
  verified_email_hash:=pg_catalog.encode(extensions.digest(verified_email,'sha256'),'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('talktwo:org-sponsor:'||uid::text,0));
  update public.organization_sponsorships s
     set status='expired',recipient_email_hash=null,updated_at=pg_catalog.now()
   where s.recipient_email_hash=verified_email_hash and s.status='pending' and s.claim_expires_at<=pg_catalog.now();

  for sponsorship in
    select s.* from public.organization_sponsorships s
     where s.recipient_email_hash=verified_email_hash and s.status='pending' and s.claim_expires_at>pg_catalog.now()
     order by s.created_at,s.id for update
  loop
    update public.organization_sponsorships s
       set status='claimed',recipient_email_hash=null,claimed_by=uid,claimed_at=pg_catalog.now(),
           premium_ends_at=pg_catalog.now()+interval '1 second',updated_at=pg_catalog.now()
     where s.id=sponsorship.id and s.status='pending';
    projected_end:=private.add_premium_time_grant(uid,'organization_sponsorship',sponsorship.id,sponsorship.duration_months);
    update public.organization_sponsorships s set premium_ends_at=projected_end,updated_at=pg_catalog.now() where s.id=sponsorship.id;

    sponsorship_id:=sponsorship.id;
    sponsor_name:=sponsorship.organization_name;
    sponsored_months:=sponsorship.duration_months;
    entitlement_ends_at:=projected_end;
    return next;
  end loop;
end;
$$;
revoke execute on function public.claim_my_organization_sponsorships() from public,anon;
grant execute on function public.claim_my_organization_sponsorships() to authenticated,service_role;

create or replace function public.revoke_organization_sponsorship(sponsorship_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare s public.organization_sponsorships%rowtype;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Service role required'; end if;
  select * into s from public.organization_sponsorships x where x.id=sponsorship_id for update;
  if not found then return false; end if;
  if s.status='revoked' then return true; end if;

  if s.status='claimed' then
    update public.premium_time_grants g set revoked_at=coalesce(g.revoked_at,pg_catalog.now()),updated_at=pg_catalog.now()
     where g.source_kind='organization_sponsorship' and g.source_id=s.id;
    update public.organization_sponsorships
       set status='revoked',recipient_email_hash=null,premium_ends_at=null,updated_at=pg_catalog.now()
     where id=s.id;
    if s.claimed_by is not null then perform private.recompute_premium_projection(s.claimed_by,true); end if;
  elsif s.status='pending' then
    update public.organization_sponsorships set status='revoked',recipient_email_hash=null,updated_at=pg_catalog.now() where id=s.id;
  else
    return false;
  end if;
  return true;
end;
$$;
revoke execute on function public.revoke_organization_sponsorship(uuid) from public,anon,authenticated;
grant execute on function public.revoke_organization_sponsorship(uuid) to service_role;

-- Retire the legacy parallel premium_sponsorship_credits flow. Do not silently
-- destroy data if this supposedly-unused pre-launch table changes before release.
do $$
begin
  if exists(select 1 from public.premium_sponsorship_credits limit 1) then
    raise exception 'Legacy premium_sponsorship_credits contains data; manual migration required';
  end if;
end $$;

drop function if exists public.claim_premium_sponsorship(text);
drop function if exists public.claim_targeted_premium_sponsorship(uuid);
drop function if exists public.list_my_available_premium_gifts();
drop function if exists public.list_my_premium_sponsorships();
drop function if exists public.rotate_premium_sponsorship_claim(uuid);
drop function if exists public.activate_premium_sponsorship(uuid,uuid);
drop function if exists public.create_premium_sponsorship_credit(uuid,smallint,uuid,text,text);
drop table public.premium_sponsorship_credits restrict;
