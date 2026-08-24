-- Muting/blocking is a request for quiet now, not merely for future queueing.
-- This migration runs after the private-push migration in lexical release order.

create or replace function public.set_member_block(rel_id uuid, target_user uuid, blocked boolean, block_minutes integer default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
declare block_until timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_user=uid then raise exception 'You cannot block yourself'; end if;
  if not exists(select 1 from public.relationship_members where relationship_id=rel_id and user_id=uid) then raise exception 'Not a relationship member'; end if;
  if not exists(select 1 from public.relationship_members where relationship_id=rel_id and user_id=target_user) then raise exception 'Target is not a relationship member'; end if;

  if blocked then
    if block_minutes is not null and block_minutes not in (60,240,1440) then
      raise exception 'Block duration must be 1 hour, 4 hours, 24 hours, or indefinite';
    end if;
    block_until := case when block_minutes is null then null else now() + make_interval(mins => block_minutes) end;
    insert into public.relationship_blocks(relationship_id,blocker_id,blocked_user_id,blocked_at,expires_at)
      values(rel_id,uid,target_user,now(),block_until)
      on conflict(relationship_id,blocker_id,blocked_user_id)
      do update set blocked_at=now(),expires_at=excluded.expires_at;

    update public.messages
    set blocked_for_recipient=true
    where relationship_id=rel_id and recipient_id=uid and sender_id=target_user
      and opened_at is null and rejected_at is null and withdrawn_at is null;

    update public.push_notification_jobs j
    set status='cancelled',updated_at=now(),last_error='Sender blocked by recipient'
    from public.messages msg
    where j.message_id=msg.id and j.user_id=uid
      and msg.relationship_id=rel_id and msg.sender_id=target_user
      and j.status in ('pending','processing','ticketed');
  else
    delete from public.relationship_blocks
    where relationship_id=rel_id and blocker_id=uid and blocked_user_id=target_user;
  end if;
  return blocked;
end;
$$;

create or replace function public.disable_push_device(expo_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := (select auth.uid());
declare changed integer;
declare device uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select d.id into device
  from public.push_devices d
  where d.user_id=uid and d.expo_push_token=trim(coalesce(expo_token,''));

  update public.push_devices d
  set enabled=false,invalidated_at=now()
  where d.id=device;
  get diagnostics changed=row_count;

  if device is not null then
    update public.push_notification_jobs j
    set status='cancelled',updated_at=now(),last_error='Device notifications disabled by user'
    where j.device_id=device and j.status in ('pending','processing','ticketed');
  end if;
  return changed>0;
end;
$$;

revoke execute on function public.set_member_block(uuid,uuid,boolean,integer) from public,anon;
revoke execute on function public.disable_push_device(text) from public,anon;
grant execute on function public.set_member_block(uuid,uuid,boolean,integer) to authenticated,service_role;
grant execute on function public.disable_push_device(text) to authenticated,service_role;
