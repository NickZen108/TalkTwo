-- A recovery request is temporary authority to receive a conversation key.
-- Membership at request creation is not enough: if the requester loses access
-- before fulfillment/retrieval, the outstanding request must become unusable.

create or replace function public.get_key_recovery_request_for_approval(recovery_token text)
returns table(request_id uuid, relationship_id uuid, requester_id uuid, requester_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.relationship_id, q.requester_id,
         coalesce(nullif(pg_catalog.btrim(p.display_name), ''), 'Chat member'), q.expires_at
  from public.relationship_key_recovery_requests q
  join public.relationships r on r.id=q.relationship_id and r.status='active'
  join public.profiles p on p.id=q.requester_id
  join public.relationship_members requester
    on requester.relationship_id=q.relationship_id and requester.user_id=q.requester_id
  where q.token=pg_catalog.btrim(recovery_token)
    and q.status='pending'
    and q.expires_at>pg_catalog.now()
    and q.requester_id<>(select auth.uid())
    and exists(
      select 1 from public.relationship_members approver
      where approver.relationship_id=q.relationship_id
        and approver.user_id=(select auth.uid())
    );
$$;

create or replace function public.fulfill_key_recovery_request(recovery_token text, recovery_envelope text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  request public.relationship_key_recovery_requests%rowtype;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if recovery_envelope is null or pg_catalog.length(recovery_envelope)<20
     or pg_catalog.length(recovery_envelope)>4096 then
    raise exception 'Invalid key envelope';
  end if;

  select * into request
    from public.relationship_key_recovery_requests q
   where q.token=pg_catalog.btrim(recovery_token)
   for update;
  if not found or request.status<>'pending' or request.expires_at<=pg_catalog.now() then
    raise exception 'Invalid or expired recovery request';
  end if;
  if request.requester_id=caller then
    raise exception 'A different chat member must approve recovery';
  end if;

  -- Both sides must still be members of the same active relationship at the
  -- instant the key envelope is created. Losing membership revokes outstanding
  -- recovery authority even though the bearer token has not yet expired.
  if not exists(
    select 1
      from public.relationships r
      join public.relationship_members requester
        on requester.relationship_id=r.id and requester.user_id=request.requester_id
      join public.relationship_members approver
        on approver.relationship_id=r.id and approver.user_id=caller
     where r.id=request.relationship_id and r.status='active'
  ) then
    raise exception 'Both recovery participants must still be active relationship members';
  end if;

  update public.relationship_key_recovery_requests
     set status='fulfilled', key_envelope=recovery_envelope,
         fulfilled_by=caller, fulfilled_at=pg_catalog.now()
   where id=request.id;
  return true;
end;
$$;

create or replace function public.list_my_key_recovery_requests()
returns table(request_id uuid, relationship_id uuid, token text, status text, key_envelope text, expires_at timestamptz, fulfilled_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.relationship_id, q.token, q.status, q.key_envelope,
         q.expires_at, q.fulfilled_at
    from public.relationship_key_recovery_requests q
    join public.relationships r on r.id=q.relationship_id and r.status='active'
    join public.relationship_members requester
      on requester.relationship_id=q.relationship_id
     and requester.user_id=q.requester_id
   where q.requester_id=(select auth.uid())
     and q.expires_at>pg_catalog.now()
   order by q.created_at desc
   limit 20;
$$;

revoke execute on function public.get_key_recovery_request_for_approval(text) from public,anon;
revoke execute on function public.fulfill_key_recovery_request(text,text) from public,anon;
revoke execute on function public.list_my_key_recovery_requests() from public,anon;
grant execute on function public.get_key_recovery_request_for_approval(text) to authenticated;
grant execute on function public.fulfill_key_recovery_request(text,text) to authenticated;
grant execute on function public.list_my_key_recovery_requests() to authenticated;
