create table if not exists public.relationship_key_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  token text not null default encode(gen_random_bytes(32), 'hex') unique,
  status text not null default 'pending' check (status in ('pending', 'fulfilled')),
  key_envelope text,
  fulfilled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null default (pg_catalog.now() + interval '24 hours'),
  fulfilled_at timestamptz,
  check (length(token) between 32 and 256),
  check (key_envelope is null or length(key_envelope) between 20 and 4096),
  check ((status = 'pending' and key_envelope is null and fulfilled_at is null)
      or (status = 'fulfilled' and key_envelope is not null and fulfilled_at is not null))
);

create index if not exists relationship_key_recovery_requester_idx
  on public.relationship_key_recovery_requests (requester_id, created_at desc);
create index if not exists relationship_key_recovery_pending_idx
  on public.relationship_key_recovery_requests (relationship_id, expires_at)
  where status = 'pending';

alter table public.relationship_key_recovery_requests enable row level security;
revoke all on table public.relationship_key_recovery_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.relationship_key_recovery_requests to service_role;

create or replace function public.create_key_recovery_request(rel_id uuid)
returns table(request_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  created public.relationship_key_recovery_requests%rowtype;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.relationships r
    join public.relationship_members m on m.relationship_id = r.id
    where r.id = rel_id and r.status = 'active' and m.user_id = caller
  ) then raise exception 'Active relationship membership required'; end if;
  if (
    select count(*) from public.relationship_key_recovery_requests q
    where q.requester_id = caller and q.created_at > pg_catalog.now() - interval '1 hour'
  ) >= 5 then raise exception 'Too many recovery requests'; end if;

  delete from public.relationship_key_recovery_requests q
   where q.requester_id = caller and q.relationship_id = rel_id;
  insert into public.relationship_key_recovery_requests(relationship_id, requester_id)
  values (rel_id, caller)
  returning * into created;
  return query select created.id, created.token, created.expires_at;
end;
$$;

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
  join public.profiles p on p.id = q.requester_id
  where q.token = pg_catalog.btrim(recovery_token)
    and q.status = 'pending'
    and q.expires_at > pg_catalog.now()
    and q.requester_id <> auth.uid()
    and exists (
      select 1 from public.relationship_members m
      where m.relationship_id = q.relationship_id and m.user_id = auth.uid()
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
  if recovery_envelope is null or length(recovery_envelope) < 20 or length(recovery_envelope) > 4096 then
    raise exception 'Invalid key envelope';
  end if;
  select * into request from public.relationship_key_recovery_requests q
   where q.token = pg_catalog.btrim(recovery_token) for update;
  if not found or request.status <> 'pending' or request.expires_at <= pg_catalog.now() then
    raise exception 'Invalid or expired recovery request';
  end if;
  if request.requester_id = caller then raise exception 'A different chat member must approve recovery'; end if;
  if not exists (
    select 1 from public.relationship_members m
    where m.relationship_id = request.relationship_id and m.user_id = caller
  ) then raise exception 'Relationship membership required'; end if;

  update public.relationship_key_recovery_requests
     set status = 'fulfilled', key_envelope = recovery_envelope,
         fulfilled_by = caller, fulfilled_at = pg_catalog.now()
   where id = request.id;
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
  select q.id, q.relationship_id, q.token, q.status, q.key_envelope, q.expires_at, q.fulfilled_at
  from public.relationship_key_recovery_requests q
  where q.requester_id = auth.uid() and q.expires_at > pg_catalog.now()
  order by q.created_at desc
  limit 20;
$$;

create or replace function public.complete_key_recovery_request(recovery_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.relationship_key_recovery_requests q
   where q.id = recovery_id and q.requester_id = auth.uid() and q.status = 'fulfilled';
  return found;
end;
$$;

create or replace function public.cancel_key_recovery_request(recovery_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.relationship_key_recovery_requests q
   where q.id = recovery_id and q.requester_id = auth.uid();
  return found;
end;
$$;

revoke execute on function public.create_key_recovery_request(uuid) from public, anon;
revoke execute on function public.get_key_recovery_request_for_approval(text) from public, anon;
revoke execute on function public.fulfill_key_recovery_request(text, text) from public, anon;
revoke execute on function public.list_my_key_recovery_requests() from public, anon;
revoke execute on function public.complete_key_recovery_request(uuid) from public, anon;
revoke execute on function public.cancel_key_recovery_request(uuid) from public, anon;
grant execute on function public.create_key_recovery_request(uuid) to authenticated;
grant execute on function public.get_key_recovery_request_for_approval(text) to authenticated;
grant execute on function public.fulfill_key_recovery_request(text, text) to authenticated;
grant execute on function public.list_my_key_recovery_requests() to authenticated;
grant execute on function public.complete_key_recovery_request(uuid) to authenticated;
grant execute on function public.cancel_key_recovery_request(uuid) to authenticated;
