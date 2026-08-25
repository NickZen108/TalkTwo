-- Observer -> participant is an access-control change as well as a billing change.
-- Require fresh unanimous approval from every *current* other chat member and a
-- verified native subscription replacement before granting writing access. A user
-- who already has an account-wide participant entitlement still needs the fresh
-- chat approval, but does not pay a second time.

create table if not exists public.member_write_upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'awaiting_approvals' check (
    status in ('awaiting_approvals','awaiting_payment','checkout_pending','completed','rejected','expired')
  ),
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '24 hours'),
  completed_at timestamptz,
  check (expires_at > created_at),
  check ((status = 'completed') = (completed_at is not null))
);

create unique index if not exists member_write_upgrade_open_uidx
  on public.member_write_upgrade_requests(relationship_id, member_user_id)
  where status in ('awaiting_approvals','awaiting_payment','checkout_pending');

create table if not exists public.member_write_upgrade_approvals (
  request_id uuid not null references public.member_write_upgrade_requests(id) on delete cascade,
  approver_id uuid not null references auth.users(id) on delete cascade,
  decision boolean,
  decided_at timestamptz,
  primary key(request_id, approver_id),
  check ((decision is null and decided_at is null) or (decision is not null and decided_at is not null))
);

alter table public.member_write_upgrade_requests enable row level security;
alter table public.member_write_upgrade_approvals enable row level security;
revoke all on table public.member_write_upgrade_requests from public, anon, authenticated;
revoke all on table public.member_write_upgrade_approvals from public, anon, authenticated;
grant select, insert, update, delete on table public.member_write_upgrade_requests to service_role;
grant select, insert, update, delete on table public.member_write_upgrade_approvals to service_role;

alter table public.billing_checkout_intents
  add column if not exists upgrade_request_id uuid
  references public.member_write_upgrade_requests(id) on delete set null;
create index if not exists billing_checkout_intents_upgrade_request_idx
  on public.billing_checkout_intents(upgrade_request_id)
  where upgrade_request_id is not null;

