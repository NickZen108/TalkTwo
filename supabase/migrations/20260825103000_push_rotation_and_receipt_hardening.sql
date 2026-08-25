-- Make Expo token rotation atomic and bound receipt polling. Push delivery is
-- best-effort and provider-at-least-once, so the database must avoid orphaned old
-- tokens and unbounded receipt polling while never turning an unknown ticket into
-- a new send merely because a receipt was unavailable.

create or replace function public.rotate_push_device(
  previous_expo_token text,
  next_expo_token text,
  device_platform text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid:=(select auth.uid());
  previous_token text:=trim(coalesce(previous_expo_token,''));
  next_token text:=trim(coalesce(next_expo_token,''));
  next_device public.push_devices%rowtype;
  old_device_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if next_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'Invalid Expo push token';
  end if;
  if previous_token<>'' and previous_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'Invalid previous Expo push token';
  end if;
  if device_platform not in ('ios','android') then raise exception 'Invalid device platform'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:push-token:'||next_token,0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('talktwo:push-user:'||uid::text,0)
  );

  select * into next_device
    from public.push_devices d
   where d.expo_push_token=next_token
   for update;
  if found and next_device.user_id<>uid then
    update public.push_notification_jobs j
       set status='cancelled',locked_at=null,updated_at=pg_catalog.now(),
           last_error='Device token rebound to another signed-in account'
     where j.device_id=next_device.id
       and j.status in ('pending','processing','ticketed');
  end if;

  insert into public.push_devices(user_id,expo_push_token,platform)
  values(uid,next_token,device_platform)
  on conflict(expo_push_token) do update set
    user_id=excluded.user_id,
    platform=excluded.platform,
    enabled=true,
    last_registered_at=pg_catalog.now(),
    invalidated_at=null;

  if previous_token<>'' and previous_token<>next_token then
    select d.id into old_device_id
      from public.push_devices d
     where d.user_id=uid and d.expo_push_token=previous_token
     for update;
    if old_device_id is not null then
      update public.push_devices d
         set enabled=false,invalidated_at=pg_catalog.now()
       where d.id=old_device_id;
      update public.push_notification_jobs j
         set status='cancelled',locked_at=null,updated_at=pg_catalog.now(),
             last_error='Device token replaced by refreshed token'
       where j.device_id=old_device_id
         and j.status in ('pending','processing','ticketed');
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.register_push_device(expo_token text,device_platform text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.rotate_push_device(null,expo_token,device_platform);
end;
$$;

revoke execute on function public.rotate_push_device(text,text,text) from public,anon;
revoke execute on function public.register_push_device(text,text) from public,anon;
grant execute on function public.rotate_push_device(text,text,text) to authenticated,service_role;
grant execute on function public.register_push_device(text,text) to authenticated,service_role;

create or replace function public.list_pending_push_receipts(batch_limit integer default 1000)
returns table(job_id uuid,ticket_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A ticket means Expo accepted the send. If its receipt never becomes
  -- available, do not convert that uncertainty into a resend: stop polling after
  -- 24h and keep the operational failure distinct from a fresh pending send.
  update public.push_notification_jobs j
     set status='failed',
         receipt_checked_at=pg_catalog.now(),
         last_error='Push receipt unavailable after 24 hours',
         updated_at=pg_catalog.now()
   where j.status='ticketed'
     and j.ticketed_at < pg_catalog.now()-interval '24 hours';

  return query
  with picked as (
    select j.id
      from public.push_notification_jobs j
     where j.status='ticketed'
       and j.ticketed_at<=pg_catalog.now()-interval '5 minutes'
       and j.ticketed_at>=pg_catalog.now()-interval '24 hours'
       and (j.receipt_checked_at is null or j.receipt_checked_at<=pg_catalog.now()-interval '10 minutes')
     order by j.ticketed_at,j.id
     limit greatest(1,least(coalesce(batch_limit,1000),1000))
     for update skip locked
  ), touched as (
    update public.push_notification_jobs j
       set receipt_checked_at=pg_catalog.now(),updated_at=pg_catalog.now()
      from picked p
     where j.id=p.id
    returning j.id,j.ticket_id
  )
  select t.id,t.ticket_id from touched t where t.ticket_id is not null;
end;
$$;

revoke execute on function public.list_pending_push_receipts(integer) from public,anon,authenticated;
grant execute on function public.list_pending_push_receipts(integer) to service_role;
