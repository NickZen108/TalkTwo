-- Once the store checkout starts, the unanimously approved member set becomes the
-- authorization snapshot for that purchase. A person joining the chat while the
-- external store sheet is processing must not retroactively turn a paid purchase
-- into an authorization failure.

create or replace function private.member_write_upgrade_checkout_snapshot_approved(req_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists(
    select 1 from public.member_write_upgrade_approvals a where a.request_id=req_id
  )
  and not exists(
    select 1 from public.member_write_upgrade_approvals a
     where a.request_id=req_id and a.decision is distinct from true
  );
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
  if not private.member_write_upgrade_checkout_snapshot_approved(request.id) then
    raise exception 'The write-access approval snapshot is incomplete';
  end if;

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

revoke execute on function private.member_write_upgrade_checkout_snapshot_approved(uuid) from public,anon,authenticated,service_role;
revoke execute on function public.confirm_verified_member_write_upgrade(uuid,uuid,text,text,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.confirm_verified_member_write_upgrade(uuid,uuid,text,text,text,timestamptz,timestamptz) to service_role;
