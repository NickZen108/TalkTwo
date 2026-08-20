-- Run after the private push notification migration, inside a transaction that is rolled back.

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
('30000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push-sender@example.invalid', '', now(), now(), now()),
('30000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'push-recipient@example.invalid', '', now(), now(), now());

insert into public.profiles(id, display_name) values
('30000000-0000-4000-8000-000000000001', 'Push Sender'),
('30000000-0000-4000-8000-000000000002', 'Push Recipient')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.relationships(id, created_by, status)
values ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'active');
insert into public.relationship_members(relationship_id, user_id, role) values
('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'participant'),
('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'participant');

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select public.register_push_device('ExponentPushToken[abcdefghijklmnopqrstuv]', 'ios');

do $test$
begin
  begin
    perform 1 from public.push_devices;
    raise exception 'authenticated direct token read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$test$;
reset role;

insert into public.messages(
  id, logical_id, relationship_id, sender_id, recipient_id, body, body_hash,
  ciphertext, risk_level, created_at, available_at, blocked_for_recipient
) values (
  '50000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002', 'Private message body', repeat('a', 64),
  'ciphertext', 'green', now(), now() + interval '1 hour', false
);

do $test$
declare claimed integer;
begin
  select count(*) into claimed from public.claim_due_push_jobs(100);
  if claimed <> 0 then raise exception 'future-window push was claimed early'; end if;
  if not exists(
    select 1 from public.push_notification_jobs
    where message_id = '50000000-0000-4000-8000-000000000001' and status = 'pending'
  ) then raise exception 'message did not create a pending push job'; end if;
end
$test$;

update public.messages set available_at = now() - interval '1 minute'
where id = '50000000-0000-4000-8000-000000000001';
update public.push_notification_jobs set available_at = now() - interval '1 minute', next_attempt_at = now() - interval '1 minute'
where message_id = '50000000-0000-4000-8000-000000000001';

do $test$
declare claimed record; receipt record;
begin
  select * into claimed from public.claim_due_push_jobs(100);
  if claimed.expo_push_token <> 'ExponentPushToken[abcdefghijklmnopqrstuv]' then
    raise exception 'due push token was not claimed';
  end if;
  perform public.record_push_ticket(claimed.job_id, 'ticket-1', null);
  update public.push_notification_jobs set ticketed_at = now() - interval '6 minutes'
  where id = claimed.job_id;
  select * into receipt from public.list_pending_push_receipts(1000);
  if receipt.ticket_id <> 'ticket-1' then raise exception 'ticket was not available for receipt checking'; end if;
  perform public.record_push_receipt(claimed.job_id, 'error', 'DeviceNotRegistered');
  if not exists(select 1 from public.push_notification_jobs where id = claimed.job_id and status = 'failed') then
    raise exception 'permanent receipt failure did not fail the job';
  end if;
  if exists(select 1 from public.push_devices where expo_push_token = claimed.expo_push_token and enabled) then
    raise exception 'invalid device token remained enabled';
  end if;
end
$test$;

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
set local role authenticated;
select public.register_push_device('ExpoPushToken[zyxwvutsrqponmlkjihgfe]', 'android');
reset role;

insert into public.messages(
  id, logical_id, relationship_id, sender_id, recipient_id, body, body_hash,
  ciphertext, risk_level, created_at, available_at, blocked_for_recipient
) values (
  '50000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002', 'Another private body', repeat('b', 64),
  'ciphertext', 'green', now(), now() + interval '1 hour', false
);

select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select public.register_push_device('ExpoPushToken[zyxwvutsrqponmlkjihgfe]', 'android');
reset role;

do $test$
begin
  if not exists(
    select 1 from public.push_notification_jobs j
    join public.push_devices d on d.id = j.device_id
    where d.expo_push_token = 'ExpoPushToken[zyxwvutsrqponmlkjihgfe]'
      and j.status = 'cancelled'
      and j.last_error = 'Device token rebound to another signed-in account'
  ) then raise exception 'account switch did not cancel old notification work'; end if;
end
$test$;

select 'push notification migration behavior passed' as result;