create or replace function private.member_write_upgrade_is_unanimous(req_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists(
    select 1 from public.member_write_upgrade_requests r
    join public.relationship_members requester
      on requester.relationship_id=r.relationship_id
     and requester.user_id=r.member_user_id
    where r.id=req_id and requester.role='observer'
  )
  and exists(
    select 1 from public.member_write_upgrade_requests r
    join public.relationship_members m on m.relationship_id=r.relationship_id
    where r.id=req_id and m.user_id<>r.member_user_id
  )
  and not exists(
    select 1
      from public.member_write_upgrade_requests r
      join public.relationship_members m on m.relationship_id=r.relationship_id
      left join public.member_write_upgrade_approvals a
        on a.request_id=r.id and a.approver_id=m.user_id
     where r.id=req_id
       and m.user_id<>r.member_user_id
       and a.decision is distinct from true
  );
$$;

create or replace function private.activate_member_write_upgrade_from_existing_access(req_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.member_write_upgrade_requests%rowtype;
  account_access public.extra_member_access_subscriptions%rowtype;
  rel_sub public.relationship_member_subscriptions%rowtype;
begin
  select * into request from public.member_write_upgrade_requests r where r.id=req_id for update;
  if not found or request.status not in ('awaiting_approvals','awaiting_payment')
     or request.expires_at<=pg_catalog.now() then return false; end if;
  if not private.member_write_upgrade_is_unanimous(request.id) then return false; end if;

  select * into account_access
    from public.extra_member_access_subscriptions s
   where s.user_id=request.member_user_id
     and s.access_role='participant'
     and s.status in ('active','cancel_at_period_end')
     and s.current_period_end>pg_catalog.now()
   for update;
  if not found then return false; end if;

  select * into rel_sub
    from public.relationship_member_subscriptions s
   where s.relationship_id=request.relationship_id
     and s.member_user_id=request.member_user_id
     and s.role='observer'
     and s.status='active'
     and s.current_period_end>pg_catalog.now()
   for update;
  if not found then return false; end if;

  update public.relationship_member_subscriptions
     set role='participant', price_dkk=99, updated_at=pg_catalog.now()
   where id=rel_sub.id;
  update public.relationship_members
     set role='participant'
   where relationship_id=request.relationship_id and user_id=request.member_user_id;
  update public.member_invitations set role='participant' where id=rel_sub.invitation_id;
  update public.member_write_upgrade_requests
     set status='completed', completed_at=pg_catalog.now()
   where id=request.id;
  return true;
end;
$$;

create or replace function public.create_member_write_upgrade_request(rel_id uuid)
returns table(request_id uuid, relationship_id uuid, status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  request public.member_write_upgrade_requests%rowtype;
  approver_count integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('talktwo:write-upgrade:'||rel_id::text||':'||uid::text,0));

  if not exists(
    select 1 from public.relationships r
    join public.relationship_members m on m.relationship_id=r.id
    where r.id=rel_id and r.status='active' and m.user_id=uid and m.role='observer'
  ) then raise exception 'An active read-only membership is required'; end if;
  if not exists(
    select 1 from public.relationship_member_subscriptions s
    where s.relationship_id=rel_id and s.member_user_id=uid
      and s.role='observer' and s.status='active' and s.current_period_end>pg_catalog.now()
  ) then raise exception 'An active paid read-only membership is required'; end if;
  if not exists(
    select 1 from public.extra_member_access_subscriptions s
    where s.user_id=uid and s.status in ('active','cancel_at_period_end')
      and s.current_period_end>pg_catalog.now()
  ) then raise exception 'An active extra-member subscription is required'; end if;

  update public.member_write_upgrade_requests
     set status='expired'
   where relationship_id=rel_id and member_user_id=uid
     and status in ('awaiting_approvals','awaiting_payment','checkout_pending');

  insert into public.member_write_upgrade_requests(relationship_id,member_user_id)
  values(rel_id,uid) returning * into request;

  insert into public.member_write_upgrade_approvals(request_id,approver_id)
  select request.id,m.user_id
    from public.relationship_members m
   where m.relationship_id=rel_id and m.user_id<>uid
  on conflict do nothing;
  get diagnostics approver_count=row_count;
  if approver_count<1 then raise exception 'At least one other current chat member must approve'; end if;

  return query select request.id,request.relationship_id,request.status,request.expires_at;
end;
$$;

create or replace function public.list_my_member_write_upgrade_requests(rel_id uuid default null)
returns table(request_id uuid, relationship_id uuid, status text, expires_at timestamptz, completed_at timestamptz)
language sql
volatile
security definer
set search_path = ''
as $$
  update public.member_write_upgrade_requests r
     set status='expired'
   where r.member_user_id=(select auth.uid())
     and r.status in ('awaiting_approvals','awaiting_payment','checkout_pending')
     and r.expires_at<=pg_catalog.now();
  select r.id,r.relationship_id,r.status,r.expires_at,r.completed_at
    from public.member_write_upgrade_requests r
   where r.member_user_id=(select auth.uid())
     and (rel_id is null or r.relationship_id=rel_id)
   order by r.created_at desc limit 20;
$$;

create or replace function public.list_pending_member_write_upgrade_approvals(rel_id uuid default null)
returns table(request_id uuid, relationship_id uuid, requester_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  -- If somebody joined after the request was created they are a current member
  -- too, so add their still-required approval before returning the queue.
  insert into public.member_write_upgrade_approvals(request_id,approver_id)
  select r.id,uid
    from public.member_write_upgrade_requests r
    join public.relationship_members m
      on m.relationship_id=r.relationship_id and m.user_id=uid
   where r.member_user_id<>uid
     and r.status='awaiting_approvals'
     and r.expires_at>pg_catalog.now()
     and (rel_id is null or r.relationship_id=rel_id)
  on conflict do nothing;

  return query
  select r.id,r.relationship_id,r.member_user_id,r.expires_at
    from public.member_write_upgrade_requests r
    join public.member_write_upgrade_approvals a
      on a.request_id=r.id and a.approver_id=uid
   where a.decision is null
     and r.status='awaiting_approvals'
     and r.expires_at>pg_catalog.now()
     and (rel_id is null or r.relationship_id=rel_id)
   order by r.created_at;
end;
$$;

create or replace function public.respond_member_write_upgrade(req_id uuid, approve boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  request public.member_write_upgrade_requests%rowtype;
  changed integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into request from public.member_write_upgrade_requests r where r.id=req_id for update;
  if not found or request.status<>'awaiting_approvals' then raise exception 'No pending write-access request'; end if;
  if request.expires_at<=pg_catalog.now() then
    update public.member_write_upgrade_requests set status='expired' where id=request.id;
    return 'expired';
  end if;
  if not exists(select 1 from public.relationship_members m where m.relationship_id=request.relationship_id and m.user_id=uid and uid<>request.member_user_id) then
    raise exception 'Current chat membership is required';
  end if;

  insert into public.member_write_upgrade_approvals(request_id,approver_id)
  values(request.id,uid) on conflict do nothing;
  update public.member_write_upgrade_approvals
     set decision=approve,decided_at=pg_catalog.now()
   where request_id=request.id and approver_id=uid and decision is null;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'No pending approval for this request'; end if;

  if not approve then
    update public.member_write_upgrade_requests set status='rejected' where id=request.id;
    return 'rejected';
  end if;
  if not private.member_write_upgrade_is_unanimous(request.id) then return 'awaiting_approvals'; end if;
  if private.activate_member_write_upgrade_from_existing_access(request.id) then return 'completed'; end if;
  update public.member_write_upgrade_requests set status='awaiting_payment' where id=request.id;
  return 'awaiting_payment';
end;
$$;

-- The store product is the normal 99 DKK/month participant subscription. The
-- nominal 99 DKK catalog value is used for product/intent binding; Apple/Google
-- calculate and display any actual prorated replacement charge.
create or replace function public.create_member_upgrade_checkout_intent(rel_id uuid)
returns table(intent_id uuid, amount_minor integer, currency text, recurring boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  request public.member_write_upgrade_requests%rowtype;
  expiry timestamptz := pg_catalog.now()+interval '30 minutes';
  new_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into request
    from public.member_write_upgrade_requests r
   where r.relationship_id=rel_id and r.member_user_id=uid
     and r.status='awaiting_payment' and r.expires_at>pg_catalog.now()
   order by r.created_at desc limit 1 for update;
  if not found then raise exception 'Write access is not ready for store upgrade'; end if;
  if not private.member_write_upgrade_is_unanimous(request.id) then
    update public.member_write_upgrade_requests set status='awaiting_approvals' where id=request.id;
    raise exception 'Every current chat member must approve writing access first';
  end if;
  if private.activate_member_write_upgrade_from_existing_access(request.id) then
    raise exception 'Writing access is already covered by your current subscription; refresh the chat';
  end if;
  if not exists(
    select 1 from public.extra_member_access_subscriptions s
    where s.user_id=uid and s.access_role='observer'
      and s.status in ('active','cancel_at_period_end') and s.current_period_end>pg_catalog.now()
  ) then raise exception 'An active read-only subscription is required'; end if;

  update public.billing_checkout_intents
     set status='cancelled',updated_at=pg_catalog.now()
   where user_id=uid and upgrade_request_id=request.id
     and status in ('created','provider_ready') and completed_at is null;

  insert into public.billing_checkout_intents(
    user_id,kind,relationship_id,member_user_id,upgrade_request_id,
    amount_minor,currency,recurring,expires_at
  ) values(uid,'extra_member_start',rel_id,uid,request.id,9900,'dkk',true,expiry)
  returning id into new_id;
  update public.member_write_upgrade_requests set status='checkout_pending' where id=request.id;
  return query select new_id,9900,'dkk'::text,true,expiry;
end;
$$;

create or replace function public.get_member_upgrade_verification_context(intent_id uuid, purchaser uuid)
returns table(payment_provider text, provider_subscription_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.payment_provider,s.provider_subscription_id
    from public.billing_checkout_intents i
    join public.member_write_upgrade_requests r on r.id=i.upgrade_request_id
    join public.extra_member_access_subscriptions s on s.user_id=i.user_id
   where i.id=intent_id and i.user_id=purchaser
     and i.kind='extra_member_start' and i.upgrade_request_id is not null
     and i.status in ('created','provider_ready') and i.expires_at>pg_catalog.now()
     and r.member_user_id=purchaser and r.status='checkout_pending'
     and r.expires_at>pg_catalog.now()
     and s.access_role='observer' and s.status in ('active','cancel_at_period_end')
     and s.current_period_end>pg_catalog.now();
$$;

create or replace function public.confirm_verified_member_write_upgrade(
  req_id uuid,
  member_user uuid,
  provider_platform text,
  provider_payment text,
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
  request public.member_write_upgrade_requests%rowtype;
  rel_sub public.relationship_member_subscriptions%rowtype;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Service role required'; end if;
  if provider_platform not in ('apple','google') then raise exception 'Unsupported store platform'; end if;
  if nullif(trim(coalesce(provider_payment,'')),'') is null
     or nullif(trim(coalesce(provider_subscription,'')),'') is null then raise exception 'Verified provider identifiers are required'; end if;
  if period_start is null or period_end is null or period_end<=period_start
     or period_end>period_start+interval '32 days' or period_end<=pg_catalog.now() then
    raise exception 'A current monthly subscription period is required';
  end if;

  select * into request from public.member_write_upgrade_requests r where r.id=req_id for update;
  if not found or request.member_user_id<>member_user or request.status<>'checkout_pending'
     or request.expires_at<=pg_catalog.now() then raise exception 'Approved write-access request required'; end if;
  if not private.member_write_upgrade_is_unanimous(request.id) then raise exception 'Write-access approval is no longer unanimous'; end if;

  select * into rel_sub from public.relationship_member_subscriptions s
   where s.relationship_id=request.relationship_id and s.member_user_id=member_user
     and s.role='observer' and s.status='active' and s.current_period_end>pg_catalog.now()
   for update;
  if not found then raise exception 'Active read-only relationship subscription required'; end if;

  update public.extra_member_access_subscriptions
     set access_role='participant',price_dkk=99,status='active',auto_renew=true,
         current_period_start=period_start,current_period_end=period_end,
         payment_provider=provider_platform,provider_subscription_id=trim(provider_subscription),
         approval_withdrawn_at=null,updated_at=pg_catalog.now()
   where user_id=member_user and access_role='observer'
     and status in ('active','cancel_at_period_end') and current_period_end>pg_catalog.now();
  if not found then raise exception 'Active read-only account subscription required'; end if;

  -- All still-live per-chat rows follow the replacement subscription identity,
  -- but only the freshly approved target chat changes from observer to participant.
  update public.relationship_member_subscriptions
     set payment_provider=provider_platform,provider_subscription_id=trim(provider_subscription),updated_at=pg_catalog.now()
   where member_user_id=member_user and status<>'expired';
  update public.relationship_member_subscriptions
     set role='participant',price_dkk=99,status='active',auto_renew=true,
         current_period_start=period_start,current_period_end=period_end,
         last_upgrade_payment_id=trim(provider_payment),updated_at=pg_catalog.now()
   where id=rel_sub.id;
  update public.relationship_members set role='participant'
   where relationship_id=request.relationship_id and user_id=member_user;
  update public.member_invitations set role='participant' where id=rel_sub.invitation_id;
  update public.member_write_upgrade_requests
     set status='completed',completed_at=pg_catalog.now() where id=request.id;
  return 'participant';
end;
$$;

-- Disable the legacy path that could grant writing access from a generic payment
-- reference without fresh approval or verified subscription replacement evidence.
create or replace function public.confirm_member_write_upgrade(rel_id uuid, member_user uuid, provider_payment text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Service role required'; end if;
  raise exception 'Legacy write upgrade is disabled; verified subscription replacement is required';
end;
$$;

-- Keep the existing store processor contract: participant product remains
-- billing_intent_kind=extra_member_start. The nullable upgrade_request_id tells
-- completion whether this is a first subscription or an approved replacement.
create or replace function public.complete_billing_intent(
  intent_id uuid,
  provider_payment text,
  provider_subscription text default null,
  period_start timestamptz default null,
  period_end timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  intent public.billing_checkout_intents%rowtype;
  result text;
begin
  if current_user not in ('postgres','service_role','supabase_admin') then raise exception 'Service role required'; end if;
  select * into intent from public.billing_checkout_intents where id=intent_id for update;
  if not found then raise exception 'Billing intent not found'; end if;
  if intent.status='completed' then return 'completed'; end if;
  if intent.status not in ('created','provider_ready') then raise exception 'Billing intent is not completable'; end if;
  if intent.expires_at<=pg_catalog.now() then
    update public.billing_checkout_intents set status='expired',updated_at=pg_catalog.now() where id=intent.id;
    raise exception 'Billing intent expired';
  end if;

  if intent.kind='extra_member_start' and intent.upgrade_request_id is not null then
    if provider_subscription is null or period_start is null or period_end is null then raise exception 'Replacement subscription period data is required'; end if;
    result:=public.confirm_verified_member_write_upgrade(
      intent.upgrade_request_id,intent.member_user_id,intent.provider,
      provider_payment,provider_subscription,period_start,period_end
    );
  elsif intent.kind='extra_member_start' then
    if provider_subscription is null or period_start is null or period_end is null then raise exception 'Subscription period data is required'; end if;
    result:=public.confirm_extra_member_payment(intent.invitation_id,intent.provider,provider_subscription,period_start,period_end);
  elsif intent.kind='extra_member_upgrade' then
    raise exception 'Legacy write upgrade is disabled';
  elsif intent.kind='premium_gift' then
    if intent.duration_months is distinct from 1::smallint or intent.amount_minor<>5900 then
      raise exception 'Only the one-month 59 DKK Premium gift is supported';
    end if;
    result:=public.confirm_premium_gift_payment(intent.user_id,intent.recipient_email,1,intent.provider,provider_payment)::text;
  else
    raise exception 'Unsupported billing intent';
  end if;
  update public.billing_checkout_intents
     set status='completed',provider_payment_reference=nullif(trim(provider_payment),''),
         completed_at=pg_catalog.now(),updated_at=pg_catalog.now()
   where id=intent.id;
  return coalesce(result,'completed');
end;
$$;

revoke execute on function private.member_write_upgrade_is_unanimous(uuid) from public,anon,authenticated,service_role;
revoke execute on function private.activate_member_write_upgrade_from_existing_access(uuid) from public,anon,authenticated,service_role;

revoke execute on function public.create_member_write_upgrade_request(uuid) from public,anon;
revoke execute on function public.list_my_member_write_upgrade_requests(uuid) from public,anon;
revoke execute on function public.list_pending_member_write_upgrade_approvals(uuid) from public,anon;
revoke execute on function public.respond_member_write_upgrade(uuid,boolean) from public,anon;
revoke execute on function public.create_member_upgrade_checkout_intent(uuid) from public,anon;
grant execute on function public.create_member_write_upgrade_request(uuid) to authenticated;
grant execute on function public.list_my_member_write_upgrade_requests(uuid) to authenticated;
grant execute on function public.list_pending_member_write_upgrade_approvals(uuid) to authenticated;
grant execute on function public.respond_member_write_upgrade(uuid,boolean) to authenticated;
grant execute on function public.create_member_upgrade_checkout_intent(uuid) to authenticated;

revoke execute on function public.get_member_write_upgrade_offer(uuid) from public,anon,authenticated;
grant execute on function public.get_member_write_upgrade_offer(uuid) to service_role;
revoke execute on function public.get_member_upgrade_verification_context(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.confirm_verified_member_write_upgrade(uuid,uuid,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke execute on function public.confirm_member_write_upgrade(uuid,uuid,text) from public,anon,authenticated;
revoke execute on function public.complete_billing_intent(uuid,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.get_member_upgrade_verification_context(uuid,uuid) to service_role;
grant execute on function public.confirm_verified_member_write_upgrade(uuid,uuid,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.confirm_member_write_upgrade(uuid,uuid,text) to service_role;
grant execute on function public.complete_billing_intent(uuid,text,text,timestamptz,timestamptz) to service_role;
