-- Make the monthly AI hard limit fail-safe under concurrent requests and cost-log failures.
-- A reservation is created before the provider call. Successful calls atomically
-- become ai_cost_events; an unsettled committed reservation remains counted
-- conservatively instead of silently understating spend.

create table if not exists public.ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  relationship_id uuid references public.relationships(id) on delete set null,
  model text not null,
  reserved_cost_usd numeric(12,6) not null check (reserved_cost_usd > 0 and reserved_cost_usd <= 1),
  committed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists ai_budget_reservations_month_idx
  on public.ai_budget_reservations (created_at);

alter table public.ai_budget_reservations enable row level security;
revoke all on table public.ai_budget_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_budget_reservations to service_role;

create or replace function public.reserve_ai_budget_call(
  target_user uuid,
  target_relationship uuid,
  target_model text,
  reserve_usd numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  budget public.ai_budget_settings%rowtype;
  actual_spend numeric;
  reserved_spend numeric;
  reservation_id uuid;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if target_user is null then raise exception 'User required'; end if;
  if target_model is null or trim(target_model) = '' then raise exception 'Model required'; end if;
  if reserve_usd is null or reserve_usd <= 0 or reserve_usd > 1 then
    raise exception 'Invalid AI budget reservation';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'talktwo:ai-budget:' || pg_catalog.to_char(pg_catalog.now(), 'YYYY-MM'), 0
    )
  );

  select * into budget from public.ai_budget_settings where id = 1 for update;
  if not found then raise exception 'AI budget settings missing'; end if;

  select coalesce(sum(e.estimated_cost_usd), 0)::numeric
    into actual_spend
    from public.ai_cost_events e
   where e.created_at >= pg_catalog.date_trunc('month', pg_catalog.now())
     and e.created_at < pg_catalog.date_trunc('month', pg_catalog.now()) + interval '1 month';

  select coalesce(sum(r.reserved_cost_usd), 0)::numeric
    into reserved_spend
    from public.ai_budget_reservations r
   where r.created_at >= pg_catalog.date_trunc('month', pg_catalog.now())
     and r.created_at < pg_catalog.date_trunc('month', pg_catalog.now()) + interval '1 month'
     and (r.committed_at is not null or r.created_at >= pg_catalog.now() - interval '5 minutes');

  if budget.enabled and actual_spend + reserved_spend + reserve_usd > budget.monthly_hard_limit_usd then
    raise exception 'AI monthly hard limit reached';
  end if;

  insert into public.ai_budget_reservations (
    user_id, relationship_id, model, reserved_cost_usd
  ) values (
    target_user, target_relationship, trim(target_model), reserve_usd
  ) returning id into reservation_id;

  return reservation_id;
end;
$$;

create or replace function public.commit_ai_budget_call(reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  update public.ai_budget_reservations
     set committed_at = coalesce(committed_at, pg_catalog.now())
   where id = reservation_id;
  return found;
end;
$$;

create or replace function public.release_ai_budget_call(reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  delete from public.ai_budget_reservations where id = reservation_id;
  return found;
end;
$$;

create or replace function public.finalize_ai_budget_call(
  reservation_id uuid,
  actual_input_tokens integer,
  actual_output_tokens integer,
  actual_cost_usd numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.ai_budget_reservations%rowtype;
  event_id uuid;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Service role required';
  end if;
  if actual_input_tokens < 0 or actual_output_tokens < 0 or actual_cost_usd < 0 then
    raise exception 'Invalid AI usage';
  end if;

  select * into reservation
    from public.ai_budget_reservations
   where id = reservation_id
   for update;
  if not found then raise exception 'AI budget reservation not found'; end if;
  if reservation.committed_at is null then raise exception 'AI budget reservation was not committed'; end if;

  insert into public.ai_cost_events (
    user_id, relationship_id, model,
    input_tokens, output_tokens, estimated_cost_usd
  ) values (
    reservation.user_id, reservation.relationship_id, reservation.model,
    actual_input_tokens, actual_output_tokens, actual_cost_usd
  ) returning id into event_id;

  delete from public.ai_budget_reservations where id = reservation.id;
  return event_id;
end;
$$;

create or replace function public.get_ai_budget_status()
returns table(
  monthly_spend_usd numeric,
  warning_threshold_usd numeric,
  monthly_hard_limit_usd numeric,
  warning_reached boolean,
  allowed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with actual as (
    select coalesce(sum(e.estimated_cost_usd), 0)::numeric as spend
      from public.ai_cost_events e
     where e.created_at >= pg_catalog.date_trunc('month', pg_catalog.now())
       and e.created_at < pg_catalog.date_trunc('month', pg_catalog.now()) + interval '1 month'
  ), reserved as (
    select coalesce(sum(r.reserved_cost_usd), 0)::numeric as spend
      from public.ai_budget_reservations r
     where r.created_at >= pg_catalog.date_trunc('month', pg_catalog.now())
       and r.created_at < pg_catalog.date_trunc('month', pg_catalog.now()) + interval '1 month'
       and (r.committed_at is not null or r.created_at >= pg_catalog.now() - interval '5 minutes')
  )
  select actual.spend + reserved.spend,
         b.warning_threshold_usd,
         b.monthly_hard_limit_usd,
         actual.spend + reserved.spend >= b.warning_threshold_usd,
         (not b.enabled) or actual.spend + reserved.spend < b.monthly_hard_limit_usd
    from actual cross join reserved cross join public.ai_budget_settings b
   where b.id = 1;
$$;

revoke execute on function public.reserve_ai_budget_call(uuid, uuid, text, numeric)
  from public, anon, authenticated;
revoke execute on function public.commit_ai_budget_call(uuid)
  from public, anon, authenticated;
revoke execute on function public.release_ai_budget_call(uuid)
  from public, anon, authenticated;
revoke execute on function public.finalize_ai_budget_call(uuid, integer, integer, numeric)
  from public, anon, authenticated;
revoke execute on function public.get_ai_budget_status()
  from public, anon, authenticated;

grant execute on function public.reserve_ai_budget_call(uuid, uuid, text, numeric) to service_role;
grant execute on function public.commit_ai_budget_call(uuid) to service_role;
grant execute on function public.release_ai_budget_call(uuid) to service_role;
grant execute on function public.finalize_ai_budget_call(uuid, integer, integer, numeric) to service_role;
grant execute on function public.get_ai_budget_status() to service_role;
