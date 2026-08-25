-- Do not let a user supersede an upgrade after the native store replacement has
-- started. A second request at that point could leave an already-authorized store
-- charge detached from the approval request that authorized it.

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

  if exists(
    select 1 from public.member_write_upgrade_requests r
     where r.relationship_id=rel_id and r.member_user_id=uid
       and r.status='checkout_pending' and r.expires_at>pg_catalog.now()
  ) then raise exception 'A store upgrade is already in progress'; end if;

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

  -- Supersede only pre-checkout approval/payment requests. Expired checkout rows
  -- can be expired safely because their request authorization has elapsed.
  update public.member_write_upgrade_requests
     set status='expired'
   where relationship_id=rel_id and member_user_id=uid
     and (
       status in ('awaiting_approvals','awaiting_payment')
       or (status='checkout_pending' and expires_at<=pg_catalog.now())
     );

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

revoke execute on function public.create_member_write_upgrade_request(uuid) from public,anon;
grant execute on function public.create_member_write_upgrade_request(uuid) to authenticated;
