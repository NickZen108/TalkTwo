-- Privacy-safe push registration and a window-aware server outbox.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_registered_at timestamptz not null default now(),
  last_success_at timestamptz,
  invalidated_at timestamptz,
  check (expo_push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$')
);

create index if not exists push_devices_active_user_idx
  on public.push_devices(user_id) where enabled;

create table if not exists public.push_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  device_id uuid not null references public.push_devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  available_at timestamptz not null,
  next_attempt_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ticketed', 'delivered', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  locked_at timestamptz,
  ticket_id text,
  ticketed_at timestamptz,
  receipt_checked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(message_id, device_id)
);

create index if not exists push_notification_jobs_due_idx
  on public.push_notification_jobs(next_attempt_at, available_at)
  where status = 'pending';
create index if not exists push_notification_jobs_receipt_idx
  on public.push_notification_jobs(ticketed_at, receipt_checked_at)
  where status = 'ticketed';

alter table public.push_devices enable row level security;
alter table public.push_notification_jobs enable row level security;
revoke all on table public.push_devices from public, anon, authenticated;
revoke all on table public.push_notification_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.push_devices to service_role;
grant select, insert, update, delete on table public.push_notification_jobs to service_role;

create or replace function public.register_push_device(expo_token text, device_platform text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean_token text := trim(coalesce(expo_token, ''));
  existing_device public.push_devices%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if clean_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'Invalid Expo push token';
  end if;
  if device_platform not in ('ios', 'android') then raise exception 'Invalid device platform'; end if;

  select * into existing_device from public.push_devices d
  where d.expo_push_token = clean_token for update;
  if existing_device.id is not null and existing_device.user_id <> uid then
    update public.push_notification_jobs
    set status = 'cancelled', last_error = 'Device token rebound to another signed-in account', updated_at = now()
    where device_id = existing_device.id and status in ('pending', 'processing', 'ticketed');
  end if;

  insert into public.push_devices(user_id, expo_push_token, platform)
  values(uid, clean_token, device_platform)
  on conflict(expo_push_token) do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    enabled = true,
    last_registered_at = now(),
    invalidated_at = null;
  return true;
end
$$;

create or replace function public.is_push_device_registered(expo_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.push_devices d
    where d.user_id = (select auth.uid())
      and d.expo_push_token = trim(coalesce(expo_token, ''))
      and d.enabled
  );
$$;

create or replace function public.disable_push_device(expo_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.push_devices d
  set enabled = false, invalidated_at = now()
  where d.user_id = (select auth.uid())
    and d.expo_push_token = trim(coalesce(expo_token, ''));
  get diagnostics changed = row_count;
  return changed > 0;
end
$$;

create or replace function private.queue_message_push()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.blocked_for_recipient then return new; end if;
  insert into public.push_notification_jobs(message_id, device_id, user_id, available_at, next_attempt_at)
  select new.id, d.id, new.recipient_id, new.available_at, new.available_at
  from public.push_devices d
  where d.user_id = new.recipient_id and d.enabled
  on conflict(message_id, device_id) do nothing;
  return new;
end
$$;

drop trigger if exists queue_message_push on public.messages;
create trigger queue_message_push
after insert on public.messages
for each row execute function private.queue_message_push();

create or replace function public.claim_due_push_jobs(batch_limit integer default 100)
returns table(job_id uuid, expo_push_token text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_notification_jobs j
  set status = 'cancelled', updated_at = now(), last_error = 'Message no longer requires notification'
  from public.messages m
  where j.message_id = m.id
    and j.status in ('pending', 'processing')
    and (m.withdrawn_at is not null or m.rejected_at is not null or m.opened_at is not null or m.blocked_for_recipient);

  update public.push_notification_jobs j
  set status = case when j.attempt_count >= 4 then 'failed' else 'pending' end,
      next_attempt_at = now(), locked_at = null, updated_at = now(),
      last_error = 'Recovered stale dispatcher lock'
  where j.status = 'processing' and j.locked_at < now() - interval '5 minutes';

  update public.push_notification_jobs j
  set status = 'cancelled', updated_at = now(), last_error = 'Device notifications disabled'
  from public.push_devices d
  where j.device_id = d.id and j.status = 'pending' and not d.enabled;

  return query
  with picked as (
    select j.id
    from public.push_notification_jobs j
    join public.messages m on m.id = j.message_id
    join public.push_devices d on d.id = j.device_id
    where j.status = 'pending'
      and j.available_at <= now()
      and j.next_attempt_at <= now()
      and d.enabled
      and m.available_at <= now()
      and m.withdrawn_at is null and m.rejected_at is null and m.opened_at is null
      and not m.blocked_for_recipient
    order by j.available_at, j.id
    limit greatest(1, least(coalesce(batch_limit, 100), 100))
    for update of j skip locked
  ), claimed as (
    update public.push_notification_jobs j
    set status = 'processing', attempt_count = j.attempt_count + 1,
        locked_at = now(), updated_at = now()
    from picked p
    where j.id = p.id
    returning j.id, j.device_id
  )
  select c.id, d.expo_push_token
  from claimed c join public.push_devices d on d.id = c.device_id;
end
$$;

create or replace function public.record_push_ticket(target_job uuid, provider_ticket text, error_code text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare job public.push_notification_jobs%rowtype;
begin
  select * into job from public.push_notification_jobs where id = target_job for update;
  if job.id is null or job.status <> 'processing' then return false; end if;
  if provider_ticket is not null and provider_ticket <> '' and error_code is null then
    update public.push_notification_jobs set status = 'ticketed', ticket_id = provider_ticket,
      ticketed_at = now(), locked_at = null, last_error = null, updated_at = now()
    where id = target_job;
  elsif error_code = 'DeviceNotRegistered' then
    update public.push_notification_jobs set status = 'failed', locked_at = null,
      last_error = left(error_code, 200), updated_at = now() where id = target_job;
    update public.push_devices set enabled = false, invalidated_at = now() where id = job.device_id;
  else
    update public.push_notification_jobs set
      status = case when attempt_count >= 4 then 'failed' else 'pending' end,
      next_attempt_at = now() + make_interval(mins => least(30, (2 ^ greatest(0, attempt_count - 1))::integer)),
      locked_at = null, last_error = left(coalesce(error_code, 'Push service error'), 200), updated_at = now()
    where id = target_job;
  end if;
  return true;
end
$$;

create or replace function public.list_pending_push_receipts(batch_limit integer default 1000)
returns table(job_id uuid, ticket_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select j.id
    from public.push_notification_jobs j
    where j.status = 'ticketed'
      and j.ticketed_at <= now() - interval '5 minutes'
      and (j.receipt_checked_at is null or j.receipt_checked_at <= now() - interval '10 minutes')
    order by j.ticketed_at, j.id
    limit greatest(1, least(coalesce(batch_limit, 1000), 1000))
    for update skip locked
  ), touched as (
    update public.push_notification_jobs j set receipt_checked_at = now(), updated_at = now()
    from picked p where j.id = p.id
    returning j.id, j.ticket_id
  )
  select t.id, t.ticket_id from touched t where t.ticket_id is not null;
end
$$;

create or replace function public.record_push_receipt(target_job uuid, delivery_status text, error_code text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare job public.push_notification_jobs%rowtype;
declare permanent boolean;
begin
  select * into job from public.push_notification_jobs where id = target_job for update;
  if job.id is null or job.status <> 'ticketed' then return false; end if;
  if delivery_status = 'ok' then
    update public.push_notification_jobs set status = 'delivered', delivered_at = now(),
      last_error = null, updated_at = now() where id = target_job;
    update public.push_devices set last_success_at = now() where id = job.device_id;
    return true;
  end if;

  permanent := error_code in ('DeviceNotRegistered', 'MessageTooBig', 'MismatchSenderId', 'InvalidCredentials');
  update public.push_notification_jobs set
    status = case when permanent or attempt_count >= 4 then 'failed' else 'pending' end,
    ticket_id = case when permanent or attempt_count >= 4 then ticket_id else null end,
    ticketed_at = case when permanent or attempt_count >= 4 then ticketed_at else null end,
    next_attempt_at = now() + interval '5 minutes',
    last_error = left(coalesce(error_code, 'Push delivery error'), 200), updated_at = now()
  where id = target_job;
  if error_code = 'DeviceNotRegistered' then
    update public.push_devices set enabled = false, invalidated_at = now() where id = job.device_id;
  end if;
  return true;
end
$$;

revoke execute on function private.queue_message_push() from public, anon, authenticated, service_role;
revoke execute on function public.register_push_device(text, text) from public, anon;
revoke execute on function public.is_push_device_registered(text) from public, anon;
revoke execute on function public.disable_push_device(text) from public, anon;
grant execute on function public.register_push_device(text, text) to authenticated, service_role;
grant execute on function public.is_push_device_registered(text) to authenticated, service_role;
grant execute on function public.disable_push_device(text) to authenticated, service_role;

revoke execute on function public.claim_due_push_jobs(integer) from public, anon, authenticated;
revoke execute on function public.record_push_ticket(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.list_pending_push_receipts(integer) from public, anon, authenticated;
revoke execute on function public.record_push_receipt(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_due_push_jobs(integer) to service_role;
grant execute on function public.record_push_ticket(uuid, text, text) to service_role;
grant execute on function public.list_pending_push_receipts(integer) to service_role;
grant execute on function public.record_push_receipt(uuid, text, text) to service_role;
