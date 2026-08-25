-- A native store sheet can be interrupted by app termination, OS reclaim or a
-- device restart. Re-opening the approved upgrade must reuse the same live intent
-- rather than create a second concurrent authorization.

create or replace function public.create_member_upgrade_checkout_intent(rel_id uuid)
returns table(intent_id uuid, amount_minor integer, currency text, recurring boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  request public.member_write_upgrade_requests%rowtype;
  existing_intent public.billing_checkout_intents%rowtype;
  expiry timestamptz := pg_catalog.now()+interval '30 minutes';
  new_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('talktwo:write-upgrade:'||rel_id::text||':'||uid::text,0));

  select * into request
    from public.member_write_upgrade_requests r
   where r.relationship_id=rel_id and r.member_user_id=uid
     and r.status in ('awaiting_payment','checkout_pending')
     and r.expires_at>pg_catalog.now()
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

  if request.status='checkout_pending' then
    select * into existing_intent
      from public.billing_checkout_intents i
     where i.upgrade_request_id=request.id and i.user_id=uid
       and i.kind='extra_member_start' and i.status='created'
       and i.completed_at is null and i.expires_at>pg_catalog.now()
     order by i.created_at desc limit 1 for update;
    if found then
      return query select existing_intent.id,9900,'dkk'::text,true,existing_intent.expires_at;
      return;
    end if;
    -- No live provider authorization exists, so the approved request may safely
    -- return to the pre-checkout state and issue one new intent below.
    update public.member_write_upgrade_requests set status='awaiting_payment' where id=request.id;
    request.status:='awaiting_payment';
  end if;

  update public.billing_checkout_intents
     set status=case when expires_at<=pg_catalog.now() then 'expired' else 'cancelled' end,
         updated_at=pg_catalog.now()
   where user_id=uid and upgrade_request_id=request.id
     and status='created' and completed_at is null;

  insert into public.billing_checkout_intents(
    user_id,kind,relationship_id,member_user_id,upgrade_request_id,
    amount_minor,currency,recurring,expires_at
  ) values(uid,'extra_member_start',rel_id,uid,request.id,9900,'dkk',true,expiry)
  returning id into new_id;
  update public.member_write_upgrade_requests set status='checkout_pending' where id=request.id;
  return query select new_id,9900,'dkk'::text,true,expiry;
end;
$$;

revoke execute on function public.create_member_upgrade_checkout_intent(uuid) from public,anon;
grant execute on function public.create_member_upgrade_checkout_intent(uuid) to authenticated;
