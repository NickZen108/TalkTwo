-- Generous abuse-only server limits. These are not intended as normal product
-- quotas; they cap pathological successful-send floods that would otherwise create
-- unbounded message rows and push jobs. Idempotent retries and fan-out rows for the
-- same logical message do not consume extra quota. Per-chat buckets are per sender
-- so one participant cannot exhaust another participant's send allowance.

create table if not exists public.message_send_rate_buckets (
  scope_kind text not null check (scope_kind in ('user_day','relationship_10m')),
  scope_id uuid not null,
  actor_id uuid not null,
  bucket_start timestamptz not null,
  message_count integer not null default 0 check (message_count between 0 and 100000),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key(scope_kind,scope_id,actor_id,bucket_start)
);

alter table public.message_send_rate_buckets enable row level security;
revoke all on table public.message_send_rate_buckets from public,anon,authenticated;
grant select,insert,update,delete on table public.message_send_rate_buckets to service_role;

create or replace function private.enforce_message_flood_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz:=pg_catalog.now();
  ten_minute_bucket timestamptz;
  day_bucket timestamptz;
  relationship_count integer;
  user_count integer;
begin
  if new.sender_id is null or new.relationship_id is null or new.logical_id is null then
    raise exception 'Message rate identity is incomplete';
  end if;

  -- A second recipient row for the same logical message is fan-out, not a new
  -- user action. Retry-safe RPCs return before inserting, but keep this invariant
  -- at the storage boundary as well.
  if exists(
    select 1 from public.messages m
     where m.sender_id=new.sender_id and m.logical_id=new.logical_id
  ) then
    return new;
  end if;

  ten_minute_bucket:=pg_catalog.to_timestamp(
    floor(extract(epoch from now_at)/600)*600
  );
  day_bucket:=(date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC');

  insert into public.message_send_rate_buckets(
    scope_kind,scope_id,actor_id,bucket_start,message_count
  ) values(
    'relationship_10m',new.relationship_id,new.sender_id,ten_minute_bucket,1
  )
  on conflict(scope_kind,scope_id,actor_id,bucket_start) do update
     set message_count=public.message_send_rate_buckets.message_count+1,
         updated_at=pg_catalog.now()
  returning message_count into relationship_count;

  if relationship_count>40 then
    raise exception 'Too many messages were sent to this chat recently. Try again later.';
  end if;

  insert into public.message_send_rate_buckets(
    scope_kind,scope_id,actor_id,bucket_start,message_count
  ) values(
    'user_day',new.sender_id,new.sender_id,day_bucket,1
  )
  on conflict(scope_kind,scope_id,actor_id,bucket_start) do update
     set message_count=public.message_send_rate_buckets.message_count+1,
         updated_at=pg_catalog.now()
  returning message_count into user_count;

  if user_count>300 then
    raise exception 'Daily message safety limit reached. Try again tomorrow.';
  end if;

  -- Keep the service-only bucket table bounded without global scans.
  delete from public.message_send_rate_buckets b
   where b.bucket_start<now_at-interval '3 days'
     and b.actor_id=new.sender_id
     and (
       (b.scope_kind='user_day' and b.scope_id=new.sender_id)
       or (b.scope_kind='relationship_10m' and b.scope_id=new.relationship_id)
     );
  return new;
end;
$$;

revoke execute on function private.enforce_message_flood_limit() from public,anon,authenticated,service_role;

drop trigger if exists enforce_message_flood_limit on public.messages;
create trigger enforce_message_flood_limit
before insert on public.messages
for each row execute function private.enforce_message_flood_limit();
